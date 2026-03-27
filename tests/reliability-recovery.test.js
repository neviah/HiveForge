'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  connectorRetryPlan,
  recoverProjectStateAfterRestart,
  runProjectHeartbeat,
  acquireTaskLease,
  isTaskLeaseActive,
  requeueTaskToBacklog,
  ensureApprovalGovernanceState,
  activateBudgetHardStop,
  clearBudgetHardStop,
  recordApprovalGovernanceRevision,
  rollbackApprovalGovernanceRevision,
} = require('../hiveforge_server');

function projectId(prefix) {
  return `test-${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
}

function baseState(id) {
  return {
    id,
    name: 'Reliability Test Project',
    template: 'business',
    operatingMode: 'continuous_business',
    status: 'running',
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    recurring: { enabled: false, lastRunAt: {}, schedule: [], lastIdleNoticeAt: null },
    heartbeat: { status: 'alive', lastBeat: null, autoFixCount: 0, cycleCount: 0, log: [] },
    logs: [],
    agents: [
      { id: `coordinator_${id}`, isCoordinator: true, role: 'Coordinator Agent', status: 'running', currentTask: null, recentLog: [] },
    ],
    tasks: [],
  };
}

test('connector outage and delayed webhook reasons are treated as retryable transients', () => {
  const outage = connectorRetryPlan('netlify', 1, 'HTTP 503 service unavailable');
  const rateLimit = connectorRetryPlan('google_ads', 2, 'HTTP 429 rate limit');
  const delayedWebhook = connectorRetryPlan('email_provider', 1, 'delayed webhook delivery from provider');
  const hardFailure = connectorRetryPlan('netlify', 1, 'permission denied invalid scope');

  assert.equal(outage.retryable, true);
  assert.equal(outage.classification, 'transient');
  assert.equal(rateLimit.retryable, true);
  assert.equal(rateLimit.classification, 'transient');
  assert.equal(delayedWebhook.retryable, true);
  assert.equal(delayedWebhook.classification, 'transient');
  assert.equal(hardFailure.retryable, false);
  assert.equal(hardFailure.classification, 'deterministic');
});

test('recovery normalizes corrupted project state fields without crashing', () => {
  const id = projectId('config-corruption');
  const state = {
    id,
    status: 'running',
    template: 'business',
    operatingMode: 'unexpected_mode',
    startedAt: new Date().toISOString(),
    logs: 'broken',
    tasks: [
      {
        id: 'TASK-1',
        title: 'Broken entry',
        status: 'inprogress',
        assignee: 'worker_1',
        dependencies: 'bad-data',
      },
    ],
    agents: [
      { id: `coordinator_${id}`, isCoordinator: true, role: 'Coordinator Agent', status: 'running', currentTask: null },
      { id: 'worker_1', isCoordinator: false, role: 'Support Responder', status: 'running', currentTask: 'stale' },
    ],
    heartbeat: null,
    recurring: null,
    staffing: null,
    roleCapabilities: null,
    kpiGoals: null,
    deadLetters: null,
    connectorExecutions: null,
    kpiAlerting: null,
  };

  const result = recoverProjectStateAfterRestart(state);

  assert.equal(Array.isArray(state.logs), true);
  assert.equal(Array.isArray(state.tasks), true);
  assert.equal(Array.isArray(state.agents), true);
  assert.equal(typeof state.heartbeat, 'object');
  assert.equal(typeof state.recurring, 'object');
  assert.equal(typeof state.staffing, 'object');
  assert.equal(typeof state.kpiGoals, 'object');
  assert.equal(Array.isArray(state.deadLetters), true);
  assert.equal(typeof state.connectorExecutions, 'object');
  assert.equal(typeof state.kpiAlerting, 'object');
  assert.equal(state.operatingMode, 'finite_delivery');
  assert.deepEqual(result.requeuedTaskIds, ['TASK-1']);
  assert.equal(state.tasks[0].status, 'backlog');
  assert.equal(state.tasks[0].executionState, 'queued');
});

test('heartbeat soak simulation keeps runtime stable over many cycles', () => {
  const id = projectId('heartbeat-soak');
  const state = baseState(id);

  for (let i = 0; i < 120; i += 1) {
    runProjectHeartbeat(state, 'manual');
  }

  assert.equal(state.status, 'running');
  assert.equal(state.heartbeat.status, 'alive');
  assert.equal(state.heartbeat.cycleCount, 120);
  assert.equal(state.heartbeat.log.length <= 200, true);
  assert.equal(state.logs.length <= 1000, true);
});

test('task lease acquisition blocks duplicate execution ownership', () => {
  const now = new Date().toISOString();
  const task = {
    id: 'TASK-LEASE-1',
    status: 'inprogress',
    executionState: 'leased',
    assignee: 'worker_a',
    startedAt: now,
  };

  const firstLease = acquireTaskLease(task, 'worker_a', now, 60 * 1000);
  assert.ok(firstLease);
  assert.equal(task.leaseOwner, 'worker_a');
  assert.equal(isTaskLeaseActive(task, now), true);

  const duplicateLease = acquireTaskLease(task, 'worker_b', now, 60 * 1000);
  assert.equal(duplicateLease, null);
  assert.equal(task.leaseOwner, 'worker_a');
  assert.equal(task.leaseId, firstLease.leaseId);
});

test('stale lease writes are rejected before requeue mutation', () => {
  const now = new Date().toISOString();
  const task = {
    id: 'TASK-LEASE-2',
    status: 'inprogress',
    executionState: 'running',
    assignee: 'worker_a',
    startedAt: now,
    retryCount: 0,
    lastFailedAt: null,
    lastError: null,
  };
  const lease = acquireTaskLease(task, 'worker_a', now, 60 * 1000);
  assert.ok(lease);

  const staleWrite = requeueTaskToBacklog(task, 'stale_finalize', true, 'lease-from-old-run');
  assert.equal(staleWrite, false);
  assert.equal(task.status, 'inprogress');
  assert.equal(task.executionState, 'running');
  assert.equal(task.assignee, 'worker_a');
  assert.equal(task.retryCount, 0);

  const validWrite = requeueTaskToBacklog(task, 'current_finalize', true, lease.leaseId);
  assert.equal(validWrite, true);
  assert.equal(task.status, 'backlog');
  assert.equal(task.executionState, 'queued');
  assert.equal(task.assignee, null);
  assert.equal(task.retryCount, 1);
  assert.equal(task.lastError, 'current_finalize');
  assert.equal(task.leaseId, null);
  assert.equal(Array.isArray(task.retryLineage), true);
  assert.equal(task.retryLineage.length, 1);
  assert.equal(task.retryLineage[0].stage, 'task_execution_requeue');
  assert.equal(task.retryLineage[0].classification, 'deterministic');
  assert.equal(task.retryLineage[0].retryable, false);
});

test('budget hard-stop activates and requires explicit resume', () => {
  const id = projectId('budget-stop');
  const state = baseState(id);

  activateBudgetHardStop(state, 'budget_cap_exceeded', {
    connector: 'stripe',
    operation: 'create_refund',
  }, 'policy_engine');

  assert.equal(state.budgetHardStop.active, true);
  assert.equal(state.budgetHardStop.reason, 'budget_cap_exceeded');
  assert.equal(state.budgetHardStop.activatedBy, 'policy_engine');
  assert.ok(state.budgetHardStop.activatedAt);

  clearBudgetHardStop(state, 'operator', { reason: 'manual_resume' });
  assert.equal(state.budgetHardStop.active, false);
  assert.equal(state.budgetHardStop.resumedBy, 'operator');
  assert.ok(state.budgetHardStop.resumedAt);
});

test('approval governance rollback restores prior revision snapshot', () => {
  const id = projectId('governance-rollback');
  const state = baseState(id);
  state.approvalGovernance = null;
  ensureApprovalGovernanceState(state);

  state.approvalGovernance.enabled = true;
  const baseline = recordApprovalGovernanceRevision(state, 'operator', 'baseline');
  assert.ok(baseline && baseline.id);

  state.approvalGovernance.enabled = false;
  state.approvalGovernance.autoDenyRules.push({ id: 'deny-all-temporary' });
  const updated = recordApprovalGovernanceRevision(state, 'operator', 'tighten');
  assert.ok(updated && updated.id);
  assert.equal(state.approvalGovernance.enabled, false);

  const rollback = rollbackApprovalGovernanceRevision(state, baseline.id, 'operator', 'restore_baseline');
  assert.equal(rollback.ok, true);
  assert.equal(state.approvalGovernance.enabled, true);
  assert.equal(
    state.approvalGovernance.autoDenyRules.some((rule) => String(rule && rule.id || '') === 'deny-all-temporary'),
    false,
  );
});
