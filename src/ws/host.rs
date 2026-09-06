use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use std::sync::Arc;

use crate::state::{AppState, ClientMessage, RoundState};

pub async fn handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    {
        let round = state.current_round.read().await;
        let update = crate::state::ServerMessage::BuzzerUpdate {
            buzzer_order: round.buzzer_order.clone(),
        };
        let _ = sender.send(Message::Text(serde_json::to_string(&update).unwrap().into())).await;
        let state_msg = crate::state::ServerMessage::RoundState {
            state: round.state.clone(),
            started_at_ms: round.started_at_ms,
        };
        let _ = sender.send(Message::Text(serde_json::to_string(&state_msg).unwrap().into())).await;
        let name_msg = crate::state::ServerMessage::RoundName {
            name: round.name.clone(),
        };
        let _ = sender.send(Message::Text(serde_json::to_string(&name_msg).unwrap().into())).await;

        let teams = state.connected_teams.read().await;
        for (team_name, usernames) in teams.iter() {
            let joined = crate::state::ServerMessage::TeamJoined {
                team_name: team_name.clone(),
                usernames: usernames.clone(),
            };
            let _ = sender.send(Message::Text(serde_json::to_string(&joined).unwrap().into())).await;
        }
    }

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let text = serde_json::to_string(&msg).unwrap();
            if sender.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    let state2 = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            let parsed: ClientMessage = match serde_json::from_str(&text) {
                Ok(m) => m,
                Err(_) => continue,
            };

            match parsed {
                ClientMessage::Start => {
                    state2.set_round_state(RoundState::Active).await;
                }
                ClientMessage::Lock => {
                    state2.set_round_state(RoundState::Locked).await;
                }
                ClientMessage::Reset => {
                    state2.reset_buzzer().await;
                }
                ClientMessage::NextQuestion => {
                    state2.next_question().await;
                }
                ClientMessage::SetRoundName { name } => {
                    state2.set_round_name(name).await;
                }
                ClientMessage::Disqualify { team_name, username } => {
                    state2.disqualify_user(team_name, username).await;
                }
                ClientMessage::ResetViolations => {
                    state2.reset_violations().await;
                }
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }
}
