---
name: tune-tracker
description: Real-time Rust/axum buzzer system for a college music event — team join, server-authoritative buzzer ordering, host controls, anti-cheat. Read this before making changes so edits stay consistent with the project's rules and conventions.
---

# Tune Tracker — AI assistant guide

This file exists so an AI coding assistant (Claude Code, Cursor, Copilot,
etc.) has the project's non-negotiable rules and conventions in one place
before touching code. Read `Architecture.md` for the full data model and
message protocol, and `workflow.md` for the intended build order — this
file is the condensed version plus the rules that are easy to accidentally
violate.

## What this project is

A real-time buzzer system: teams join with a name, press a buzzer, and the
Rust backend records the exact server-side order and pushes it live to a
host dashboard. See `README.md` for the full feature list.

## Hard rules — do not violate these

1. **No count-based cutoff on buzzer order, ever.** The spec explicitly
   forbids stopping at "first 3" or any fixed number. The only thing that
   stops new buzzer presses being recorded is the round's `state` moving to
   `Locked`. Never add a `.take(n)` or a length check as a gate on
   `buzzer_order`.
2. **Timestamps are server-authoritative.** Always timestamp a buzz on
   receipt on the backend (`chrono::Utc::now()`), never trust or use a
   timestamp sent by the client.
3. **Warning counts and disqualification live server-side only.** The
   client only *reports* violations (`{"type": "violation", "kind": ...}`);
   it never decides its own status. Don't move that logic into JS.
4. **Concurrent writes to buzzer order must stay serialized.** Any change
   touching `AppState.current_round` should go through the existing
   `RwLock` write path — don't introduce a second, separate mutable copy of
   round state anywhere (e.g. per-connection caching of buzzer order).

## Conventions

- Message protocol is JSON with a `type` tag — see `Architecture.md` for
  the exact shapes. Keep new message types consistent with that pattern
  (`snake_case` type strings, flat fields) rather than inventing a new
  envelope style.
- Round state machine: `Idle -> Active -> Locked -> (Idle on next question)`.
  Any new host control should be expressed as a transition in this machine,
  not a side-channel flag.
- Frontend is plain HTML/CSS/JS served as static files by the Rust server —
  no frontend framework or build step unless that's a deliberate, separate
  decision (update `README.md` and `requirements.txt` if so).
- Rust files currently contain `todo!()` placeholders in the core logic
  (`AppState::new`, the WS message loops, etc.) — these are intentional gaps
  for the project owner to fill in, not bugs. When implementing one, remove
  only that `todo!()`, don't restructure surrounding code unless asked.

## Where things live

- `src/state.rs` — data model (`Team`, `Round`, `BuzzerEvent`, `AppState`)
- `src/ws/team.rs`, `src/ws/host.rs` — the two WebSocket connection loops
- `src/anticheat.rs` — violation → warning → disqualification logic
- `static/` — team and host frontend pages
- `Architecture.md` — data model and message protocol, source of truth for
  any schema questions
- `workflow.md` — the intended phase order; useful for scoping how big a
  given change should be
