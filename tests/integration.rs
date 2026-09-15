use futures::{SinkExt, StreamExt};
use serde_json::Value;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use tune_tracker::create_app;
use tune_tracker::state::AppState;

type Ws =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn start_server() -> (String, String, Arc<AppState>) {
    let state = Arc::new(AppState::new());
    let app = create_app(state.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let base = format!("127.0.0.1:{}", addr.port());
    let team_url = format!("ws://{}/ws/team", base);
    let host_url = format!("ws://{}/ws/host", base);
    (team_url, host_url, state)
}

async fn connect_ws(url: &str) -> Ws {
    let (ws, _) = connect_async(url).await.expect("Failed to connect");
    ws
}

async fn send_msg(ws: &mut Ws, msg: &Value) {
    ws.send(Message::Text(msg.to_string().into()))
        .await
        .unwrap();
}

async fn find_msg(ws: &mut Ws, msg_type: &str, timeout: Duration) -> Option<Value> {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return None;
        }
        match tokio::time::timeout(remaining, ws.next()).await {
            Ok(Some(Ok(Message::Text(t)))) => {
                if let Ok(v) = serde_json::from_str::<Value>(&t) {
                    if v["type"] == msg_type {
                        return Some(v);
                    }
                }
            }
            Ok(Some(Ok(_))) => continue,
            _ => return None,
        }
    }
}

async fn wait_for(ws: &mut Ws, msg_type: &str) -> Value {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            panic!("Timed out waiting for message type '{}'", msg_type);
        }
        match tokio::time::timeout(remaining, ws.next()).await {
            Ok(Some(Ok(Message::Text(t)))) => {
                if let Ok(v) = serde_json::from_str::<Value>(&t) {
                    if v["type"] == msg_type {
                        return v;
                    }
                }
            }
            Ok(Some(Ok(_))) => continue,
            Ok(Some(Err(_))) | Ok(None) => {
                panic!("Connection closed while waiting for '{}'", msg_type);
            }
            Err(_) => {
                panic!("Timed out waiting for message type '{}'", msg_type);
            }
        }
    }
}

async fn setup_user(url: &str, team: &str, username: &str, create: bool) -> Ws {
    let mut ws = connect_ws(url).await;

    let action = if create { "create" } else { "join" };
    send_msg(
        &mut ws,
        &serde_json::json!({
            "type": "join", "team_name": team, "action": action
        }),
    )
    .await;
    wait_for(&mut ws, "joined").await;

    send_msg(
        &mut ws,
        &serde_json::json!({
            "type": "username", "username": username
        }),
    )
    .await;
    wait_for(&mut ws, "username_accepted").await;

    ws
}

async fn setup_user_with_token(url: &str, team: &str, username: &str, create: bool) -> (Ws, String) {
    let mut ws = connect_ws(url).await;

    let action = if create { "create" } else { "join" };
    send_msg(
        &mut ws,
        &serde_json::json!({
            "type": "join", "team_name": team, "action": action
        }),
    )
    .await;
    wait_for(&mut ws, "joined").await;

    send_msg(
        &mut ws,
        &serde_json::json!({
            "type": "username", "username": username
        }),
    )
    .await;
    let resp = wait_for(&mut ws, "username_accepted").await;
    let token = resp["session_token"].as_str().unwrap().to_string();
    (ws, token)
}

async fn setup_host(host_url: &str) -> Ws {
    let mut ws = connect_ws(host_url).await;
    loop {
        let remaining = Duration::from_secs(3);
        match tokio::time::timeout(remaining, ws.next()).await {
            Ok(Some(Ok(_))) => continue,
            _ => break,
        }
    }
    ws
}

// ======================== TESTS ========================

#[tokio::test]
async fn test_join_create_team() {
    let (team_url, _, _) = start_server().await;
    let mut ws = connect_ws(&team_url).await;

    send_msg(
        &mut ws,
        &serde_json::json!({
            "type": "join", "team_name": "Alpha", "action": "create"
        }),
    )
    .await;
    let resp = wait_for(&mut ws, "joined").await;
    assert_eq!(resp["type"], "joined");
}

#[tokio::test]
async fn test_join_existing_team() {
    let (team_url, _, _) = start_server().await;

    let _ws1 = setup_user(&team_url, "Alpha", "User1", true).await;
    let _ws2 = setup_user(&team_url, "Alpha", "User2", false).await;
}

#[tokio::test]
async fn test_team_size_limit() {
    let (team_url, _, _) = start_server().await;

    let _ws1 = setup_user(&team_url, "Alpha", "User1", true).await;
    let _ws2 = setup_user(&team_url, "Alpha", "User2", false).await;
    let _ws3 = setup_user(&team_url, "Alpha", "User3", false).await;
    let _ws4 = setup_user(&team_url, "Alpha", "User4", false).await;

    sleep(Duration::from_millis(100)).await;

    let mut ws5 = connect_ws(&team_url).await;
    send_msg(
        &mut ws5,
        &serde_json::json!({
            "type": "join", "team_name": "Alpha", "action": "join"
        }),
    )
    .await;
    wait_for(&mut ws5, "joined").await;

    send_msg(
        &mut ws5,
        &serde_json::json!({
            "type": "username", "username": "User5"
        }),
    )
    .await;
    let resp = wait_for(&mut ws5, "error").await;
    assert!(resp["message"].as_str().unwrap().contains("full"));
}

#[tokio::test]
async fn test_concurrent_buzz_10_users() {
    let (team_url, host_url, state) = start_server().await;

    let _ws_a = setup_user(&team_url, "Alpha", "Alpha1", true).await;
    let _ws_b = setup_user(&team_url, "Beta", "Beta1", true).await;
    let _ws_c = setup_user(&team_url, "Gamma", "Gamma1", true).await;

    let mut extras = Vec::new();
    for i in 0..7 {
        let team = match i {
            0 | 3 | 6 => "Alpha",
            1 | 4 => "Beta",
            _ => "Gamma",
        };
        let ws = setup_user(&team_url, team, &format!("U{}", i), false).await;
        extras.push(ws);
    }

    sleep(Duration::from_millis(100)).await;

    {
        let teams = state.connected_teams.read().await;
        assert_eq!(teams.len(), 3, "Expected 3 teams");
        assert_eq!(teams["Alpha"].len(), 4, "Alpha: Alpha1 + U0 + U3 + U6");
        assert_eq!(teams["Beta"].len(), 3, "Beta: Beta1 + U1 + U4");
        assert_eq!(teams["Gamma"].len(), 3, "Gamma: Gamma1 + U2 + U5");
    }

    let mut host = setup_host(&host_url).await;
    send_msg(&mut host, &serde_json::json!({ "type": "start" })).await;

    let round_msg = find_msg(&mut host, "round_state", Duration::from_secs(3)).await;
    assert!(round_msg.is_some(), "Host did not receive round_state");
    assert_eq!(round_msg.unwrap()["state"], "Active");

    sleep(Duration::from_millis(100)).await;

    for ws in extras.iter_mut() {
        send_msg(ws, &serde_json::json!({ "type": "buzz", "reaction_time_ms": 100 })).await;
    }
    sleep(Duration::from_millis(300)).await;

    let buzzer_order = &state.current_round.read().await.buzzer_order;
    assert_eq!(
        buzzer_order.len(),
        3,
        "Expected 3 buzzer events (one per team), got {}",
        buzzer_order.len()
    );
}

#[tokio::test]
async fn test_round_state_broadcast() {
    let (team_url, host_url, _) = start_server().await;

    let mut users = Vec::new();
    for i in 0..3 {
        let ws = setup_user(&team_url, &format!("Team{}", i), &format!("User{}", i), true).await;
        users.push(ws);
    }

    sleep(Duration::from_millis(100)).await;

    let mut host = setup_host(&host_url).await;
    send_msg(&mut host, &serde_json::json!({ "type": "start" })).await;

    let host_msg = find_msg(&mut host, "round_state", Duration::from_secs(3)).await;
    assert!(host_msg.is_some(), "Host did not receive round_state");

    sleep(Duration::from_millis(200)).await;

    for ws in users.iter_mut() {
        let msg = find_msg(ws, "round_state", Duration::from_secs(3)).await;
        assert!(msg.is_some(), "User did not receive round_state");
        assert_eq!(msg.unwrap()["state"], "Active");
    }
}

#[tokio::test]
async fn test_session_token_reconnect() {
    let (team_url, _, _) = start_server().await;

    let (mut _ws1, token) = setup_user_with_token(&team_url, "Alpha", "ReconnectUser", true).await;
    assert!(!token.is_empty());

    _ws1.close(None).await.ok();
    sleep(Duration::from_millis(200)).await;

    let mut ws3 = connect_ws(&team_url).await;
    send_msg(
        &mut ws3,
        &serde_json::json!({
            "type": "reconnect", "session_token": token
        }),
    )
    .await;
    let resp = wait_for(&mut ws3, "reconnect_accepted").await;
    assert_eq!(resp["team_name"], "Alpha");
    assert_eq!(resp["username"], "ReconnectUser");
}

#[tokio::test]
async fn test_kick_and_disqualify() {
    let (team_url, host_url, state) = start_server().await;

    let mut ws = setup_user(&team_url, "Alpha", "KickMe", true).await;
    sleep(Duration::from_millis(100)).await;

    let mut host = setup_host(&host_url).await;
    sleep(Duration::from_millis(100)).await;

    send_msg(
        &mut host,
        &serde_json::json!({
            "type": "kick_user", "team_name": "Alpha", "username": "KickMe"
        }),
    )
    .await;

    let resp = find_msg(&mut ws, "kicked", Duration::from_secs(3)).await;
    assert!(resp.is_some(), "User did not receive kicked message");
    assert_eq!(resp.unwrap()["username"], "KickMe");

    sleep(Duration::from_millis(100)).await;

    let teams = state.connected_teams.read().await;
    assert!(
        !teams.contains_key("Alpha") || teams["Alpha"].is_empty(),
        "Alpha team should be empty after kick"
    );
}

#[tokio::test]
async fn test_lock_teams_prevents_join() {
    let (team_url, host_url, state) = start_server().await;

    let mut host = setup_host(&host_url).await;
    sleep(Duration::from_millis(100)).await;

    send_msg(&mut host, &serde_json::json!({ "type": "lock_teams" })).await;

    let resp = find_msg(&mut host, "team_lock", Duration::from_secs(3)).await;
    assert!(resp.is_some(), "Host did not receive team_lock message");
    assert_eq!(resp.unwrap()["locked"], true);

    let locked = *state.teams_locked.read().await;
    assert!(locked, "Server should have teams locked");

    let mut ws = connect_ws(&team_url).await;
    send_msg(
        &mut ws,
        &serde_json::json!({
            "type": "join", "team_name": "Alpha", "action": "create"
        }),
    )
    .await;
    let resp = wait_for(&mut ws, "error").await;
    assert!(resp["message"].as_str().unwrap().contains("locked"));
}
