# Tune Tracker

A real-time online buzzer system for a college music event. Teams join with a
team name, press a buzzer during each round, and the server records the exact
order — no artificial "first 3" cutoff. A host dashboard controls rounds and
watches buzzer order, team status, and anti-cheating warnings live.

## Tech stack

- **Backend:** Rust, `axum` (HTTP + WebSocket) on `tokio`
- **Shared state:** `Arc<RwLock<...>>` + `tokio::sync::broadcast` channels for
  pushing live updates to every connected client
- **Frontend:** plain HTML/CSS/JS served by the same Rust server (no separate
  language or "connector" needed — the browser talks to Rust directly over
  WebSocket)
- **Optional persistence:** SQLite via `sqlx`, for team rosters and
  disqualification history surviving a restart

Anti-cheat detection (tab switching, losing focus, exiting fullscreen)
happens in browser JS using the Page Visibility API and related browser
events, which then reports violations to the Rust backend over the same
WebSocket connection.

## Features

- Unique team-name join flow, no separate accounts
- Server-authoritative buzzer timestamping and ordering (client timestamps
  are never trusted)
- Unlimited buzzer order display — all teams that press are shown, in order
- Host controls: start / lock / reset / next question
- Anti-cheating monitoring: tab switches, window blur, fullscreen exits,
  multiple tabs
- Warning counter → automatic disqualification past a threshold

## Project structure (suggested)

```
tune-tracker/
├── Cargo.toml
├── src/
│   ├── main.rs           # server bootstrap, routes
│   ├── state.rs          # AppState, Team, Round, BuzzerEvent
│   ├── ws/
│   │   ├── mod.rs
│   │   ├── team.rs       # team-side WS handler
│   │   └── host.rs       # host-side WS handler
│   └── anticheat.rs      # warning/disqualification logic
├── static/
│   ├── team.html / team.js
│   └── host.html / host.js
├── README.md
├── workflow.md
├── Architecture.md
└── requirements.txt
```

## Getting started

```bash
cargo run
```

Serves the team join page and host dashboard as static files, with
WebSocket endpoints (e.g. `/ws/team`, `/ws/host`) for real-time updates.
Exact routes are up to you — see `Architecture.md` for the suggested message
protocol.

## Related docs

- `Architecture.md` — data model, state machine, WebSocket message protocol
- `workflow.md` — suggested build order and phase checklist
- `requirements.txt` — crates and tooling needed
