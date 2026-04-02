const workspaceNav = document.getElementById("workspace-nav");
const viewTitle = document.getElementById("view-title");
const views = [...document.querySelectorAll("[data-view-panel]")];

const sessionSelect = document.getElementById("session-select");
const reloadSessionsButton = document.getElementById("reload-sessions");
const timelineBody = document.getElementById("timeline-body");
const agentKanban = document.getElementById("agent-kanban");
const inboxList = document.getElementById("inbox-list");
const approvalsList = document.getElementById("approvals-list");

const metricSessions = document.getElementById("metric-sessions");
const metricEvents = document.getElementById("metric-events");
const metricAgents = document.getElementById("metric-agents");
const financeBudgetUsed = document.getElementById("finance-budget-used");
const financeBurn = document.getElementById("finance-burn");
const financeApprovals = document.getElementById("finance-approvals");

const providerSelect = document.getElementById("provider-select");
const providerBaseUrl = document.getElementById("provider-base-url");
const providerModel = document.getElementById("provider-model");
const providerTemperature = document.getElementById("provider-temperature");
const providerMaxTokens = document.getElementById("provider-max-tokens");
const providerApiKeyEnv = document.getElementById("provider-api-key-env");
const providerApiKey = document.getElementById("provider-api-key");
const saveProviderButton = document.getElementById("save-provider");
const settingsStatus = document.getElementById("settings-status");

const ceoObjective = document.getElementById("ceo-objective");
const ceoBudget = document.getElementById("ceo-budget");
const sendCeoButton = document.getElementById("send-ceo");
const ceoResponse = document.getElementById("ceo-response");

let currentReplay = { event_count: 0, agents: [], events: [] };
let providerSettings = { active_provider: "openrouter", providers: [], configs: {} };

function previewPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const text = JSON.stringify(payload);
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function setActiveView(viewName) {
  const menuItems = [...workspaceNav.querySelectorAll(".menu-item")];
  menuItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  views.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === viewName);
  });

  const label = viewName.charAt(0).toUpperCase() + viewName.slice(1);
  viewTitle.textContent = label === "Chat" ? "CEO Chat" : label;
}

function renderTimeline(events) {
  timelineBody.innerHTML = "";
  events.forEach((event) => {
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

function renderKanban(replay) {
  const agents = replay.agents || [];
  const events = replay.events || [];
  agentKanban.innerHTML = "";

  if (agents.length === 0) {
    agentKanban.innerHTML = '<div class="kanban-card"><h4>No active agents</h4><p>Run CEO chat to generate workflow activity.</p></div>';
    return;
  }

  agents.forEach((agentName) => {
    const latest = [...events].reverse().find((evt) => evt.agent_id === agentName);
    const card = document.createElement("article");
    card.className = "kanban-card";
    card.innerHTML = `
      <h4>${agentName}</h4>
      <p>Last event: ${latest ? latest.event_type : "none"}</p>
      <p>Source: ${latest ? latest.source : "n/a"}</p>
    `;
    agentKanban.appendChild(card);
  });
}

function renderOperationalLists(replay) {
  const events = replay.events || [];
  const warnings = events.filter((e) => {
    const payload = e.payload || {};
    return typeof payload === "object" && (payload.error || payload.warning || payload.blocked);
  });

  inboxList.innerHTML = "";
  if (warnings.length === 0) {
    inboxList.innerHTML = "<li><strong>All clear</strong><span>No warnings detected in this session.</span></li>";
  } else {
    warnings.slice(0, 8).forEach((event) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${event.event_type}</strong><span>${event.agent_id || "system"} reported an issue.</span>`;
      inboxList.appendChild(li);
    });
  }

  const pendingApprovals = events.filter((e) => e.event_type === "approval_needed" || e.event_type === "human_input_required");
  approvalsList.innerHTML = "";
  if (pendingApprovals.length === 0) {
    approvalsList.innerHTML = "<li><strong>No pending approvals</strong><span>Autonomy loop can continue.</span></li>";
  } else {
    pendingApprovals.forEach((event) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${event.agent_id || "Unknown Agent"}</strong><span>${event.event_type} at ${event.ts || "unknown time"}</span>`;
      approvalsList.appendChild(li);
    });
  }

  financeApprovals.textContent = String(pendingApprovals.length);
}

function renderFinance(replay) {
  const events = replay.events || [];
  const budgetSignals = events.filter((e) => e.payload && typeof e.payload === "object" && "budget" in e.payload);
  const latestBudget = budgetSignals.length ? Number(budgetSignals[budgetSignals.length - 1].payload.budget || 0) : 0;
  const estimate = Number((latestBudget * 0.2 + replay.event_count * 0.5).toFixed(2));

  financeBudgetUsed.textContent = String(latestBudget);
  financeBurn.textContent = String(estimate);
}

function renderReplay(replay) {
  currentReplay = replay;
  metricEvents.textContent = String(replay.event_count || 0);
  metricAgents.textContent = String((replay.agents || []).length);

  renderTimeline(replay.events || []);
  renderKanban(replay);
  renderOperationalLists(replay);
  renderFinance(replay);
}

function fillProviderForm(providerName) {
  const config = providerSettings.configs?.[providerName] || {};
  providerBaseUrl.value = config.base_url || "";
  providerModel.value = config.model || "";
  providerTemperature.value = String(config.temperature ?? 0.2);
  providerMaxTokens.value = String(config.max_tokens ?? 4000);
  providerApiKeyEnv.value = config.api_key_env || "";
  providerApiKey.value = config.api_key || "";
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
    const latest = sessions[sessions.length - 1];
    await loadReplay(latest);
    sessionSelect.value = latest;
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

  providerSettings = {
    active_provider: data.active_provider || "openrouter",
    providers: data.providers || [],
    configs: data.configs || {},
  };

  providerSelect.innerHTML = "";
  providerSettings.providers.forEach((providerName) => {
    const option = document.createElement("option");
    option.value = providerName;
    option.textContent = providerName;
    providerSelect.appendChild(option);
  });

  providerSelect.value = providerSettings.active_provider;
  fillProviderForm(providerSelect.value);
}

async function saveProviderSettings() {
  settingsStatus.textContent = "Saving provider config...";
  const activeProvider = providerSelect.value;
  const providerConfig = {
    base_url: providerBaseUrl.value.trim(),
    model: providerModel.value.trim(),
    temperature: Number(providerTemperature.value || 0.2),
    max_tokens: Number(providerMaxTokens.value || 4000),
    api_key_env: providerApiKeyEnv.value.trim(),
    api_key: providerApiKey.value.trim(),
  };

  const response = await fetch("/api/settings/provider", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      active_provider: activeProvider,
      provider_config: providerConfig,
    }),
  });
  const data = await response.json();

  if (!data.ok) {
    settingsStatus.textContent = `Error: ${data.error || "save failed"}`;
    return;
  }

  settingsStatus.textContent = `Saved ${data.active_provider} provider configuration.`;
  await loadProviderSettings();
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
  await loadSessions();
}

workspaceNav.addEventListener("click", (event) => {
  const target = event.target.closest(".menu-item");
  if (!target) {
    return;
  }
  setActiveView(target.dataset.view || "chat");
});

providerSelect.addEventListener("change", () => {
  fillProviderForm(providerSelect.value);
});

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
  setActiveView("chat");
  await Promise.all([loadSessions(), loadProviderSettings()]);
}

bootstrap().catch((err) => {
  ceoResponse.textContent = String(err);
});
