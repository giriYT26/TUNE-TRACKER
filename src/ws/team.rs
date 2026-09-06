use axum::{
    extract::{
        ws::{WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use std::sync::Arc;

use crate::state::AppState;

pub async fn handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    // TODO, per workflow.md Phase 2/3/5:
    //   1. Wait for the first message to be {"type": "join", "team_name": ...}
    //      - check uniqueness against state.teams before accepting
    //   2. Subscribe this connection to state.tx so it receives broadcasts
    //   3. Loop: on {"type": "buzz"} -> call state.add_buzzer_event(...)
    //      on {"type": "violation", "kind": ...} -> bump warning_count,
    //        check disqualification threshold
    //   4. On disconnect, decide whether to keep the team's state (likely
    //      yes, so a page refresh doesn't lose their spot in the order)
    todo!("team WS message loop")
}
