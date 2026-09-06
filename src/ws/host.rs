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
    // TODO, per workflow.md Phase 4:
    //   1. Subscribe this connection to state.tx immediately so the
    //      dashboard starts receiving live updates on connect
    //   2. Loop: on {"type": "start"|"lock"|"reset"|"next_question"} ->
    //      apply the round state machine transition from Architecture.md
    //   3. Consider: should a host connection require some form of auth?
    //      Not in the original spec, but worth deciding before a real event.
    todo!("host WS message loop")
}
