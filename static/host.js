// TODO: fill in as you work through workflow.md Phase 4.

// const socket = new WebSocket(`ws://${location.host}/ws/host`);
// socket.onmessage = handleServerMessage;

function sendControl(type) {
  // TODO: socket.send(JSON.stringify({ type }));
}

document.getElementById("start-btn").addEventListener("click", () => sendControl("start"));
document.getElementById("lock-btn").addEventListener("click", () => sendControl("lock"));
document.getElementById("reset-btn").addEventListener("click", () => sendControl("reset"));
document.getElementById("next-btn").addEventListener("click", () => sendControl("next_question"));

function handleServerMessage(event) {
  // TODO: parse JSON, branch on `type`:
  //   "buzzer_update" -> rebuild #buzzer-order-body rows, in order,
  //     no cap on how many rows — every team that pressed should appear
  //   "round_state"   -> update #round-state-display
  //   "team_status"   -> update the matching row in #team-list
  //     (warning_count, Disqualified state)
}
