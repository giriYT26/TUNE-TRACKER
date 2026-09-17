# Tune Tracker — Frontend

React frontend for the Tune Tracker buzzer system.

## Tech Stack

- **React 19** — UI framework
- **Vite 8** — dev server & build tool
- **React Router 7** — page routing
- **JavaScript (JSX)** — no TypeScript
- **Build target** — ES2018 (compatible with older mobile browsers)

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Navigation links |
| `/team` | Team | Join event, press buzzer, anti-cheat, reconnection |
| `/host` | Host | Dashboard with controls, buzzer order, team list |
| `/host/login` | Host Login | Password entry (admin gate) |

## Getting Started

### Prerequisites

- Node.js 18+
- Backend running on `localhost:3000` (`cargo run`)

### Install dependencies

```bash
npm install
```

### Run dev server

```bash
npm run dev -- --host
```

Opens at `http://localhost:5173`. The `--host` flag enables LAN access.

The Vite proxy forwards `/ws/*` requests to the backend at `localhost:3000`.

### Build for production

```bash
npm run build
```

Output goes to `dist/` (served by the Rust server via `tower-http`).

### Lint

```bash
npm run lint
```

## WebSocket Protocol

The frontend connects to two WebSocket endpoints:

- **Team:** `ws://localhost:5173/ws/team`
- **Host:** `ws://localhost:5173/ws/host`

### Messages sent to server

```json
{ "type": "join", "team_name": "Team Vibe", "action": "create" }
{ "type": "join", "team_name": "Team Vibe", "action": "join" }
{ "type": "join", "team_name": "Team Vibe", "action": "reconnect", "session_token": "abc-123" }
{ "type": "buzz" }
{ "type": "violation", "kind": "tab_switch" }
{ "type": "start" }
{ "type": "lock" }
{ "type": "reset" }
{ "type": "next_question" }
{ "type": "kick", "team_name": "Team Vibe" }
{ "type": "eliminate", "team_name": "Team Vibe" }
{ "type": "lock_teams" }
{ "type": "unlock_teams" }
{ "type": "set_round_name", "name": "Round 1" }
```

### Messages received from server

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

## Key Features

- **Session reconnection** — stores `session_token` in `sessionStorage`, reconnects automatically on page reload
- **Anti-cheat** — monitors `visibilitychange`, `blur`, `focus`, `fullscreenchange`
- **Responsive** — card layout for buzzer entries on mobile, touch-friendly targets
- **ShapeGrid** — animated hexagon background, `IntersectionObserver` guarded for old browsers
