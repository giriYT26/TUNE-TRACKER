mod anticheat;
mod state;
mod ws;

use axum::{routing::get, Router};
use std::sync::Arc;
use tower_http::services::ServeDir;

use crate::state::AppState;

#[tokio::main]
async fn main() {
    // TODO: initialize AppState (see state.rs) and wrap it in an Arc so it
    // can be cloned into every handler.
    let shared_state: Arc<AppState> = todo!("build AppState::new() and Arc it");

    let app = Router::new()
        // TODO: wire these up to the handlers in ws/team.rs and ws/host.rs
        .route("/ws/team", get(ws::team::handler))
        .route("/ws/host", get(ws::host::handler))
        // Serves static/team.html, static/host.html, static/*.js
        .nest_service("/", ServeDir::new("static"))
        .with_state(shared_state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .expect("failed to bind port 3000");

    println!("Tune Tracker listening on http://0.0.0.0:3000");
    axum::serve(listener, app).await.expect("server error");
}
