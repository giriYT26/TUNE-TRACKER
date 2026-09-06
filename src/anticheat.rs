use serde::Deserialize;

/// Kinds of violation the frontend can report. Keep this in sync with the
/// `kind` strings sent from static/team.js.
#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum ViolationKind {
    TabSwitch,
    WindowBlur,
    FullscreenExit,
    MultipleTabs,
}

// TODO: pick your threshold — spec doesn't fix a number.
pub const DISQUALIFY_AFTER: u8 = 3;

/// Returns true if this violation pushes the team over the disqualification
/// threshold. Call this from the team WS loop (ws/team.rs) after
/// incrementing warning_count on the Team in AppState.
pub fn should_disqualify(warning_count: u8) -> bool {
    warning_count >= DISQUALIFY_AFTER
}

// TODO: as you build this out, decide whether all violation kinds count
// equally toward the threshold, or whether some (e.g. FullscreenExit)
// should disqualify immediately.
