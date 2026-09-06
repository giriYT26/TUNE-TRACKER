use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

pub type TeamId = Uuid;
pub type RoundId = Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TeamStatus {
    Waiting,
    Answering,
    Disqualified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: TeamId,
    pub name: String,
    pub status: TeamStatus,
    pub warning_count: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuzzerEvent {
    pub team_id: TeamId,
    pub position: usize,
    pub server_timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RoundState {
    Idle,
    Active,
    Locked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Round {
    pub id: RoundId,
    pub state: RoundState,
    pub buzzer_order: Vec<BuzzerEvent>,
}

/// Messages broadcast out to every connected client (team or host).
/// See Architecture.md "Server -> all clients" for the JSON shapes these
/// should serialize to.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    BuzzerUpdate { buzzer_order: Vec<BuzzerEvent> },
    RoundState { state: RoundState },
    TeamStatus { team_name: String, status: TeamStatus },
}

pub struct AppState {
    pub teams: RwLock<HashMap<TeamId, Team>>,
    pub current_round: RwLock<Round>,
    pub tx: broadcast::Sender<ServerMessage>,
}

impl AppState {
    pub fn new() -> Self {
        // TODO: pick a broadcast channel capacity (e.g. 100) — this is how
        // many unsent messages can queue for a slow client before it starts
        // lagging/dropping messages.
        todo!("construct AppState with empty teams, an Idle round, and tx")
    }

    // TODO: add methods here as you need them, e.g.
    //   - async fn add_buzzer_event(&self, team_id: TeamId) -> BuzzerEvent
    //     (the core ordering logic from workflow.md Phase 3 goes here —
    //     take the RwLock write guard, timestamp, push, assign position,
    //     then broadcast)
    //   - async fn join_team(&self, name: String) -> Result<Team, JoinError>
    //   - async fn set_round_state(&self, state: RoundState)
}
