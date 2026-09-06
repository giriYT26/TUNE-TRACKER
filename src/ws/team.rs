use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use std::sync::Arc;

use crate::state::{AppState, ClientMessage, ServerMessage};

pub async fn handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    // Send team list on connect
    let teams = state.connected_teams.read().await;
    let team_names: Vec<String> = teams.keys().cloned().collect();
    drop(teams);
    let _ = sender
        .send(Message::Text(
            serde_json::json!({ "type": "team_list", "teams": team_names })
                .to_string()
                .into(),
        ))
        .await;

    // Send current round state so the client knows if buzzer is active
    {
        let round = state.current_round.read().await;
        let _ = sender
            .send(Message::Text(
                serde_json::to_string(&ServerMessage::RoundState {
                    state: round.state.clone(),
                })
                .unwrap()
                .into(),
            ))
            .await;
        let _ = sender
            .send(Message::Text(
                serde_json::to_string(&ServerMessage::RoundName {
                    name: round.name.clone(),
                })
                .unwrap()
                .into(),
            ))
            .await;
        let _ = sender
            .send(Message::Text(
                serde_json::to_string(&ServerMessage::BuzzerUpdate {
                    buzzer_order: round.buzzer_order.clone(),
                })
                .unwrap()
                .into(),
            ))
            .await;
    }

    let mut team_name: Option<String> = None;
    let mut username: Option<String> = None;

    loop {
        tokio::select! {
            msg = receiver.next() => {
                let text = match msg {
                    Some(Ok(Message::Text(t))) => t,
                    _ => break,
                };

                let parsed: ClientMessage = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                match parsed {
                    ClientMessage::Join { team_name: name, action } => {
                        match state.join_team(name.clone(), action).await {
                            Ok(()) => {
                                team_name = Some(name);
                                let _ = sender.send(Message::Text(
                                    serde_json::json!({ "type": "joined" }).to_string().into(),
                                )).await;
                            }
                            Err(e) => {
                                let _ = sender.send(Message::Text(
                                    serde_json::json!({ "type": "error", "message": e }).to_string().into(),
                                )).await;
                            }
                        }
                    }
                    ClientMessage::Username { username: name } => {
                        if team_name.is_none() {
                            let _ = sender.send(Message::Text(
                                serde_json::json!({ "type": "error", "message": "Join a team first" }).to_string().into(),
                            )).await;
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
                                let _ = sender.send(Message::Text(
                                    serde_json::json!({ "type": "error", "message": e }).to_string().into(),
                                )).await;
                            }
                        }
                    }
                    ClientMessage::GetTeams => {
                        let teams = state.connected_teams.read().await;
                        let team_names: Vec<String> = teams.keys().cloned().collect();
                        let _ = sender.send(Message::Text(
                            serde_json::json!({ "type": "team_list", "teams": team_names }).to_string().into(),
                        )).await;
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
            Ok(msg) = rx.recv() => {
                let text = serde_json::to_string(&msg).unwrap();
                if sender.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    }

    if let Some(ref uname) = username {
        state.remove_user(uname).await;
    }
}
