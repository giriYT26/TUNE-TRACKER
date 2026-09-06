# Workflow — Tune Tracker

Build this as a vertical slice, in order. Each phase should be runnable and
testable before moving to the next — don't build the dashboard UI before the
ordering logic underneath it is solid.

## Phase 1 — Server skeleton
- [ ] `cargo new` project, add `axum`, `tokio`, `serde`, `serde_json`
- [ ] Single `/ws/echo` WebSocket route that echoes messages back
- [ ] Confirm connect/disconnect lifecycle works with two simultaneous
      connections (open two browser tabs or use a WS test client)

## Phase 2 — Team join
- [ ] `AppState` holding `HashMap<TeamId, Team>` behind `RwLock`
- [ ] Join flow: team submits a name → check uniqueness → issue a session
      token → team enters buzzer screen
- [ ] Reject duplicate team names with a clear error, not a silent overwrite

## Phase 3 — Buzzer press + ordering (the core problem)
- [ ] WS message `{"type": "buzz"}` from a team
- [ ] Server timestamps on receipt (`chrono::Utc::now()`), never trusts a
      client-sent time
- [ ] Append to the round's `buzzer_order: Vec<BuzzerEvent>` — no early
      cutoff at 3, or any fixed number
- [ ] Broadcast the updated order to all host connections
- [ ] Test with several fake clients pressing in quick succession before
      touching any UI — this is where race conditions would show up

## Phase 4 — Host controls
- [ ] Round state machine: `Idle → Active → Locked`
- [ ] Host actions: START (Idle/Locked → Active), LOCK (Active → Locked),
      RESET (clears current buzzer_order), NEXT QUESTION (fresh round)
- [ ] Only `Locked` stops accepting new buzzer presses — never a count-based
      cutoff
- [ ] Host dashboard renders the live order as it streams in, no page
      refresh

## Phase 5 — Anti-cheat
- [ ] Frontend: Page Visibility API, `blur`/`focus`, `fullscreenchange`
      listeners on the team page
- [ ] On violation, send `{"type": "violation", "kind": "..."}` over the
      existing WS connection
- [ ] Backend increments `warning_count`, applies disqualification
      threshold, broadcasts status change to host
- [ ] Host dashboard shows warning counts and disqualified teams

## Phase 6 — Polish
- [ ] Reconnect handling (team refreshes page mid-round)
- [ ] Optional: SQLite persistence for teams/history across restarts
- [ ] Basic styling pass on both team and host pages

## Testing notes
- Write ordering logic with a couple of unit tests around concurrent
  `buzz` events before trusting it live at the event
- Manually test with more than 3 simultaneous "presses" to confirm there's
  genuinely no hidden cutoff anywhere in the pipeline
