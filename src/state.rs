use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

const MAX_TEAM_SIZE: usize = 4;

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
    pub reaction_time_ms: Option<u64>,
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
    pub started_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    BuzzerUpdate { buzzer_order: Vec<BuzzerEvent> },
    RoundState { state: RoundState, started_at_ms: Option<u64> },
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
    GetTeams,
    Buzz { reaction_time_ms: Option<u64> },
    Violation { kind: String },
    Start,
    Lock,
    Reset,
    NextQuestion,
    SetRoundName { name: String },
    Disqualify { team_name: String, username: Option<String> },
    Leave,
}

pub struct AppState {
    pub current_round: RwLock<Round>,
    pub tx: broadcast::Sender<ServerMessage>,
    pub connected_teams: RwLock<HashMap<String, Vec<String>>>,
    pub connected_users: RwLock<HashMap<String, String>>,
    pub warning_counts: RwLock<HashMap<String, u8>>,
    pub disqualified_users: RwLock<HashSet<String>>,
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
                started_at_ms: None,
            }),
            tx,
            connected_teams: RwLock::new(HashMap::new()),
            connected_users: RwLock::new(HashMap::new()),
            warning_counts: RwLock::new(HashMap::new()),
            disqualified_users: RwLock::new(HashSet::new()),
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

        let teams = self.connected_teams.read().await;
        let member_count = teams.get(&team_name).map_or(0, |m| m.len());
        drop(teams);

        if member_count >= MAX_TEAM_SIZE {
            return Err("Team is full (max 4 members)".to_string());
        }

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

    pub async fn add_buzzer_event(&self, username: String, reaction_time_ms: Option<u64>) -> Option<BuzzerEvent> {
        let disqualified = self.disqualified_users.read().await;
        if disqualified.contains(&username) {
            return None;
        }
        drop(disqualified);

        let mut round = self.current_round.write().await;
        if round.state != RoundState::Active {
            return None;
        }
        let users = self.connected_users.read().await;
        let team_name = users.get(&username)?.clone();
        drop(users);
        if round.buzzer_order.iter().any(|e| e.team_name == team_name) {
            return None;
        }
        let position = round.buzzer_order.len() + 1;
        let event = BuzzerEvent {
            team_name,
            username,
            position,
            reaction_time_ms,
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
        if state == RoundState::Active {
            round.started_at_ms = Some(chrono::Utc::now().timestamp_millis() as u64);
        } else if state == RoundState::Idle {
            round.started_at_ms = None;
        }
        let started_at_ms = round.started_at_ms;
        round.state = state.clone();
        let _ = self.tx.send(ServerMessage::RoundState { state, started_at_ms });
    }

    pub async fn set_round_name(&self, name: String) {
        let mut round = self.current_round.write().await;
        round.name = name.clone();
        let _ = self.tx.send(ServerMessage::RoundName { name });
    }

    pub async fn reset_buzzer(&self) {
        let mut round = self.current_round.write().await;
        round.buzzer_order.clear();
        round.started_at_ms = None;
        round.state = RoundState::Idle;
        let update = ServerMessage::BuzzerUpdate {
            buzzer_order: Vec::new(),
        };
        let _ = self.tx.send(update);
        let _ = self.tx.send(ServerMessage::RoundState {
            state: RoundState::Idle,
            started_at_ms: None,
        });
    }

    pub async fn next_question(&self) {
        let mut round = self.current_round.write().await;
        round.id = Uuid::new_v4();
        round.buzzer_order.clear();
        round.started_at_ms = Some(chrono::Utc::now().timestamp_millis() as u64);
        round.state = RoundState::Active;
        let started_at_ms = round.started_at_ms;
        let _ = self.tx.send(ServerMessage::BuzzerUpdate {
            buzzer_order: Vec::new(),
        });
        let _ = self.tx.send(ServerMessage::RoundState {
            state: RoundState::Active,
            started_at_ms,
        });
    }

    pub async fn handle_violation(&self, username: String, kind: String) {
        let users = self.connected_users.read().await;
        let team_name = match users.get(&username) {
            Some(t) => t.clone(),
            None => return,
        };
        drop(users);

        let mut counts = self.warning_counts.write().await;
        let count = counts.entry(username.clone()).or_insert(0);
        *count += 1;
        let warning_count = *count;
        drop(counts);

        let _ = self.tx.send(ServerMessage::ViolationReport {
            team_name,
            username,
            kind,
            warning_count,
        });
    }

    pub async fn disqualify_user(&self, team_name: String, username: Option<String>) {
        let users_to_dq: Vec<String> = {
            if let Some(ref uname) = username {
                vec![uname.clone()]
            } else {
                let teams = self.connected_teams.read().await;
                teams.get(&team_name).cloned().unwrap_or_default()
            }
        };

        {
            let mut dq = self.disqualified_users.write().await;
            for u in &users_to_dq {
                dq.insert(u.clone());
            }
        }

        let display_name = username.clone().unwrap_or_default();
        let _ = self.tx.send(ServerMessage::TeamStatus {
            team_name,
            username: display_name,
            status: TeamStatus::Disqualified,
            warning_count: 3,
        });
    }

    pub async fn remove_user_with_broadcast(&self, username: &str) {
        let team_name = {
            let users = self.connected_users.read().await;
            users.get(username).cloned()
        };

        let team_name = match team_name {
            Some(t) => t,
            None => return,
        };

        {
            let mut users = self.connected_users.write().await;
            users.remove(username);
        }

        let updated_usernames = {
            let mut teams = self.connected_teams.write().await;
            if let Some(members) = teams.get_mut(&team_name) {
                members.retain(|u| u != username);
                if members.is_empty() {
                    teams.remove(&team_name);
                    Vec::new()
                } else {
                    members.clone()
                }
            } else {
                Vec::new()
            }
        };

        let _ = self.tx.send(ServerMessage::TeamJoined {
            team_name,
            usernames: updated_usernames,
        });
    }
}
