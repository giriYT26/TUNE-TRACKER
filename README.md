# Tune Tracker

A real-time online buzzer system for a college music event. Teams join with a
team name, press a buzzer during each round, and the server records the exact
order — no artificial "first 3" cutoff. A host dashboard controls rounds and
watches buzzer order, team status, and violation warnings live.

## Tech stack

- **Backend:** Rust, `axum` (HTTP + WebSocket) on `tokio`
- **Shared state:** `Arc<AppState>` with `tokio::sync::RwLock` + `broadcast` channels
  for pushing live updates to every connected client
- **Frontend:** React 19, Vite, React Router — served by the same Rust server
  via `tower-http::ServeDir` (no separate deployment needed)
- **Styling:** Inline glassmorphism CSS, ShapeGrid animated hexagon background

Anti-cheat detection (tab switching, losing focus, exiting fullscreen)
happens in browser JS using the Page Visibility API and related browser
events, which then reports violations to the Rust backend over the same
WebSocket connection.

## Features

- Unique team-name join flow, no separate accounts
- Server-authoritative buzzer timestamping and ordering (client timestamps
  are never trusted)
- Unlimited buzzer order display — all teams that press are shown, in order
- Host controls: Start / Lock / Reset / Next Question
- Host can **Eliminate** entire teams (with confirmation dialog)
- Host can **Kick** individual members (disconnects their WebSocket)
- Host can **Lock/Unlock** team creation
- Violation tracking with warning counter
- Anti-cheating monitoring: tab switches, window blur, fullscreen exits
- Competition rules displayed in the lobby
- Team search when 1+ teams exist
- Eliminated players see a "You got eliminated" overlay and return to lobby
- Responsive design for desktop and mobile

## Project structure

```
TUNE-TRACKER/
├── Cargo.toml
├── src/
│   ├── main.rs              # server bootstrap, routes
│   ├── state.rs             # AppState, message enums, business logic
│   └── ws/
│       ├── mod.rs
│       ├── team.rs          # team-side WebSocket handler
│       └── host.rs          # host-side WebSocket handler
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx          # routes
│   │   ├── pages/
│   │   │   ├── Team.jsx     # lobby + buzzer + eliminated screen
│   │   │   └── Host.jsx     # host dashboard
│   │   ├── components/
│   │   │   └── ShapeGrid.tsx # animated hexagon background
│   │   └── hooks/
│   │       └── useWebSocket.js
│   └── dist/                # built frontend (served by Rust)
├── README.md
└── workflow.md
```

## Getting started

### Prerequisites

- **Rust toolchain** (rustup): https://rustup.rs
- **Node.js 18+**: https://nodejs.org

### Setup

```bash
# Clone the repo
git clone https://github.com/giriYT26/TUNE-TRACKER.git
cd TUNE-TRACKER

# Build the frontend
cd frontend
npm install
npm run build
cd ..

# Build the backend (release)
cargo build --release

# Run the server
./target/release/tune-tracker
```

The server starts on **http://0.0.0.0:3000**.

### Open in browser

| Page | URL |
|------|-----|
| Team (lobby + buzzer) | http://localhost:3000/ |
| Host dashboard | http://localhost:3000/host/login |

### Development mode

To run the frontend with hot reload during development:

```bash
cd frontend
npm run dev
```

This starts Vite on `http://localhost:5173` with proxy to the Rust backend.

### Hosting on a network

The server binds to `0.0.0.0:3000`, so it's accessible on your local network.
Find your machine's local IP and share it:

```
http://<your-local-ip>:3000
```

Players connect to the team page, the host connects to `/host`.

## How it works

1. **Host** opens `/host`, logs in, and controls the round (Start / Lock / Next)
2. **Players** open `/`, create or join a team, enter a username
3. When the host starts a round, players see the buzzer become active
4. Players press **BUZZ** — the server records the exact order and reaction time
5. The host sees the buzzer order in real time on the dashboard
6. Host can eliminate teams, kick members, or reset the buzzer

## Related docs

- `workflow.md` — build order and phase checklist
