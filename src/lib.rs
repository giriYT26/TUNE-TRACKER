pub mod state;
pub mod ws;

use axum::{routing::get, Router};
use std::sync::Arc;
use tower_http::services::{ServeDir, ServeFile};

use crate::state::AppState;

pub fn create_app(state: Arc<AppState>) -> Router {
    let spa_fallback =
        ServeDir::new("frontend/dist").fallback(ServeFile::new("frontend/dist/index.html"));

    Router::new()
        .route("/ws/team", get(ws::team::handler))
        .route("/ws/host", get(ws::host::handler))
        .fallback_service(spa_fallback)
        .with_state(state)
}

pub fn create_test_app() -> Router {
    create_app(Arc::new(AppState::new()))
}
