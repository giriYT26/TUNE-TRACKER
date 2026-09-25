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
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    tracing::debug!(component = "team_ws", action = "connected");

    // Send team list on connect
    let teams = state.connected_teams.read().await;
    let team_data: Vec<_> = teams
        .iter()
        .map(|(name, members)| {
            serde_json::json!({ "name": name, "size": members.len(), "limit": 1 })
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
                    server_now: chrono::Utc::now().timestamp_millis() as u64,
                    frozen_elapsed_ms: round.frozen_elapsed_ms,
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
                    Err(e) => {
                        tracing::warn!(action = "parse_error", error = %e, raw = %text);
                        continue;
                    }
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

                                // Track connection for dual-tab detection
                                let is_dual = state.track_connection(&info.username).await;
                                if is_dual {
                                    state.handle_violation(info.username.clone(), "dual_tab".into()).await;
                                }

                                team_name = Some(info.team_name.clone());
                                username = Some(info.username.clone());

                                let round = state.current_round.read().await;
                                let round_name = round.name.clone();
                                let frozen_elapsed_ms = round.frozen_elapsed_ms;
                                let started_at_ms = round.started_at_ms;
                                let round_state = round.state.clone();
                                let buzzer_order = round.buzzer_order.clone();
                                drop(round);

                                let reply = serde_json::json!({
                                    "type": "reconnect_accepted",
                                    "session_token": session_token,
                                    "team_name": info.team_name.clone(),
                                    "username": info.username.clone(),
                                    "round_name": round_name
                                });
                                let _ = sender.send(Message::Text(reply.to_string().into())).await;

                                let _ = sender.send(Message::Text(
                                    serde_json::to_string(&ServerMessage::RoundState {
                                        state: round_state,
                                        started_at_ms,
                                        server_now: chrono::Utc::now().timestamp_millis() as u64,
                                        frozen_elapsed_ms,
                                    }).unwrap().into(),
                                )).await;

                                let _ = sender.send(Message::Text(
                                    serde_json::to_string(&ServerMessage::BuzzerUpdate {
                                        buzzer_order,
                                    }).unwrap().into(),
                                )).await;

                                let teams_snapshot = state.connected_teams.read().await;
                                for (t_name, t_members) in teams_snapshot.iter() {
                                    let _ = state.tx.send(ServerMessage::TeamJoined {
                                        team_name: t_name.clone(),
                                        usernames: t_members.clone(),
                                    });
                                }
                                drop(teams_snapshot);

                                tracing::info!(
                                    username = %info.username,
                                    team = %info.team_name,
                                    action = "reconnect",
                                    token = %session_token
                                );
                            }
                            None => {
                                let _ = sender.send(Message::Text(
                                    serde_json::json!({ "type": "session_expired", "message": "Session expired. Please rejoin." })
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

                                // Track connection for dual-tab detection
                                let is_dual = state.track_connection(&name).await;
                                if is_dual {
                                    state.handle_violation(name.clone(), "dual_tab".into()).await;
                                }

                                let round = state.current_round.read().await;
                                let buzzer_order = round.buzzer_order.clone();
                                let reply = ServerMessage::UsernameAccepted {
                                    session_token,
                                    round_name: round.name.clone(),
                                };
                                let _ = sender.send(Message::Text(serde_json::to_string(&reply).unwrap().into())).await;
                                drop(round);

                                let _ = state.tx.send(ServerMessage::BuzzerUpdate { buzzer_order });

                                tracing::info!(
                                    username = %name,
                                    team = %team_name.as_deref().unwrap_or(""),
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
                                serde_json::json!({ "name": name, "size": members.len(), "limit": 1 })
                            })
                            .collect();
                        let _ = sender.send(Message::Text(
                            serde_json::json!({ "type": "team_list", "teams": team_data }).to_string().into(),
                        )).await;
                    }
                    ClientMessage::CheckUsername { username: ref uname } => {
                        let existing_team = state.check_username(uname).await;
                        let reply = ServerMessage::UsernameStatus { team_name: existing_team };
                        let _ = sender.send(Message::Text(serde_json::to_string(&reply).unwrap().into())).await;
                    }
                    ClientMessage::Buzz { .. } => {
                        if let Some(ref uname) = username {
                            tracing::info!(username = %uname, action = "buzz_received");
                            state.add_buzzer_event(uname.clone()).await;
                        } else {
                            tracing::warn!(action = "buzz_dropped", reason = "no_username");
                        }
                    }
                    ClientMessage::Violation { kind } => {
                        if let Some(ref uname) = username {
                            state.handle_violation(uname.clone(), kind).await;
                        }
                    }
                    ClientMessage::SetTeamName { team_name: ref tname, ref new_name } => {
                        if let Some(ref _uname) = username {
                            if Some(tname.as_str()) == team_name.as_deref() {
                                match state.rename_team(tname.clone(), new_name.clone()).await {
                                    Ok(()) => {}
                                    Err(e) => {
                                        let _ = sender.send(Message::Text(
                                            serde_json::json!({ "type": "error", "message": e }).to_string().into(),
                                        )).await;
                                    }
                                }
                            }
                        }
                    }
                    ClientMessage::Leave => {
                        if let Some(ref uname) = username {
                            {
                                let mut users = state.connected_users.write().await;
                                users.remove(uname);
                            }
                            {
                                let mut user_teams = state.user_team_map.write().await;
                                user_teams.remove(uname);
                            }
                            if let Some(ref tname) = team_name {
                                let (updated_usernames, is_empty) = {
                                    let mut teams = state.connected_teams.write().await;
                                    if let Some(members) = teams.get_mut(tname) {
                                        members.retain(|u| u != uname);
                                        (members.clone(), members.is_empty())
                                    } else {
                                        (Vec::new(), true)
                                    }
                                };
                                
                                if is_empty {
                                    state.remove_team(tname.clone()).await;
                                } else {
                                    let _ = state.tx.send(ServerMessage::TeamJoined {
                                        team_name: tname.clone(),
                                        usernames: updated_usernames,
                                    });
                                }
                            }
                            tracing::info!(username = %uname, action = "left");
                        }
                        break;
                    }
                    _ => {}
                }
            }
            msg = rx.recv() => {
                match msg {
                    Ok(msg) => {
                        let text = serde_json::to_string(&msg).unwrap();
                        if sender.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(component = "team_ws", action = "broadcast_lagged", skipped = n);
                    }
                    Err(_) => break,
                }
            }
        }
    }

    // On disconnect, untrack the connection but do NOT remove the user from
    // connected maps. The user may be page-refreshing (disconnect → reconnect).
    // Removal only happens on explicit Leave or Kick. This prevents the race
    // condition where old socket cleanup wipes out user data mid-refresh.
    if let Some(ref uname) = username {
        state.untrack_connection(uname).await;
        let still_active = state.has_active_connection(uname).await;
        tracing::info!(
            username = %uname,
            action = "disconnected",
            still_active = still_active
        );

        if !still_active {
            let state_clone = state.clone();
            let uname_clone = uname.clone();
            let tname_clone = team_name.clone();
            tokio::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                if !state_clone.has_active_connection(&uname_clone).await {
                    tracing::info!(username = %uname_clone, action = "ghost_cleanup");
                    
                    {
                        let mut users = state_clone.connected_users.write().await;
                        users.remove(&uname_clone);
                    }
                    {
                        let mut user_teams = state_clone.user_team_map.write().await;
                        user_teams.remove(&uname_clone);
                    }
                    if let Some(ref tname) = tname_clone {
                        let (updated_usernames, is_empty) = {
                            let mut teams = state_clone.connected_teams.write().await;
                            if let Some(members) = teams.get_mut(tname) {
                                members.retain(|u| u != &uname_clone);
                                (members.clone(), members.is_empty())
                            } else {
                                (Vec::new(), true)
                            }
                        };
                        
                        if is_empty {
                            state_clone.remove_team(tname.clone()).await;
                        } else {
                            let _ = state_clone.tx.send(ServerMessage::TeamJoined {
                                team_name: tname.clone(),
                                usernames: updated_usernames,
                            });
                        }
                    }
                }
            });
        }
    } else {
        tracing::debug!(action = "disconnected", note = "no username set");
    }
}
