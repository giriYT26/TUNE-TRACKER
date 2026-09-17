# Workflow — Tune Tracker

Build this as a vertical slice, in order. Each phase should be runnable and
testable before moving to the next.

## Phase 1 — Server skeleton
- [x] `cargo new` project, add `axum`, `tokio`, `serde`, `serde_json`
- [x] Single `/ws/echo` WebSocket route that echoes messages back
- [x] Confirm connect/disconnect lifecycle works with two simultaneous
      connections (open two browser tabs or use a WS test client)

## Phase 2 — Team join
- [x] `AppState` holding `HashMap<String, Vec<String>>` behind `RwLock`
- [x] Join flow: team submits a name → check uniqueness → accept or reject
- [x] Reject duplicate team names with a clear error, not a silent overwrite

## Phase 3 — Buzzer press + ordering (the core problem)
- [x] WS message `{"type": "buzz"}` from a team
- [x] Server timestamps on receipt (`chrono::Utc::now()`), never trusts a
      client-sent time
- [x] Append to the round's `buzzer_order: Vec<BuzzerEvent>` — no early
      cutoff at 3, or any fixed number
- [x] Broadcast the updated order to all host connections
- [x] Test with several fake clients pressing in quick succession before
      touching any UI — this is where race conditions would show up

## Phase 4 — Host controls
- [x] Round state machine: `Idle → Active → Locked`
- [x] Host actions: START (Idle/Locked → Active), LOCK (Active → Locked),
      UNLOCK (Locked → Active), RESET (clears current buzzer_order)
- [x] Only `Locked` stops accepting new buzzer presses — never a count-based
      cutoff
- [x] Host dashboard renders the live order as it streams in, no page
      refresh
- [x] Lock/Unlock team registration (prevents new team creation)
- [x] Set round name

## Phase 5 — Anti-cheat
- [x] Frontend: Page Visibility API, `blur`/`focus`, `fullscreenchange`
      listeners on the team page
- [x] On violation, send `{"type": "violation", "kind": "..."}` over the
      existing WS connection
- [x] Backend increments `warning_count`, broadcasts violation report to host
- [x] Host dashboard shows warning counts and can manually disqualify teams

## Phase 6 — Session reconnection
- [x] Server issues `session_token` on `username_accepted`
- [x] Client stores token in `sessionStorage`
- [x] On reconnection, client sends `reconnect` action with stored token
- [x] Server validates token and sends `reconnect_accepted`

## Phase 7 — Polish
- [x] Leaderboard + side menu on team buzzer screen
- [x] Static file serving via tower-http (production deployment)
- [x] Host dashboard responsive design (card layout on mobile)
- [x] Reaction time display with colon separator (MM:SS:mmm)
- [x] Team page status correctly shows "Locked" when round is locked
- [x] ShapeGrid `IntersectionObserver` guarded for old browser compatibility
- [x] Vite build target `es2018` for older mobile browsers

## Phase 8 — Docker containerization
- [x] Multi-stage Dockerfile: node:20-alpine → rust:1.85-alpine → alpine:3.20
- [x] docker-compose.yml with port mapping
- [x] .dockerignore excluding target/, frontend/node_modules, frontend/dist
- [x] Configurable PORT via environment variable
- [x] Structured logging with `tracing` + `tracing-subscriber`

## Phase 9 — Integration tests
- [x] Test helper: `start_server()` returns `JoinHandle` + `team_url` + `host_url`
- [x] `wait_for(ws, type)` helper to find specific message types
- [x] `drain_n(ws, type, count)` helper to collect N messages of a type
- [x] Tests: team join, team size limit, session token reconnect,
      kick/disqualify, lock teams, round state broadcast, 10-user concurrent buzz
- [x] 8 integration tests passing with `cargo test`

## Phase 10 — Next steps
- [ ] Optional: SQLite persistence for teams/history across restarts
- [ ] Optional: Sound effects on buzz
- [ ] Optional: Team score tracking across multiple rounds
