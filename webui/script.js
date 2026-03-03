const liveChatEl = document.getElementById('liveChat');
const historyChatEl = document.getElementById('historyChat');
const historyTimelineEl = document.getElementById('historyTimeline');
const historyListEl = document.getElementById('historyList');
const historySearchEl = document.getElementById('historySearch');
const historyStatusEl = document.getElementById('historyStatus');
const historyRangeEl = document.getElementById('historyRange');
const historyTagEl = document.getElementById('historyTag');
const rerunTaskBtn = document.getElementById('rerunTask');
const exportTaskBtn = document.getElementById('exportTask');
const historyActionStatusEl = document.getElementById('historyActionStatus');
const taskEl = document.getElementById('task');
const runBtn = document.getElementById('run');
const runSmokeBtn = document.getElementById('runSmoke');
const stopBtn = document.getElementById('stop');
const taskStatusEl = document.getElementById('taskStatus');
const keyBtn = document.getElementById('showKey');
const publicKeyEl = document.getElementById('publicKey');
const workspaceLink = document.getElementById('workspaceLink');
const llmEndpointEl = document.getElementById('llmEndpoint');
const llmStatusEl = document.getElementById('llmStatus');
const llmCheckedEl = document.getElementById('llmChecked');
const refreshLlmBtn = document.getElementById('refreshLlm');
const llmPillEl = document.getElementById('llmPill');
const llmPillTextEl = document.getElementById('llmPillText');
const kpiEl = document.getElementById('kpi');
const githubIntegrationEl = document.getElementById('githubIntegrationStatus');
const telegramIntegrationEl = document.getElementById('telegramIntegrationStatus');
const whatsappIntegrationEl = document.getElementById('whatsappIntegrationStatus');
const testGithubBtn = document.getElementById('testGithub');
const testTelegramBtn = document.getElementById('testTelegram');
const testWhatsappBtn = document.getElementById('testWhatsapp');
const githubTestResultEl = document.getElementById('githubTestResult');
const telegramTestResultEl = document.getElementById('telegramTestResult');
const whatsappTestResultEl = document.getElementById('whatsappTestResult');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabs = document.querySelectorAll('.tab');
const themeButtons = document.querySelectorAll('.theme-btn');

let appState = {
  history: []
};
let selectedTaskId = null;
let selectedTask = null;
let currentRunningTaskId = null;
const tokenBuffers = new WeakMap();

workspaceLink.href = '/workspace';

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatTs(ts) {
  return new Date(ts).toLocaleTimeString();
}

function addChatLine(container, entry) {
  const message = entry.message || '';
  if (message.trim() === '<think>' || message.trim() === '</think>') {
    return;
  }

  const buffer = tokenBuffers.get(container) || new Map();
  tokenBuffers.set(container, buffer);
  const key = `${entry.taskId || 'global'}:${entry.type || 'event'}`;
  const canCoalesce = (entry.type === 'stdout' || entry.type === 'stream') && !message.includes('\n');

  if (canCoalesce) {
    let line = buffer.get(key);
    if (!line || !line.isConnected) {
      line = document.createElement('div');
      line.className = 'chat-line';
      line.dataset.taskId = String(entry.taskId || '');
      line.dataset.type = entry.type || 'stream';

      const ts = document.createElement('small');
      ts.textContent = formatTs(entry.ts);
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `[${entry.type}]`;
      const text = document.createElement('span');
      text.className = 'msg';
      text.textContent = message;

      line.appendChild(ts);
      line.appendChild(tag);
      line.appendChild(text);
      container.appendChild(line);
      buffer.set(key, line);
    } else {
      const textNode = line.querySelector('.msg');
      if (textNode) {
        textNode.textContent += message;
      }
    }

    container.scrollTop = container.scrollHeight;
    return;
  }

  buffer.delete(key);
  const line = document.createElement('div');
  line.className = 'chat-line';
  const taskLabel = (entry.taskId && (entry.type === 'system' || entry.type === 'stderr')) ? ` [T${entry.taskId}]` : '';
  line.innerHTML = `<small>${formatTs(entry.ts)}</small><span class="tag">[${entry.type}${taskLabel}]</span>${escapeHtml(message)}`;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
  const buffer = tokenBuffers.get(el);
  if (buffer) {
    buffer.clear();
  }
}

function getRangeStart(rangeValue) {
  const now = Date.now();
  if (rangeValue === '24h') return now - (24 * 60 * 60 * 1000);
  if (rangeValue === '7d') return now - (7 * 24 * 60 * 60 * 1000);
  if (rangeValue === '30d') return now - (30 * 24 * 60 * 60 * 1000);
  return null;
}

function taskMatchesFilters(task) {
  const search = historySearchEl.value.trim().toLowerCase();
  const status = historyStatusEl.value;
  const range = historyRangeEl.value;
  const tag = historyTagEl.value;

  if (status !== 'all' && task.status !== status) {
    return false;
  }

  const rangeStart = getRangeStart(range);
  if (rangeStart) {
    const startedAt = new Date(task.startedAt).getTime();
    if (startedAt < rangeStart) {
      return false;
    }
  }

  if (tag !== 'all' && !(task.tags || []).includes(tag)) {
    return false;
  }

  if (search) {
    const haystack = `${task.task}\n${task.preview || ''}\n${(task.tags || []).join(' ')}`.toLowerCase();
    if (!haystack.includes(search)) {
      return false;
    }
  }

  return true;
}

function populateTagFilter() {
  const existing = new Set(['all']);
  const current = historyTagEl.value;
  appState.history.forEach((task) => {
    (task.tags || []).forEach((tag) => existing.add(tag));
  });
  historyTagEl.innerHTML = '';
  [...existing].forEach((tag) => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag === 'all' ? 'All tools/integrations' : tag;
    historyTagEl.appendChild(option);
  });
  if ([...existing].includes(current)) {
    historyTagEl.value = current;
  }
}

function renderHistoryList() {
  clearElement(historyListEl);
  const filtered = appState.history.filter(taskMatchesFilters);
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'list-item';
    empty.textContent = 'No tasks match current filters.';
    historyListEl.appendChild(empty);
    return;
  }

  filtered.forEach((item) => {
    const row = document.createElement('div');
    row.className = `list-item${item.id === selectedTaskId ? ' active' : ''}`;
    const status = item.status || 'unknown';
    const tags = (item.tags || []).length ? ` • tags: ${(item.tags || []).join(', ')}` : '';
    row.innerHTML = `<strong>#${item.id}</strong> ${escapeHtml(item.task)}<br><small>${item.source || 'task'} • ${status} • ${item.durationMs || 0}ms • ${item.eventCount} events${escapeHtml(tags)}</small>`;
    row.addEventListener('click', () => {
      selectedTaskId = item.id;
      selectedTask = item;
      renderHistoryList();
      loadHistoryTask(item.id);
    });
    historyListEl.appendChild(row);
  });
}

async function loadHistoryTask(taskId) {
  const res = await fetch(`/api/history/${taskId}`);
  if (!res.ok) return;
  const task = await res.json();
  selectedTask = task;
  clearElement(historyChatEl);
  clearElement(historyTimelineEl);
  task.events.forEach((event) => addChatLine(historyChatEl, event));
  renderTimeline(task.events);
}

function renderTimeline(events) {
  const phaseOrder = ['planning', 'action', 'file', 'execution', 'error', 'finish'];
  const grouped = {
    planning: [],
    action: [],
    file: [],
    execution: [],
    error: [],
    finish: []
  };

  events.forEach((event) => {
    const phase = grouped[event.phase] ? event.phase : 'execution';
    grouped[phase].push(event);
  });

  let totalGroups = 0;
  phaseOrder.forEach((phase) => {
    if (!grouped[phase].length) return;
    totalGroups += 1;
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-phase';
    const title = phase.charAt(0).toUpperCase() + phase.slice(1);
    wrapper.innerHTML = `<h4>${title} (${grouped[phase].length})</h4>`;
    grouped[phase].slice(-8).forEach((event) => {
      const line = document.createElement('div');
      line.className = 'chat-line';
      line.innerHTML = `<small>${formatTs(event.ts)}</small>${escapeHtml(event.message)}`;
      wrapper.appendChild(line);
    });
    historyTimelineEl.appendChild(wrapper);
  });

  if (totalGroups === 0) {
    historyTimelineEl.textContent = 'No timeline events yet.';
  }
}

function renderLlm(llm) {
  llmEndpointEl.textContent = llm.endpoint || '-';
  llmStatusEl.textContent = llm.reachable ? 'Reachable' : 'Unreachable';
  llmCheckedEl.textContent = llm.lastCheckedAt ? `Last check: ${new Date(llm.lastCheckedAt).toLocaleString()}` : 'Last check: -';

  llmPillEl.classList.remove('ok', 'warn');
  if (llm.reachable) {
    llmPillEl.classList.add('ok');
    llmPillTextEl.textContent = 'LLM Connected';
  } else {
    llmPillEl.classList.add('warn');
    llmPillTextEl.textContent = 'LLM Disconnected';
  }
}

function renderMetrics(metrics) {
  const cards = [
    { label: 'Total Tasks', value: metrics.totalTasks },
    { label: 'Running', value: metrics.runningTasks },
    { label: 'Succeeded', value: metrics.succeededTasks },
    { label: 'Failed', value: metrics.failedTasks },
    { label: 'Avg Duration (ms)', value: metrics.averageDurationMs }
  ];
  kpiEl.innerHTML = cards.map((card) => `<div class="card">${card.label}<strong>${card.value}</strong></div>`).join('');
}

function renderIntegrationCard(el, name, status) {
  el.innerHTML = `
    <strong>${name}</strong>
    <div style="margin-top:0.5rem;">Configured: <b>${status.configured ? 'Yes' : 'No'}</b></div>
    ${status.publicKeyPresent !== undefined ? `<div>Public Key Present: <b>${status.publicKeyPresent ? 'Yes' : 'No'}</b></div>` : ''}
    <div class="muted" style="margin-top:0.5rem;">${escapeHtml(status.notes || '')}</div>
  `;
}

async function refreshState() {
  const res = await fetch('/api/state');
  const state = await res.json();
  appState = state;
  renderLlm(state.llm);
  renderMetrics(state.metrics);
  populateTagFilter();
  renderHistoryList();
  renderIntegrationCard(githubIntegrationEl, 'GitHub', state.integrations.github);
  renderIntegrationCard(telegramIntegrationEl, 'Telegram', state.integrations.telegram);
  renderIntegrationCard(whatsappIntegrationEl, 'WhatsApp', state.integrations.whatsapp);

  if (!selectedTaskId && state.history.length) {
    selectedTaskId = state.history[0].id;
    selectedTask = state.history[0];
    renderHistoryList();
    loadHistoryTask(selectedTaskId);
  }
}

async function rerunSelectedTask() {
  if (!selectedTaskId) {
    historyActionStatusEl.textContent = 'Select a task first.';
    return;
  }
  rerunTaskBtn.disabled = true;
  historyActionStatusEl.textContent = 'Rerunning...';
  try {
    const res = await fetch('/api/task/rerun', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: selectedTaskId })
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      historyActionStatusEl.textContent = `Rerun failed: ${payload.error || 'unknown error'}`;
    } else {
      historyActionStatusEl.textContent = payload.rerunType === 'integration-test'
        ? 'Integration test rerun completed.'
        : 'Task rerun queued.';
      await refreshState();
    }
  } catch (err) {
    historyActionStatusEl.textContent = `Rerun failed: ${err.message}`;
  } finally {
    rerunTaskBtn.disabled = false;
  }
}

async function exportSelectedTask() {
  if (!selectedTaskId) {
    historyActionStatusEl.textContent = 'Select a task first.';
    return;
  }
  exportTaskBtn.disabled = true;
  historyActionStatusEl.textContent = 'Exporting transcript...';
  try {
    const res = await fetch(`/api/history/${selectedTaskId}/export`);
    if (!res.ok) {
      historyActionStatusEl.textContent = 'Export failed.';
      return;
    }
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ramclaw-task-${selectedTaskId}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    historyActionStatusEl.textContent = 'Transcript exported.';
  } catch (err) {
    historyActionStatusEl.textContent = `Export failed: ${err.message}`;
  } finally {
    exportTaskBtn.disabled = false;
  }
}

async function runTask() {
  const task = taskEl.value.trim();
  if (!task) return;
  await runTaskRequest('/api/task', { task });
}

async function runSmokeTask() {
  await runTaskRequest('/api/task/smoke', {});
}

async function runTaskRequest(endpoint, payload) {
  runBtn.disabled = true;
  runSmokeBtn.disabled = true;
  stopBtn.disabled = false;
  taskStatusEl.textContent = 'Running...';
  currentRunningTaskId = null;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    decoder.decode(value);
  }
  runBtn.disabled = false;
  runSmokeBtn.disabled = false;
  stopBtn.disabled = true;
  taskStatusEl.textContent = 'Idle';
  currentRunningTaskId = null;
  await refreshState();
}

async function stopRunningTask() {
  stopBtn.disabled = true;
  taskStatusEl.textContent = 'Stopping...';
  try {
    const payload = currentRunningTaskId ? { taskId: currentRunningTaskId } : {};
    const res = await fetch('/api/task/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      taskStatusEl.textContent = 'Stopped';
      currentRunningTaskId = null;
    } else {
      taskStatusEl.textContent = data.message || 'No running task';
    }
  } catch (err) {
    taskStatusEl.textContent = `Stop failed: ${err.message}`;
  } finally {
    await refreshState();
  }
}

async function refreshPublicKey() {
  const res = await fetch('/api/public-key');
  const text = await res.text();
  publicKeyEl.textContent = text;
}

async function testIntegration(provider, resultEl, buttonEl) {
  buttonEl.disabled = true;
  resultEl.textContent = 'Testing...';
  try {
    const res = await fetch('/api/integrations/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider })
    });
    const payload = await res.json();
    const status = payload.ok ? 'PASS' : 'FAIL';
    resultEl.textContent = `[${status}] ${payload.message} (${new Date(payload.testedAt).toLocaleTimeString()})`;
  } catch (err) {
    resultEl.textContent = `[FAIL] ${err.message}`;
  } finally {
    buttonEl.disabled = false;
  }
}

function initTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabButtons.forEach((item) => item.classList.remove('active'));
      tabs.forEach((tab) => tab.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });
}

function applyTheme(themeName) {
  const valid = ['light', 'dark', 'ambient'];
  const theme = valid.includes(themeName) ? themeName : 'light';
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('ramclaw-theme', theme);
  themeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function initTheme() {
  const saved = localStorage.getItem('ramclaw-theme') || 'light';
  applyTheme(saved);
  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme || 'light');
    });
  });
}

function initEventStream() {
  const es = new EventSource('/api/events');
  es.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      addChatLine(liveChatEl, {
        ts: data.ts,
        taskId: data.taskId,
        type: data.type || 'event',
        message: data.message || ''
      });

      if (data.status === 'running' && data.taskId) {
        currentRunningTaskId = data.taskId;
        stopBtn.disabled = false;
        taskStatusEl.textContent = `Running (Task #${data.taskId})`;
      }

      if ((data.status === 'failed' || data.status === 'succeeded') && data.taskId === currentRunningTaskId) {
        currentRunningTaskId = null;
        stopBtn.disabled = true;
        taskStatusEl.textContent = 'Idle';
      }

      if (selectedTaskId && data.taskId === selectedTaskId) {
        addChatLine(historyChatEl, {
          ts: data.ts,
          taskId: data.taskId,
          type: data.type || 'event',
          message: data.message || ''
        });
      }

      refreshState();
    } catch (err) {
    }
  };
}

runBtn.addEventListener('click', runTask);
runSmokeBtn.addEventListener('click', runSmokeTask);
stopBtn.addEventListener('click', stopRunningTask);

[historySearchEl, historyStatusEl, historyRangeEl, historyTagEl].forEach((el) => {
  el.addEventListener('input', () => {
    renderHistoryList();
  });
  el.addEventListener('change', () => {
    renderHistoryList();
  });
});

keyBtn.addEventListener('click', async () => {
  await refreshPublicKey();
});

refreshLlmBtn.addEventListener('click', async () => {
  await fetch('/api/llm/check');
  await refreshState();
});

testGithubBtn.addEventListener('click', () => testIntegration('github', githubTestResultEl, testGithubBtn));
testTelegramBtn.addEventListener('click', () => testIntegration('telegram', telegramTestResultEl, testTelegramBtn));
testWhatsappBtn.addEventListener('click', () => testIntegration('whatsapp', whatsappTestResultEl, testWhatsappBtn));
rerunTaskBtn.addEventListener('click', rerunSelectedTask);
exportTaskBtn.addEventListener('click', exportSelectedTask);

initTabs();
initTheme();
stopBtn.disabled = true;
runSmokeBtn.disabled = false;
initEventStream();
refreshState();
refreshPublicKey();
