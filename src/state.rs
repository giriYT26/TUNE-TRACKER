use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TeamStatus {
    Waiting,
    Answering,
    Disqualified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuzzerEvent {
    pub team_name: String,
    pub username: String,
    pub position: usize,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RoundState {
    Idle,
    Active,
    Locked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Round {
    pub id: Uuid,
    pub state: RoundState,
    pub buzzer_order: Vec<BuzzerEvent>,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    BuzzerUpdate { buzzer_order: Vec<BuzzerEvent> },
    RoundState { state: RoundState },
    RoundName { name: String },
    TeamStatus { team_name: String, username: String, status: TeamStatus, warning_count: u8 },
    TeamJoined { team_name: String, usernames: Vec<String> },
    ViolationReport { team_name: String, username: String, kind: String, warning_count: u8 },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Join { team_name: String, action: String },
    Username { username: String },
    Buzz,
    Violation { kind: String },
    Start,
    Lock,
    Reset,
    SetRoundName { name: String },
    Disqualify { team_name: String, username: Option<String> },
}

pub struct AppState {
    pub current_round: RwLock<Round>,
    pub tx: broadcast::Sender<ServerMessage>,
    pub connected_teams: RwLock<HashMap<String, Vec<String>>>,
    pub connected_users: RwLock<HashMap<String, String>>,
}

impl AppState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self {
            current_round: RwLock::new(Round {
                id: Uuid::new_v4(),
                state: RoundState::Idle,
                buzzer_order: Vec::new(),
                name: "Round 1".to_string(),
            }),
            tx,
            connected_teams: RwLock::new(HashMap::new()),
            connected_users: RwLock::new(HashMap::new()),
        }
    }

    pub async fn join_team(&self, team_name: String, action: String) -> Result<(), String> {
        let teams = self.connected_teams.read().await;
        let team_exists = teams.contains_key(&team_name);
        drop(teams);

        if action == "create" {
            if team_exists {
                return Err("Team name already taken".to_string());
            }
            let mut teams = self.connected_teams.write().await;
            teams.insert(team_name, Vec::new());
        } else {
            if !team_exists {
                return Err("Team not found. Create a new team instead.".to_string());
            }
        }
        Ok(())
    }

    pub async fn add_username(&self, team_name: String, username: String) -> Result<(), String> {
        let users = self.connected_users.read().await;
        if users.contains_key(&username) {
            return Err("Username already taken".to_string());
        }
        drop(users);

        let mut users = self.connected_users.write().await;
        users.insert(username.clone(), team_name.clone());

        let mut teams = self.connected_teams.write().await;
        if let Some(members) = teams.get_mut(&team_name) {
            members.push(username);
        }

        let usernames = teams.get(&team_name).cloned().unwrap_or_default();
        let _ = self.tx.send(ServerMessage::TeamJoined {
            team_name,
            usernames,
        });

        Ok(())
    }

    pub async fn add_buzzer_event(&self, username: String) -> Option<BuzzerEvent> {
        let mut round = self.current_round.write().await;
        if round.state != RoundState::Active {
            return None;
        }
        if round.buzzer_order.iter().any(|e| e.username == username) {
            return None;
        }
        let users = self.connected_users.read().await;
        let team_name = users.get(&username)?.clone();
        let position = round.buzzer_order.len() + 1;
        let event = BuzzerEvent {
            team_name,
            username,
            position,
            timestamp: chrono::Utc::now().format("%H:%M:%S%.3f").to_string(),
        };
        round.buzzer_order.push(event.clone());

        let update = ServerMessage::BuzzerUpdate {
            buzzer_order: round.buzzer_order.clone(),
        };
        let _ = self.tx.send(update);
        Some(event)
    }

    pub async fn set_round_state(&self, state: RoundState) {
        let mut round = self.current_round.write().await;
        round.state = state.clone();
        let _ = self.tx.send(ServerMessage::RoundState { state });
    }

    pub async fn set_round_name(&self, name: String) {
        let mut round = self.current_round.write().await;
        round.name = name.clone();
        let _ = self.tx.send(ServerMessage::RoundName { name });
    }

    pub async fn reset_buzzer(&self) {
        let mut round = self.current_round.write().await;
        round.buzzer_order.clear();
        let update = ServerMessage::BuzzerUpdate {
            buzzer_order: Vec::new(),
        };
        let _ = self.tx.send(update);
    }

    pub async fn handle_violation(&self, username: String, kind: String) {
        let users = self.connected_users.read().await;
        let team_name = match users.get(&username) {
            Some(t) => t.clone(),
            None => return,
        };
        drop(users);

        let _ = self.tx.send(ServerMessage::ViolationReport {
            team_name,
            username,
            kind,
            warning_count: 0,
        });
    }

    pub async fn disqualify_user(&self, team_name: String, username: Option<String>) {
        let _ = self.tx.send(ServerMessage::TeamStatus {
            team_name: team_name.clone(),
            username: username.clone().unwrap_or_default(),
            status: TeamStatus::Disqualified,
            warning_count: 3,
        });
    }

    pub async fn remove_user(&self, username: &str) {
        let mut users = self.connected_users.write().await;
        users.remove(username);

        let mut teams = self.connected_teams.write().await;
        for members in teams.values_mut() {
            members.retain(|u| u != username);
        }
        teams.retain(|_, v| !v.is_empty());
    }
}
