# Tune Tracker — Frontend

React frontend for the Tune Tracker buzzer system.

## Tech Stack

- **React 19** — UI framework
- **Vite 8** — dev server & build tool
- **React Router 7** — page routing
- **JavaScript (JSX)** — no TypeScript

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Navigation links |
| `/team` | Team | Join event, press buzzer, anti-cheat |
| `/host` | Host | Dashboard with controls, buzzer order, team list |

## Getting Started

### Prerequisites

- Node.js 18+
- Backend running on `localhost:3000`

### Install dependencies

```bash
npm install
```

### Run dev server

```bash
npm run dev
```

Opens at `http://localhost:5173`

The Vite proxy forwards `/ws/*` requests to the backend at `localhost:3000`.

### Build for production

```bash
npm run build
```

Output goes to `dist/`.

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
{ "type": "join", "team_name": "Team Vibe" }
{ "type": "buzz" }
{ "type": "violation", "kind": "tab_switch" }
{ "type": "start" }
{ "type": "lock" }
{ "type": "reset" }
{ "type": "next_question" }
```

### Messages received from server

```json
{ "type": "buzzer_update", "buzzer_order": [...] }
{ "type": "round_state", "state": "Active" }
{ "type": "team_status", "team_name": "Team Vibe", "status": "Disqualified" }
```
