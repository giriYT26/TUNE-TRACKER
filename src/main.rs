use std::sync::Arc;
use tracing_subscriber::EnvFilter;

use tune_tracker::{create_app, state::AppState};

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
    let app = create_app(shared_state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind port");

    tracing::info!("Tune Tracker listening on http://0.0.0.0:{}", port);
    axum::serve(listener, app).await.expect("server error");
}
