// TODO: fill in as you work through workflow.md Phases 2, 3, 5.

let socket = null;

document.getElementById("join-btn").addEventListener("click", () => {
  const teamName = document.getElementById("team-name-input").value.trim();
  if (!teamName) return;

  // TODO: open the WS connection and send the join message
  // socket = new WebSocket(`ws://${location.host}/ws/team`);
  // socket.onopen = () => socket.send(JSON.stringify({ type: "join", team_name: teamName }));
  // socket.onmessage = handleServerMessage;
  // socket.onclose = () => { /* update connection-status */ };
});

document.getElementById("buzzer-btn").addEventListener("click", () => {
  // TODO: send({ type: "buzz" }), then show #buzzer-registered and disable
  // the button until the server resets the round (prevents double-press).
});

function handleServerMessage(event) {
  // TODO: parse JSON, branch on `type`:
  //   "buzzer_update" -> render whether this team is Answering/Waiting
  //   "round_state"   -> toggle buzzer-btn enabled/disabled
  //   "team_status"   -> show disqualified state if it's this team
}

// --- Anti-cheat sensors ---
// These only detect and report. All warning-count and disqualification
// logic lives server-side (see src/anticheat.rs) so the client can't lie
// about its own record.

function reportViolation(kind) {
  // TODO: socket?.send(JSON.stringify({ type: "violation", kind }));
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) reportViolation("tab_switch");
});

window.addEventListener("blur", () => {
  reportViolation("window_blur");
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) reportViolation("fullscreen_exit");
});
