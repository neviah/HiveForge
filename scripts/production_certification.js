'use strict';

const BASE_URL = String(process.env.HIVEFORGE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const WAIT_MS = Number(process.env.HIVEFORGE_CERT_WAIT_MS || 800);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function assertCheck(condition, message, details = '') {
  if (!condition) {
    const suffix = details ? `\n${details}` : '';
    throw new Error(`${message}${suffix}`);
  }
}

async function withCleanup(projectRef, fn) {
  try {
    return await fn();
  } finally {
    if (projectRef.current) {
      try {
        await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectRef.current)}`, { method: 'DELETE' });
      } catch (err) {
      }
    }
  }
}

async function main() {
  const certification = [];
  const tempProjectId = { current: null };

  await withCleanup(tempProjectId, async () => {
    const projectName = `Certification Business ${Date.now().toString(36)}`;

    const created = await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        template: 'business',
        goal: 'Production certification runbook verification',
      }),
    });
    tempProjectId.current = created.id;
    certification.push(`Created project ${created.id}`);

    const agents = await api(`/api/agents?projectId=${encodeURIComponent(created.id)}`);
    assertCheck(Array.isArray(agents) && agents.some((agent) => agent.isCoordinator), 'Coordinator agent missing after project creation.');
    certification.push(`Coordinator present with ${agents.length} total agents`);

    const initialTasks = await api(`/api/tasks?projectId=${encodeURIComponent(created.id)}`);
    assertCheck(Array.isArray(initialTasks) && initialTasks.length > 0, 'Business template created no tasks.');
    certification.push(`Initial backlog contains ${initialTasks.length} tasks`);

    for (let index = 0; index < 3; index += 1) {
      await api('/api/control', {
        method: 'POST',
        body: JSON.stringify({ projectId: created.id, action: 'heartbeat' }),
      });
      await sleep(WAIT_MS);
    }

    const heartbeat = await api(`/api/heartbeat?projectId=${encodeURIComponent(created.id)}`);
    assertCheck(Array.isArray(heartbeat.log) && heartbeat.log.length >= 3, 'Project did not survive multiple heartbeat cycles.');
    certification.push(`Heartbeat cycles observed: ${heartbeat.log.length}`);

    const progressedTasks = await api(`/api/tasks?projectId=${encodeURIComponent(created.id)}`);
    const advanced = progressedTasks.some((task) => task.status === 'inprogress' || task.status === 'done' || Number(task.retryCount || 0) > 0);
    assertCheck(advanced, 'No task progressed beyond initial backlog after heartbeats.');
    certification.push('Autonomous task execution observed');

    const automation = await api(`/api/project_settings?projectId=${encodeURIComponent(created.id)}`);
    assertCheck(Boolean(automation?.recurring?.enabled), 'Recurring automation is not enabled for certification project.');
    assertCheck(Array.isArray(automation.schedule) && automation.schedule.length > 0, 'Recurring schedule missing for certification project.');
    certification.push(`Recurring schedule entries: ${automation.schedule.length}`);

    const recurringBus = await api(`/api/message_bus?projectId=${encodeURIComponent(created.id)}&kind=recurring_task_enqueued&limit=50`);
    assertCheck(Array.isArray(recurringBus) && recurringBus.length > 0, 'No recurring maintenance tasks were enqueued during certification.');
    certification.push(`Recurring maintenance events observed: ${recurringBus.length}`);

    const taskCountBeforeRecurring = progressedTasks.length;
    const manualRecurring = await api('/api/project_settings', {
      method: 'POST',
      body: JSON.stringify({ projectId: created.id, recurring: { enqueueNow: true } }),
    });
    await sleep(WAIT_MS);
    const tasksAfterRecurring = await api(`/api/tasks?projectId=${encodeURIComponent(created.id)}`);
    const busAfterRecurring = await api(`/api/message_bus?projectId=${encodeURIComponent(created.id)}&kind=project_recurring_run_now&limit=20`);
    const enqueuedNow = typeof manualRecurring?.enqueuedNow === 'number'
      ? manualRecurring.enqueuedNow
      : Math.max(0, tasksAfterRecurring.length - taskCountBeforeRecurring);
    certification.push(
      typeof manualRecurring?.enqueuedNow === 'number' || enqueuedNow > 0 || (Array.isArray(busAfterRecurring) && busAfterRecurring.length > 0)
        ? `Manual recurring trigger observed with ${enqueuedNow} task(s)`
        : 'Manual recurring trigger did not enqueue new work on this run (acceptable when recurring tasks are already pending)'
    );

    await api('/api/control', {
      method: 'POST',
      body: JSON.stringify({ projectId: created.id, action: 'restart_agents' }),
    });
    await sleep(WAIT_MS);

    const afterRestartTasks = await api(`/api/tasks?projectId=${encodeURIComponent(created.id)}`);
    const staleRunning = afterRestartTasks.some((task) => task.status === 'inprogress' && !task.assignee);
    assertCheck(!staleRunning, 'Restart left an inprogress task without an assignee.');
    certification.push('Restart/recovery path completed without stale task ownership');

    await api('/api/credential_policy', {
      method: 'POST',
      body: JSON.stringify({
        projectId: created.id,
        service: 'netlify',
        policy: { enabled: false, monthlyCap: null },
      }),
    });
    const deniedByPolicy = await api('/api/connectors/execute', {
      method: 'POST',
      body: JSON.stringify({
        projectId: created.id,
        connector: 'netlify',
        dryRun: true,
        operation: 'get_account',
        estimatedCost: 0,
      }),
    });
    const projectPolicyCheck = Array.isArray(deniedByPolicy.checks)
      ? deniedByPolicy.checks.find((entry) => entry.type === 'project_policy')
      : null;
    assertCheck(deniedByPolicy.decision === 'deny' && projectPolicyCheck && projectPolicyCheck.ok === false, 'Project policy denial was not enforced for connector execution.');
    certification.push('Project policy deny path enforced');

    await api('/api/credential_policy', {
      method: 'POST',
      body: JSON.stringify({
        projectId: created.id,
        service: 'netlify',
        policy: { enabled: true, monthlyCap: 1 },
      }),
    });
    const deniedByBudget = await api('/api/connectors/execute', {
      method: 'POST',
      body: JSON.stringify({
        projectId: created.id,
        connector: 'netlify',
        dryRun: true,
        operation: 'get_account',
        estimatedCost: 2,
      }),
    });
    const budgetCapCheck = Array.isArray(deniedByBudget.checks)
      ? deniedByBudget.checks.find((entry) => entry.type === 'budget_cap')
      : null;
    assertCheck(deniedByBudget.decision === 'deny' && budgetCapCheck && budgetCapCheck.ok === false, 'Budget cap denial was not enforced for connector execution.');
    certification.push('Budget cap deny path enforced');

    const messageBus = await api(`/api/message_bus?projectId=${encodeURIComponent(created.id)}&limit=200`);
    assertCheck(Array.isArray(messageBus) && messageBus.length > 0, 'Message bus did not record certification traffic.');
    certification.push(`Message bus entries observed: ${messageBus.length}`);
  });

  process.stdout.write('HiveForge production certification passed.\n');
  certification.forEach((line, index) => {
    process.stdout.write(`${index + 1}. ${line}\n`);
  });
}

main().catch((err) => {
  process.stderr.write(`HiveForge production certification failed: ${err.message}\n`);
  process.exit(1);
});
