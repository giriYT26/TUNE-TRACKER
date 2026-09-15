use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, State,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use std::net::SocketAddr;
use std::sync::Arc;

use crate::state::{AppState, ClientMessage, ServerMessage};

pub async fn handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, addr, state))
}

async fn handle_socket(socket: WebSocket, addr: SocketAddr, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    tracing::debug!(ip = %addr, component = "team_ws", action = "connected");

    // Send team list on connect
    let teams = state.connected_teams.read().await;
    let team_data: Vec<_> = teams
        .iter()
        .map(|(name, members)| {
            serde_json::json!({ "name": name, "size": members.len(), "limit": 4 })
        })
        .collect();
    drop(teams);
    let _ = sender
        .send(Message::Text(
            serde_json::json!({ "type": "team_list", "teams": team_data })
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
                    started_at_ms: round.started_at_ms,
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

    let locked = *state.teams_locked.read().await;
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&ServerMessage::TeamLock { locked })
                .unwrap()
                .into(),
        ))
        .await;

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
                    ClientMessage::Reconnect { session_token } => {
                        match state.resolve_session(&session_token).await {
                            Some(info) => {
                                // Re-add user to connected maps
                                {
                                    let mut users = state.connected_users.write().await;
                                    users.insert(info.username.clone(), info.team_name.clone());
                                }
                                {
                                    let mut teams = state.connected_teams.write().await;
                                    if let Some(members) = teams.get_mut(&info.team_name) {
                                        if !members.contains(&info.username) {
                                            members.push(info.username.clone());
                                        }
                                    } else {
                                        teams.insert(info.team_name.clone(), vec![info.username.clone()]);
                                    }
                                }

                                // Broadcast updated team list
                                let teams_snapshot = state.connected_teams.read().await;
                                for (t_name, t_members) in teams_snapshot.iter() {
                                    let _ = state.tx.send(ServerMessage::TeamJoined {
                                        team_name: t_name.clone(),
                                        usernames: t_members.clone(),
                                    });
                                }
                                drop(teams_snapshot);

                                team_name = Some(info.team_name.clone());
                                username = Some(info.username.clone());

                                let round = state.current_round.read().await;
                                let round_name = round.name.clone();
                                drop(round);

                                let reply = serde_json::json!({
                                    "type": "reconnect_accepted",
                                    "session_token": session_token,
                                    "team_name": info.team_name,
                                    "username": info.username,
                                    "round_name": round_name
                                });
                                let _ = sender.send(Message::Text(reply.to_string().into())).await;

                                tracing::info!(
                                    username = %info.username,
                                    team = %info.team_name,
                                    ip = %addr,
                                    action = "reconnect",
                                    token = %session_token
                                );
                            }
                            None => {
                                let _ = sender.send(Message::Text(
                                    serde_json::json!({ "type": "error", "message": "Session expired. Please rejoin." })
                                        .to_string().into(),
                                )).await;
                            }
                        }
                    }
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
                            Ok(session_token) => {
                                username = Some(name.clone());
                                let round = state.current_round.read().await;
                                let reply = ServerMessage::UsernameAccepted {
                                    session_token,
                                    round_name: round.name.clone(),
                                };
                                let _ = sender.send(Message::Text(serde_json::to_string(&reply).unwrap().into())).await;

                                tracing::info!(
                                    username = %name,
                                    team = %team_name.as_deref().unwrap_or(""),
                                    ip = %addr,
                                    action = "username_accepted"
                                );
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
                        let team_data: Vec<_> = teams
                            .iter()
                            .map(|(name, members)| {
                                serde_json::json!({ "name": name, "size": members.len(), "limit": 4 })
                            })
                            .collect();
                        let _ = sender.send(Message::Text(
                            serde_json::json!({ "type": "team_list", "teams": team_data }).to_string().into(),
                        )).await;
                    }
                    ClientMessage::Buzz { reaction_time_ms } => {
                        if let Some(ref uname) = username {
                            state.add_buzzer_event(uname.clone(), reaction_time_ms).await;
                        }
                    }
                    ClientMessage::Violation { kind } => {
                        if let Some(ref uname) = username {
                            state.handle_violation(uname.clone(), kind).await;
                        }
                    }
                    ClientMessage::Leave => {
                        break;
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

    // On disconnect, remove user from connected maps
    if let Some(ref uname) = username {
        state.remove_user_with_broadcast(uname).await;
        tracing::info!(
            username = %uname,
            ip = %addr,
            action = "disconnected"
        );
    } else {
        tracing::debug!(ip = %addr, action = "disconnected", note = "no username set");
    }
}
