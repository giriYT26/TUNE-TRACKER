# Tune Tracker

A real-time online buzzer system for a college music event. Teams join with a
team name, press a buzzer during each round, and the server records the exact
order — no artificial "first 3" cutoff. A host dashboard controls rounds and
watches buzzer order, team status, and violation warnings live.

## Tech stack

- **Backend:** Rust 1.85+, `axum` 0.7 (HTTP + WebSocket) on `tokio`
- **Shared state:** `Arc<AppState>` with `tokio::sync::RwLock` + `broadcast`
  channels for pushing live updates to every connected client
- **Frontend:** React 19, Vite 8, React Router 7 — served by the same Rust
  server via `tower-http::ServeDir` (no separate deployment needed)
- **Styling:** Inline glassmorphism CSS, ShapeGrid animated hexagon background
- **Containerization:** Multi-stage Docker build (node → rust → alpine)

Anti-cheat detection (tab switching, losing focus, exiting fullscreen)
happens in browser JS using the Page Visibility API and related browser
events, which then reports violations to the Rust backend over the same
WebSocket connection.

## Features

- Unique team-name join flow, no separate accounts
- Session token reconnection — rejoin a team after disconnect without
  re-entering name
- Server-authoritative buzzer timestamping and ordering (client timestamps
  are never trusted)
- Unlimited buzzer order display — all teams that press are shown, in order
- Host controls: Start / Lock / Unlock / Reset
- Host can **Eliminate** entire teams (with confirmation dialog)
- Host can **Kick** individual members (disconnects their WebSocket)
- Host can **Lock/Unlock** team registration
- Violation tracking with warning counter
- Anti-cheat monitoring: tab switches, window blur, fullscreen exits
- Competition rules displayed in the lobby
- Team search when 1+ teams exist
- Eliminated players see a "You got eliminated" overlay and return to lobby
- Responsive design for desktop and mobile (card layout on small screens)
- Docker containerization for easy deployment
- LAN access — binds to `0.0.0.0` for same-network play
- 8 integration tests covering join, reconnect, kick, lock, buzz, and round state

## Project structure

```
TUNE-TRACKER/
├── Cargo.toml
├── Cargo.lock
├── Dockerfile                    # multi-stage: node → rust → alpine
├── docker-compose.yml
├── .dockerignore
├── src/
│   ├── main.rs                   # server bootstrap, configurable PORT
│   ├── lib.rs                    # create_app() for tests + main
│   ├── state.rs                  # AppState, message enums, session tokens
│   └── ws/
│       ├── mod.rs
│       ├── team.rs               # team-side WebSocket handler
│       └── host.rs               # host-side WebSocket handler
├── tests/
│   └── integration.rs            # 8 integration tests (tokio-tungstenite)
├── frontend/
│   ├── package.json
│   ├── vite.config.js            # proxy + es2018 build target
│   ├── index.html
│   ├── src/
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── App.jsx               # routes
│   │   ├── pages/
│   │   │   ├── Team.jsx          # lobby + buzzer + eliminated screen
│   │   │   └── Host.jsx          # host dashboard
│   │   ├── components/
│   │   │   └── ShapeGrid.tsx     # animated hexagon background
│   │   └── hooks/
│   │       └── useWebSocket.js   # reconnecting WebSocket hook
│   └── dist/                     # built frontend (served by Rust)
├── .gitignore
├── README.md
├── Architecture.md
├── workflow.md
├── SKILL.md
└── requirements.txt
```

## Getting started

### Prerequisites

- **Rust toolchain** (rustup, stable 1.85+): https://rustup.rs
- **Node.js 18+**: https://nodejs.org
- **Docker** (optional): https://docs.docker.com/get-docker/

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

The server starts on **http://0.0.0.0:3000** (configurable via `PORT` env var).

### Open in browser

| Page | URL |
|------|-----|
| Team (lobby + buzzer) | http://localhost:3000/ |
| Host dashboard | http://localhost:3000/host/login |

### Development mode

Run backend and frontend separately with hot reload:

```bash
# Terminal 1: backend
cargo run

# Terminal 2: frontend (with Vite proxy to backend)
cd frontend
npm run dev -- --host
```

Vite starts on `http://localhost:5173` and proxies `/ws/*` to the Rust backend.

### Docker

```bash
docker compose up --build
```

Container listens on port 3000, accessible on all interfaces.

### Hosting on a network

The server binds to `0.0.0.0`, so it's accessible on your local network.
Find your machine's local IP and share it:

```
http://<your-local-ip>:3000
```

Players connect to the team page, the host connects to `/host`.

## How it works

1. **Host** opens `/host`, logs in, and controls the round (Start / Lock / Reset)
2. **Players** open `/`, create or join a team, enter a username
3. When the host starts a round, players see the buzzer become active
4. Players press **BUZZ** — the server records the exact order and reaction time
5. The host sees the buzzer order in real time on the dashboard
6. Host can eliminate teams, kick members, or reset the buzzer

## Running tests

```bash
cargo test
```

8 integration tests covering team join, session token reconnection, kick,
lock teams, round state broadcast, and 10-user concurrent buzz.

## Related docs

- `Architecture.md` — data model, message protocol, state machine
- `workflow.md` — build order and phase checklist
- `SKILL.md` — AI assistant conventions and hard rules
- `frontend/README.md` — frontend-specific docs
