use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

const MAX_TEAM_SIZE: usize = 1;

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
    pub frozen_elapsed_ms: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub team_name: String,
    pub username: String,
    pub joined_at_ms: u64,
    pub renamed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    BuzzerUpdate { buzzer_order: Vec<BuzzerEvent> },
    RoundState { state: RoundState, started_at_ms: Option<u64>, server_now: u64, frozen_elapsed_ms: Option<u64> },
    RoundName { name: String },
    TeamStatus { team_name: String, username: String, status: TeamStatus, warning_count: u8 },
    TeamJoined { team_name: String, usernames: Vec<String> },
    ViolationReport { team_name: String, username: String, kind: String, warning_count: u8 },
    Kicked { team_name: String, username: String },
    TeamLock { locked: bool },
    TeamNameChanged { old_name: String, new_name: String },
    UsernameAccepted { session_token: String, round_name: String },
    ReconnectAccepted { session_token: String, team_name: String, username: String, round_name: String },
    UsernameStatus { team_name: Option<String> },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Join { team_name: String, action: String },
    Username { username: String },
    Reconnect { session_token: String },
    GetTeams,
    Buzz { #[serde(default)] reaction_time_ms: Option<u64> },
    Violation { kind: String },
    Start,
    Lock,
    Reset,
    NextQuestion,
    SetRoundName { name: String },
    Disqualify { team_name: String, username: Option<String> },
    KickUser { team_name: String, username: String },
    ResetViolations,
    LockTeams,
    UnlockTeams,
    RemoveTeam { team_name: String },
    SetTeamName { team_name: String, new_name: String },
    Leave,
    CheckUsername { username: String },
}

pub struct AppState {
    pub current_round: RwLock<Round>,
    pub tx: broadcast::Sender<ServerMessage>,
    pub connected_teams: RwLock<HashMap<String, Vec<String>>>,
    pub connected_users: RwLock<HashMap<String, String>>,
    pub warning_counts: RwLock<HashMap<String, u8>>,
    pub disqualified_users: RwLock<HashSet<String>>,
    pub teams_locked: RwLock<bool>,
    pub session_tokens: RwLock<HashMap<String, SessionInfo>>,
    pub active_connections: RwLock<HashMap<String, usize>>,
    pub user_team_map: RwLock<HashMap<String, String>>,
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
                frozen_elapsed_ms: None,
            }),
            tx,
            connected_teams: RwLock::new(HashMap::new()),
            connected_users: RwLock::new(HashMap::new()),
            warning_counts: RwLock::new(HashMap::new()),
            disqualified_users: RwLock::new(HashSet::new()),
            teams_locked: RwLock::new(false),
            session_tokens: RwLock::new(HashMap::new()),
            active_connections: RwLock::new(HashMap::new()),
            user_team_map: RwLock::new(HashMap::new()),
        }
    }

    pub async fn join_team(&self, team_name: String, action: String) -> Result<(), String> {
        let locked = *self.teams_locked.read().await;
        if locked {
            return Err("Teams are locked by the host".to_string());
        }

        let teams = self.connected_teams.read().await;
        let team_exists = teams.contains_key(&team_name);
        drop(teams);

        if action == "create" {
            if team_exists {
                return Err("Team name already taken".to_string());
            }
            let mut teams = self.connected_teams.write().await;
            teams.insert(team_name.clone(), Vec::new());
            tracing::info!(team = %team_name, action = "team_created");
        } else {
            if !team_exists {
                return Err("Team not found. Create a new team instead.".to_string());
            }
        }
        Ok(())
    }

    pub async fn add_username(&self, team_name: String, username: String) -> Result<String, String> {
        let users = self.connected_users.read().await;
        if users.contains_key(&username) {
            return Err("Username already taken".to_string());
        }
        drop(users);

        let user_teams = self.user_team_map.read().await;
        if let Some(existing_team) = user_teams.get(&username) {
            if existing_team != &team_name {
                return Err(format!("You already belong to team '{}'. Rejoin that team.", existing_team));
            }
        }
        drop(user_teams);

        let teams = self.connected_teams.read().await;
        let member_count = teams.get(&team_name).map_or(0, |m| m.len());
        drop(teams);

        if member_count >= MAX_TEAM_SIZE {
            return Err("Team is full (1 member per team)".to_string());
        }

        {
            let mut user_teams = self.user_team_map.write().await;
            user_teams.insert(username.clone(), team_name.clone());
        }

        let mut users = self.connected_users.write().await;
        users.insert(username.clone(), team_name.clone());

        let mut teams = self.connected_teams.write().await;
        if let Some(members) = teams.get_mut(&team_name) {
            members.push(username.clone());
        }

        let usernames = teams.get(&team_name).cloned().unwrap_or_default();
        let _ = self.tx.send(ServerMessage::TeamJoined {
            team_name: team_name.clone(),
            usernames,
        });

        let token = Uuid::new_v4().to_string();
        let session_info = SessionInfo {
            team_name: team_name.clone(),
            username: username.clone(),
            joined_at_ms: chrono::Utc::now().timestamp_millis() as u64,
            renamed: false,
        };
        let mut tokens = self.session_tokens.write().await;
        tokens.insert(token.clone(), session_info);

        tracing::info!(
            username = %username,
            team = %team_name,
            action = "join",
            token = %token
        );

        Ok(token)
    }

    pub async fn resolve_session(&self, token: &str) -> Option<SessionInfo> {
        let tokens = self.session_tokens.read().await;
        tokens.get(token).cloned()
    }

    pub async fn remove_session(&self, token: &str) {
        let mut tokens = self.session_tokens.write().await;
        if let Some(info) = tokens.remove(token) {
            tracing::info!(
                username = %info.username,
                team = %info.team_name,
                action = "session_removed",
                token = %token
            );
        }
    }

    pub async fn add_buzzer_event(&self, username: String) -> Option<BuzzerEvent> {
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
        let now_ms = chrono::Utc::now().timestamp_millis() as u64;
        let reaction_time_ms = round.started_at_ms.map(|start| now_ms.saturating_sub(start));
        let event = BuzzerEvent {
            team_name: team_name.clone(),
            username: username.clone(),
            position,
            reaction_time_ms,
        };
        round.buzzer_order.push(event.clone());

        let update = ServerMessage::BuzzerUpdate {
            buzzer_order: round.buzzer_order.clone(),
        };
        let _ = self.tx.send(update);

        tracing::info!(
            username = %username,
            team = %team_name,
            action = "buzz",
            position = position,
            reaction_ms = ?reaction_time_ms
        );

        Some(event)
    }

    pub async fn set_round_state(&self, state: RoundState) {
        let mut round = self.current_round.write().await;
        let current_state = round.state.clone();
        let now_ms = chrono::Utc::now().timestamp_millis() as u64;
        if state == RoundState::Active && current_state == RoundState::Idle {
            round.started_at_ms = Some(now_ms);
            round.buzzer_order.clear();
            round.frozen_elapsed_ms = None;
        } else if state == RoundState::Active && current_state == RoundState::Locked {
            if let (Some(_started), Some(frozen)) = (round.started_at_ms, round.frozen_elapsed_ms) {
                round.started_at_ms = Some(now_ms - frozen);
            }
            round.frozen_elapsed_ms = None;
        } else if state == RoundState::Locked && current_state == RoundState::Active {
            if let Some(started) = round.started_at_ms {
                round.frozen_elapsed_ms = Some(now_ms.saturating_sub(started));
            }
        } else if state == RoundState::Idle {
            round.started_at_ms = None;
            round.buzzer_order.clear();
            round.frozen_elapsed_ms = None;
        }
        let buzzer_order = round.buzzer_order.clone();
        let started_at_ms = round.started_at_ms;
        let frozen_elapsed_ms = round.frozen_elapsed_ms;
        round.state = state.clone();
        let _ = self.tx.send(ServerMessage::RoundState { state, started_at_ms, server_now: now_ms, frozen_elapsed_ms });
        let _ = self.tx.send(ServerMessage::BuzzerUpdate { buzzer_order });
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
            server_now: chrono::Utc::now().timestamp_millis() as u64,
            frozen_elapsed_ms: None,
        });
        tracing::info!(action = "buzzer_reset");
    }

    pub async fn next_question(&self) {
        let mut round = self.current_round.write().await;
        round.id = Uuid::new_v4();
        round.buzzer_order.clear();
        let now_ms = chrono::Utc::now().timestamp_millis() as u64;
        round.started_at_ms = Some(now_ms);
        round.frozen_elapsed_ms = None;
        round.state = RoundState::Active;
        let started_at_ms = round.started_at_ms;
        let _ = self.tx.send(ServerMessage::BuzzerUpdate {
            buzzer_order: Vec::new(),
        });
        let _ = self.tx.send(ServerMessage::RoundState {
            state: RoundState::Active,
            started_at_ms,
            server_now: now_ms,
            frozen_elapsed_ms: None,
        });
        tracing::info!(action = "next_question");
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

        tracing::warn!(
            username = %username,
            team = %team_name,
            action = "violation",
            kind = %kind,
            warning_count = warning_count
        );

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

        for u in &users_to_dq {
            tracing::info!(
                username = %u,
                team = %team_name,
                action = "disqualify"
            );
            self.remove_user_with_broadcast(u).await;
        }

        {
            let mut dq = self.disqualified_users.write().await;
            for u in &users_to_dq {
                dq.insert(u.clone());
            }
        }

        for u in &users_to_dq {
            let _ = self.tx.send(ServerMessage::TeamStatus {
                team_name: team_name.clone(),
                username: u.clone(),
                status: TeamStatus::Disqualified,
                warning_count: 3,
            });
        }
    }

    pub async fn reset_violations(&self) {
        let mut counts = self.warning_counts.write().await;
        counts.clear();
        let mut dq = self.disqualified_users.write().await;
        dq.clear();
        tracing::info!(action = "violations_reset");
    }

    pub async fn lock_teams(&self) {
        let mut locked = self.teams_locked.write().await;
        *locked = true;
        let _ = self.tx.send(ServerMessage::TeamLock { locked: true });
        tracing::info!(action = "teams_locked");
    }

    pub async fn unlock_teams(&self) {
        let mut locked = self.teams_locked.write().await;
        *locked = false;
        let _ = self.tx.send(ServerMessage::TeamLock { locked: false });
        tracing::info!(action = "teams_unlocked");
    }

    pub async fn kick_user(&self, team_name: String, username: String) {
        tracing::info!(
            username = %username,
            team = %team_name,
            action = "kick"
        );
        self.remove_user_with_broadcast(&username).await;
        let _ = self.tx.send(ServerMessage::Kicked { team_name, username });
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
                members.clone()
            } else {
                Vec::new()
            }
        };

        tracing::info!(
            username = %username,
            team = %team_name,
            action = "disconnect"
        );

        let _ = self.tx.send(ServerMessage::TeamJoined {
            team_name,
            usernames: updated_usernames,
        });
    }

    pub async fn remove_team(&self, team_name: String) {
        let mut teams = self.connected_teams.write().await;
        teams.remove(&team_name);
        drop(teams);

        let mut user_teams = self.user_team_map.write().await;
        user_teams.retain(|_, t| t != &team_name);

        tracing::info!(team = %team_name, action = "team_removed");
    }

    pub async fn check_username(&self, username: &str) -> Option<String> {
        let user_teams = self.user_team_map.read().await;
        user_teams.get(username).cloned()
    }

    pub async fn rename_team(&self, team_name: String, new_name: String) -> Result<(), String> {
        let teams = self.connected_teams.read().await;
        if teams.contains_key(&new_name) {
            return Err("Team name already taken".to_string());
        }
        if !teams.contains_key(&team_name) {
            return Err("Team not found".to_string());
        }
        drop(teams);

        let mut tokens = self.session_tokens.write().await;
        for info in tokens.values_mut() {
            if info.team_name == team_name {
                if info.renamed {
                    return Err("Team can only be renamed once".to_string());
                }
            }
        }
        for info in tokens.values_mut() {
            if info.team_name == team_name {
                info.renamed = true;
            }
        }
        drop(tokens);

        let members: Vec<String>;
        {
            let mut teams = self.connected_teams.write().await;
            members = teams.get(&team_name).cloned().unwrap_or_default();
            if let Some(m) = teams.remove(&team_name) {
                teams.insert(new_name.clone(), m);
            }
        }

        {
            let mut users = self.connected_users.write().await;
            for member in &members {
                if let Some(t) = users.get_mut(member) {
                    *t = new_name.clone();
                }
            }
        }

        {
            let mut user_teams = self.user_team_map.write().await;
            for member in &members {
                if let Some(t) = user_teams.get_mut(member) {
                    *t = new_name.clone();
                }
            }
        }

        let _ = self.tx.send(ServerMessage::TeamNameChanged {
            old_name: team_name,
            new_name,
        });
        Ok(())
    }

    pub async fn track_connection(&self, username: &str) -> bool {
        let mut conns = self.active_connections.write().await;
        let count = conns.entry(username.to_string()).or_insert(0);
        *count += 1;
        *count > 1
    }

    pub async fn untrack_connection(&self, username: &str) {
        let mut conns = self.active_connections.write().await;
        if let Some(count) = conns.get_mut(username) {
            if *count > 1 {
                *count -= 1;
            } else {
                conns.remove(username);
            }
        }
    }

    pub async fn has_active_connection(&self, username: &str) -> bool {
        let conns = self.active_connections.read().await;
        conns.get(username).map_or(false, |count| *count > 0)
    }

    pub async fn has_valid_session(&self, username: &str) -> bool {
        let tokens = self.session_tokens.read().await;
        tokens.values().any(|info| info.username == username)
    }
}
