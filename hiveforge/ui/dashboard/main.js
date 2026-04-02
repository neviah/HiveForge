const workspaceNav = document.getElementById("workspace-nav");
const viewTitle = document.getElementById("view-title");
const views = [...document.querySelectorAll("[data-view-panel]")];
const projectIcons = document.getElementById("project-icons");
const activeProjectName = document.getElementById("active-project-name");
const activeProjectStatus = document.getElementById("active-project-status");
const pauseProjectButton = document.getElementById("pause-project");
const resumeProjectButton = document.getElementById("resume-project");
const deleteProjectButton = document.getElementById("delete-project");

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

const PROJECT_STORAGE_KEY = "hiveforge.projects.v1";
const DEFAULT_PROJECTS = [
  { id: "agency", name: "Software Agency", status: "running" },
  { id: "publishing", name: "Publishing", status: "running" },
  { id: "research", name: "Research Lab", status: "paused" },
  { id: "game", name: "Game Studio", status: "running" },
];

let projects = [];
let activeProjectId = "agency";

function previewPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const text = JSON.stringify(payload);
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function normalizeProjectStatus(status) {
  if (status === "paused" || status === "deleted") {
    return status;
  }
  return "running";
}

function loadProjects() {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) {
      projects = [...DEFAULT_PROJECTS];
      return;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      projects = [...DEFAULT_PROJECTS];
      return;
    }

    projects = parsed
      .filter((project) => project && typeof project === "object" && project.id && project.name)
      .map((project) => ({
        id: String(project.id),
        name: String(project.name),
        status: normalizeProjectStatus(String(project.status || "running")),
      }));

    if (projects.length === 0) {
      projects = [...DEFAULT_PROJECTS];
    }
  } catch (_err) {
    projects = [...DEFAULT_PROJECTS];
  }
}

function saveProjects() {
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
}

function getActiveProject() {
  return projects.find((project) => project.id === activeProjectId) || projects[0] || null;
}

function renderProjectRail() {
  const icons = [...projectIcons.querySelectorAll(".project-icon[data-project-id]")];
  icons.forEach((button) => {
    const project = projects.find((item) => item.id === button.dataset.projectId);
    if (!project) {
      button.classList.add("is-hidden");
      return;
    }
    button.classList.remove("is-hidden");
    button.classList.toggle("active", project.id === activeProjectId);
    button.title = `${project.name} (${project.status})`;
    button.dataset.projectStatus = project.status;
  });
}

function syncProjectHeader() {
  const project = getActiveProject();
  if (!project) {
    activeProjectName.textContent = "None";
    activeProjectStatus.textContent = "deleted";
    pauseProjectButton.disabled = true;
    resumeProjectButton.disabled = true;
    deleteProjectButton.disabled = true;
    return;
  }

  activeProjectName.textContent = project.name;
  activeProjectStatus.textContent = project.status;
  activeProjectStatus.className = `status-tag ${project.status}`;

  pauseProjectButton.disabled = project.status !== "running";
  resumeProjectButton.disabled = project.status !== "paused";
  deleteProjectButton.disabled = project.status === "deleted";
}

function setProjectStatus(nextStatus) {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  project.status = normalizeProjectStatus(nextStatus);
  saveProjects();
  renderProjectRail();
  syncProjectHeader();
}

function handleDeleteProject() {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  const confirmed = window.confirm(`Delete ${project.name}? This will only remove it from this dashboard view.`);
  if (!confirmed) {
    return;
  }

  project.status = "deleted";
  saveProjects();

  const next = projects.find((item) => item.status !== "deleted");
  if (next) {
    activeProjectId = next.id;
  }

  renderProjectRail();
  syncProjectHeader();
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
    agentKanban.innerHTML = '<article class="kanban-lane"><header><h4>Queued</h4><span class="lane-count">0</span></header><div class="lane-body"><div class="kanban-card"><p>Run CEO chat to generate workflow activity.</p></div></div></article>';
    return;
  }

  const lanes = {
    queued: [],
    active: [],
    approvals: [],
    done: [],
  };

  const classifyLane = (eventType) => {
    if (!eventType) return "queued";
    if (eventType.includes("approval") || eventType.includes("human_input")) return "approvals";
    if (eventType.includes("complete") || eventType.includes("end") || eventType.includes("evaluate") || eventType.includes("memory")) return "done";
    if (eventType.includes("start") || eventType.includes("call") || eventType.includes("phase") || eventType.includes("dispatch")) return "active";
    return "queued";
  };

  agents.forEach((agentName) => {
    const agentEvents = events.filter((evt) => evt.agent_id === agentName);
    const latest = agentEvents[agentEvents.length - 1] || null;
    const lane = classifyLane(latest?.event_type || "");
    const confidence = Math.min(100, 20 + agentEvents.length * 10);

    lanes[lane].push({
      name: agentName,
      latestType: latest?.event_type || "none",
      source: latest?.source || "n/a",
      score: confidence,
      volume: agentEvents.length,
    });
  });

  const laneMeta = [
    { key: "queued", title: "Queued" },
    { key: "active", title: "In Progress" },
    { key: "approvals", title: "Needs Approval" },
    { key: "done", title: "Completed" },
  ];

  laneMeta.forEach((meta) => {
    const laneEl = document.createElement("article");
    laneEl.className = "kanban-lane";

    const cards = lanes[meta.key]
      .map(
        (item) => `
        <article class="kanban-card ${meta.key}">
          <header>
            <span class="agent-avatar">${item.name.slice(0, 2).toUpperCase()}</span>
            <div>
              <h5>${item.name}</h5>
              <p>${item.latestType}</p>
            </div>
          </header>
          <p class="meta">${item.source} • ${item.volume} events</p>
          <div class="progress-track"><div class="progress-fill" style="width:${item.score}%"></div></div>
        </article>
      `,
      )
      .join("");

    laneEl.innerHTML = `
      <header>
        <h4>${meta.title}</h4>
        <span class="lane-count">${lanes[meta.key].length}</span>
      </header>
      <div class="lane-body">${cards || '<p class="empty-lane">No items</p>'}</div>
    `;
    agentKanban.appendChild(laneEl);
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
  const activeProject = getActiveProject();
  if (activeProject && activeProject.status === "paused") {
    ceoResponse.textContent = "Project is paused. Resume the project to run CEO tasks.";
    return;
  }
  if (activeProject && activeProject.status === "deleted") {
    ceoResponse.textContent = "Project is deleted in this view. Pick another project.";
    return;
  }

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

projectIcons.addEventListener("click", (event) => {
  const target = event.target.closest(".project-icon[data-project-id]");
  if (!target) {
    return;
  }
  const project = projects.find((item) => item.id === target.dataset.projectId);
  if (!project || project.status === "deleted") {
    return;
  }
  activeProjectId = project.id;
  renderProjectRail();
  syncProjectHeader();
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

pauseProjectButton.addEventListener("click", () => {
  setProjectStatus("paused");
});

resumeProjectButton.addEventListener("click", () => {
  setProjectStatus("running");
});

deleteProjectButton.addEventListener("click", () => {
  handleDeleteProject();
});

async function bootstrap() {
  loadProjects();
  const active = getActiveProject();
  if (active) {
    activeProjectId = active.id;
  }
  renderProjectRail();
  syncProjectHeader();
  setActiveView("chat");
  await Promise.all([loadSessions(), loadProviderSettings()]);
}

bootstrap().catch((err) => {
  ceoResponse.textContent = String(err);
});
