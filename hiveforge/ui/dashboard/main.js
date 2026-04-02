const sessionSelect = document.getElementById("session-select");
const reloadSessionsButton = document.getElementById("reload-sessions");
const agentList = document.getElementById("agent-list");
const timelineBody = document.getElementById("timeline-body");
const metricSessions = document.getElementById("metric-sessions");
const metricEvents = document.getElementById("metric-events");
const metricAgents = document.getElementById("metric-agents");

const providerSelect = document.getElementById("provider-select");
const saveProviderButton = document.getElementById("save-provider");
const settingsStatus = document.getElementById("settings-status");

const ceoObjective = document.getElementById("ceo-objective");
const ceoBudget = document.getElementById("ceo-budget");
const sendCeoButton = document.getElementById("send-ceo");
const ceoResponse = document.getElementById("ceo-response");

let currentReplay = null;

function previewPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const text = JSON.stringify(payload);
  return text.length > 100 ? `${text.slice(0, 100)}...` : text;
}

function renderReplay(replay) {
  currentReplay = replay;
  metricEvents.textContent = String(replay.event_count || 0);
  metricAgents.textContent = String((replay.agents || []).length);

  agentList.innerHTML = "";
  (replay.agents || []).forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    agentList.appendChild(li);
  });
  if ((replay.agents || []).length === 0) {
    const li = document.createElement("li");
    li.textContent = "No agent events in this session yet.";
    agentList.appendChild(li);
  }

  timelineBody.innerHTML = "";
  (replay.events || []).forEach((event) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${event.ts || ""}</td>
      <td>${event.event_type || ""}</td>
      <td>${event.agent_id || "-"}</td>
      <td>${event.source || ""}</td>
      <td>${previewPayload(event.payload)}</td>
    `;
    timelineBody.appendChild(row);
  });
}

async function loadReplay(sessionId) {
  if (!sessionId) {
    return;
  }
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/replay`);
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || "Unable to load replay");
  }
  renderReplay(data.replay);
}

async function loadSessions() {
  const response = await fetch("/api/sessions");
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || "Unable to load sessions");
  }

  const sessions = data.sessions || [];
  metricSessions.textContent = String(sessions.length);
  sessionSelect.innerHTML = "";

  sessions.forEach((sessionId) => {
    const option = document.createElement("option");
    option.value = sessionId;
    option.textContent = sessionId;
    sessionSelect.appendChild(option);
  });

  if (sessions.length > 0) {
    await loadReplay(sessions[sessions.length - 1]);
    sessionSelect.value = sessions[sessions.length - 1];
  } else {
    renderReplay({ event_count: 0, agents: [], events: [] });
  }
}

async function loadProviderSettings() {
  const response = await fetch("/api/settings/provider");
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || "Unable to load provider settings");
  }

  providerSelect.innerHTML = "";
  (data.providers || []).forEach((providerName) => {
    const option = document.createElement("option");
    option.value = providerName;
    option.textContent = providerName;
    providerSelect.appendChild(option);
  });
  providerSelect.value = data.active_provider;
}

async function saveProviderSettings() {
  settingsStatus.textContent = "Saving...";
  const response = await fetch("/api/settings/provider", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active_provider: providerSelect.value }),
  });
  const data = await response.json();
  if (!data.ok) {
    settingsStatus.textContent = `Error: ${data.error || "save failed"}`;
    return;
  }
  settingsStatus.textContent = `Saved active provider: ${data.active_provider}`;
}

async function sendCeoChat() {
  ceoResponse.textContent = "Running CEO analysis...";
  const response = await fetch("/api/ceo/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objective: ceoObjective.value,
      budget: Number(ceoBudget.value || 100),
      state: currentReplay ? { replay_event_count: currentReplay.event_count || 0 } : {},
    }),
  });
  const data = await response.json();
  if (!data.ok) {
    ceoResponse.textContent = `Error: ${data.error || "request failed"}`;
    return;
  }
  ceoResponse.textContent = JSON.stringify(data.response, null, 2);
}

sessionSelect.addEventListener("change", async () => {
  await loadReplay(sessionSelect.value);
});

reloadSessionsButton.addEventListener("click", async () => {
  await loadSessions();
});

saveProviderButton.addEventListener("click", async () => {
  await saveProviderSettings();
});

sendCeoButton.addEventListener("click", async () => {
  await sendCeoChat();
});

async function bootstrap() {
  await Promise.all([loadSessions(), loadProviderSettings()]);
}

bootstrap().catch((err) => {
  ceoResponse.textContent = String(err);
});
