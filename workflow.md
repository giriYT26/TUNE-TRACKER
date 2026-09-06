# Workflow — Tune Tracker

Build this as a vertical slice, in order. Each phase should be runnable and
testable before moving to the next — don't build the dashboard UI before the
ordering logic underneath it is solid.

## Phase 1 — Server skeleton
- [x] `cargo new` project, add `axum`, `tokio`, `serde`, `serde_json`
- [x] Single `/ws/echo` WebSocket route that echoes messages back
- [x] Confirm connect/disconnect lifecycle works with two simultaneous
      connections (open two browser tabs or use a WS test client)

## Phase 2 — Team join
- [x] `AppState` holding `HashMap<TeamId, Team>` behind `RwLock`
- [x] Join flow: team submits a name → check uniqueness → issue a session
      token → team enters buzzer screen
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
      RESET (clears current buzzer_order), NEXT QUESTION (fresh round)
- [x] Only `Locked` stops accepting new buzzer presses — never a count-based
      cutoff
- [x] Host dashboard renders the live order as it streams in, no page
      refresh

## Phase 5 — Anti-cheat
- [x] Frontend: Page Visibility API, `blur`/`focus`, `fullscreenchange`
      listeners on the team page
- [x] On violation, send `{"type": "violation", "kind": "..."}` over the
      existing WS connection
- [x] Backend increments `warning_count`, broadcasts violation report to host
- [x] Host dashboard shows warning counts and can manually disqualify teams

## Phase 6 — Polish
- [x] Reconnect handling (team refreshes page mid-round)
- [x] Leaderboard + side menu on team buzzer screen
- [x] Session persistence across reloads
- [x] Static file serving via tower-http (production deployment)
- [ ] Optional: SQLite persistence for teams/history across restarts

## Testing notes
- Write ordering logic with a couple of unit tests around concurrent
  `buzz` events before trusting it live at the event
- Manually test with more than 3 simultaneous "presses" to confirm there's
  genuinely no hidden cutoff anywhere in the pipeline
