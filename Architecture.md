# Architecture — Tune Tracker

## Overview

Team clients and the host dashboard are both plain browser pages. Both
connect directly to a single Rust backend (`axum` 0.7 + `tokio`) over WebSocket —
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
struct Round {
    id: Uuid,
    name: String,
    state: RoundState,           // Idle | Active | Locked
    buzzer_order: Vec<BuzzerEvent>,
    started_at_ms: Option<u64>,
}

struct BuzzerEvent {
    team_name: String,
    position: usize,
    timestamp: String,           // "HH:MM:SS:mmm"
}

struct SessionInfo {
    team_name: String,
    username: String,
}

struct AppState {
    teams: RwLock<HashMap<String, Vec<String>>>,           // team_name → usernames
    session_tokens: RwLock<HashMap<String, SessionInfo>>, // token → session info
    current_round: RwLock<Round>,
    teams_locked: RwLock<bool>,
    tx: broadcast::Sender<ServerMessage>,                 // fan-out to all connections
}
```

`AppState` is wrapped in an `Arc` and cloned into every request/WS handler.

Teams are stored as `HashMap<String, Vec<String>>` — the key is the team name,
the value is the list of usernames on that team. Session tokens are stored
separately in `session_tokens` to allow reconnection without re-joining.

## Round state machine

```
Idle ──START──▶ Active ──LOCK──▶ Locked ──START──▶ Active
  ▲                                                      │
  └────────────────────RESET─────────────────────────────┘
```

- **Idle** → no round active, buzzer disabled
- **Active** → round running, teams can buzz
- **Locked** → round paused, buzzer disabled, buzzes rejected

The critical rule: **only a state transition to `Locked` stops new buzzer
presses being accepted** — never a count check on `buzzer_order.len()`. This
is what guarantees "no automatic first-3 limit."

## WebSocket message protocol

All messages are JSON with a `type` tag.

**Team → server**
```json
{ "type": "join", "team_name": "Team Vibe", "action": "create" }
{ "type": "join", "team_name": "Team Vibe", "action": "join" }
{ "type": "join", "team_name": "Team Vibe", "action": "reconnect" }
{ "type": "buzz" }
{ "type": "violation", "kind": "tab_switch" }
```

**Host → server**
```json
{ "type": "start" }
{ "type": "lock" }
{ "type": "unlock" }
{ "type": "reset" }
{ "type": "next_question" }
{ "type": "kick", "team_name": "Team Vibe" }
{ "type": "eliminate", "team_name": "Team Vibe" }
{ "type": "lock_teams" }
{ "type": "unlock_teams" }
{ "type": "set_round_name", "name": "Round 1" }
```

**Server → all clients** (via `broadcast::Sender`)
```json
{ "type": "username_accepted", "session_token": "abc-123", "team_name": "Team Vibe" }
{ "type": "reconnect_accepted", "session_token": "abc-123" }
{ "type": "join_accepted", "action": "create" }
{ "type": "join_accepted", "action": "join" }
{ "type": "teams_locked", "locked": true }
{ "type": "buzzer_update", "buzzer_order": [...] }
{ "type": "round_state", "state": "Active", "started_at_ms": 1234567890 }
{ "type": "round_name", "name": "Round 1" }
{ "type": "team_status", "team_name": "Team Vibe", "status": "Disqualified" }
{ "type": "violation", "team_name": "Team Vibe", "kind": "tab_switch", "warning_count": 1 }
{ "type": "error", "message": "Team name already taken" }
```

Keeping the server → client shape as one broadcast message type per event
(rather than diffs) makes the host dashboard a pure "render whatever I last
received" UI, with no client-side merge logic to get wrong.

## Integration tests

Located in `tests/integration.rs`, using `tokio-tungstenite` for real WebSocket
connections against a live `axum` server. Tests run on `127.0.0.1:0` (random
available port).

Tests cover:
- Team join (create + accept)
- Team size limit (max 6 per team)
- Session token reconnection
- Kick and disqualify
- Lock teams (prevents new joins)
- Round state broadcast
- 10-user concurrent buzz ordering
