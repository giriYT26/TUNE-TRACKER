# Architecture — Tune Tracker

## Overview

Team clients and the host dashboard are both plain browser pages. Both
connect directly to a single Rust backend (`axum` + `tokio`) over WebSocket —
there is no intermediary language or service in the request path. The
backend holds one piece of shared, in-memory state that both connection
types read from and write to.

```
Team app  ──WS──▶  ┌─────────────────────────────┐
                    │   Rust backend (axum/tokio) │
Host app  ◀─WS──▶   │  ┌───────────┐ ┌──────────┐ │
                    │  │WS handler │ │  Buzzer  │ │
                    │  │(per conn.)│◀▶│  state   │ │
                    │  └───────────┘ └──────────┘ │
                    └─────────────────────────────┘
```

The WS handler and the buzzer state are two concerns inside the same
process — the handler decodes/encodes messages, the state is the single
source of truth for round status, buzzer order, and warnings.

## Data model

```rust
struct Team {
    id: TeamId,
    name: String,
    status: TeamStatus,       // Waiting | Answering | Disqualified
    warning_count: u8,
}

struct BuzzerEvent {
    team_id: TeamId,
    position: usize,          // assigned by the server, in arrival order
    server_timestamp: DateTime<Utc>,
}

struct Round {
    id: RoundId,
    state: RoundState,        // Idle | Active | Locked
    buzzer_order: Vec<BuzzerEvent>,
}

struct AppState {
    teams: RwLock<HashMap<TeamId, Team>>,
    current_round: RwLock<Round>,
    tx: broadcast::Sender<ServerMessage>,   // fan-out to all connections
}
```

`AppState` is wrapped in an `Arc` and cloned into every request/WS handler.

## Round state machine

```
Idle ──START──▶ Active ──LOCK──▶ Locked ──NEXT QUESTION──▶ Idle (fresh round)
                                    │
                                 RESET (clears buzzer_order, stays Locked or
                                        returns to Active, host's choice)
```

The critical rule: **only a state transition to `Locked` stops new buzzer
presses being accepted** — never a count check on `buzzer_order.len()`. This
is what guarantees "no automatic first-3 limit."

## WebSocket message protocol

All messages are JSON with a `type` tag.

**Team → server**
```json
{ "type": "join", "team_name": "Team Vibe" }
{ "type": "buzz" }
{ "type": "violation", "kind": "tab_switch" }
```

**Host → server**
```json
{ "type": "start" }
{ "type": "lock" }
{ "type": "reset" }
{ "type": "next_question" }
```

**Server → all clients** (via `broadcast::Sender`)
```json
{
  "type": "buzzer_update",
  "buzzer_order": [
    { "position": 1, "team_name": "Team Vibe", "timestamp": "10:31:25.421" },
    { "position": 2, "team_name": "Team Beat", "timestamp": "10:31:25.638" }
  ]
}
{ "type": "round_state", "state": "Active" }
{ "type": "team_status", "team_name": "Team Vibe", "status": "Disqualified" }
```

Keeping the server → client shape as one broadcast message type per event
(rather than diffs) makes the host dashboard a pure "render whatever I last
received" UI, with no client-side merge logic to get wrong.

## Ordering guarantee

The server timestamps a `buzz` message the instant it's received on the
handler task — not when the client sent it, and not using any timestamp the
client includes. Because each team's WebSocket messages are processed by
its own connection task but all writes go through the same `RwLock`-guarded
`buzzer_order`, the lock serializes concurrent presses into a single,
unambiguous arrival order.

## Anti-cheat flow

1. Browser JS on the team page listens for `visibilitychange`, `blur`,
   `focus`, and `fullscreenchange`.
2. On a violation, the team client sends `{"type": "violation", "kind": "..."}`
   over its existing WS connection.
3. The server — not the client — owns `warning_count` and the
   disqualification threshold, so a compromised/edited client can't fake a
   clean record.
4. Crossing the threshold flips `Team.status` to `Disqualified` and
   broadcasts a `team_status` update to the host.
