mod state;
mod ws;

use axum::{routing::get, Router};
use std::sync::Arc;
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::EnvFilter;

use crate::state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tune_tracker=debug")),
        )
        .init();

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());

    let shared_state: Arc<AppState> = Arc::new(AppState::new());

    let spa_fallback =
        ServeDir::new("frontend/dist").fallback(ServeFile::new("frontend/dist/index.html"));

    let app = Router::new()
        .route("/ws/team", get(ws::team::handler))
        .route("/ws/host", get(ws::host::handler))
        .fallback_service(spa_fallback)
        .with_state(shared_state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind port");

    tracing::info!("Tune Tracker listening on http://0.0.0.0:{}", port);
    axum::serve(listener, app).await.expect("server error");
}
