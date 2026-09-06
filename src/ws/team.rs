use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use std::sync::Arc;

use crate::state::{AppState, ClientMessage};

pub async fn handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    let mut team_name: Option<String> = None;
    let mut username: Option<String> = None;

    while let Some(msg) = receiver.next().await {
        let msg = match msg {
            Ok(Message::Text(text)) => text,
            _ => continue,
        };

        let parsed: ClientMessage = match serde_json::from_str(&msg) {
            Ok(m) => m,
            Err(_) => continue,
        };

        match parsed {
            ClientMessage::Join { team_name: name, action } => {
                match state.join_team(name.clone(), action).await {
                    Ok(()) => {
                        team_name = Some(name);
                        let reply = serde_json::json!({
                            "type": "joined"
                        });
                        let _ = sender.send(Message::Text(reply.to_string().into())).await;
                    }
                    Err(e) => {
                        let reply = serde_json::json!({
                            "type": "error",
                            "message": e
                        });
                        let _ = sender.send(Message::Text(reply.to_string().into())).await;
                        return;
                    }
                }
            }
            ClientMessage::Username { username: name } => {
                if team_name.is_none() {
                    let reply = serde_json::json!({
                        "type": "error",
                        "message": "Join a team first"
                    });
                    let _ = sender.send(Message::Text(reply.to_string().into())).await;
                    continue;
                }

                match state.add_username(team_name.clone().unwrap(), name.clone()).await {
                    Ok(()) => {
                        username = Some(name);
                        let round = state.current_round.read().await;
                        let reply = serde_json::json!({
                            "type": "username_accepted",
                            "round_name": round.name
                        });
                        let _ = sender.send(Message::Text(reply.to_string().into())).await;
                    }
                    Err(e) => {
                        let reply = serde_json::json!({
                            "type": "error",
                            "message": e
                        });
                        let _ = sender.send(Message::Text(reply.to_string().into())).await;
                        return;
                    }
                }
            }
            ClientMessage::Buzz => {
                if let Some(ref uname) = username {
                    state.add_buzzer_event(uname.clone()).await;
                }
            }
            ClientMessage::Violation { kind } => {
                if let Some(ref uname) = username {
                    state.handle_violation(uname.clone(), kind).await;
                }
            }
            _ => {}
        }
    }

    if let Some(ref uname) = username {
        state.remove_user(uname).await;
    }
}
