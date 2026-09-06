mod state;
mod ws;

use axum::{routing::get, Router};
use std::sync::Arc;

use crate::state::AppState;

#[tokio::main]
async fn main() {
    let shared_state: Arc<AppState> = Arc::new(AppState::new());

    let app = Router::new()
        .route("/ws/team", get(ws::team::handler))
        .route("/ws/host", get(ws::host::handler))
        .with_state(shared_state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .expect("failed to bind port 3000");

    println!("Tune Tracker listening on http://0.0.0.0:3000");
    axum::serve(listener, app).await.expect("server error");
}
