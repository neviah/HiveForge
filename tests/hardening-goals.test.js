'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessApprovalRisk,
  ensureApprovalGovernanceState,
  evaluateApprovalGovernanceDecision,
  connectorRetryPlan,
  connectorExecutionKey,
  connectorMutationExecutionKey,
  isMutatingConnectorOperation,
  markConnectorExecutionRecord,
  appendApprovalDecisionAudit,
  readApprovalDecisionAudit,
  refreshWeeklyKpiPlan,
  makeAnalyticsSnapshot,
  ensureCredentialStorage,
} = require('../hiveforge_server');

function projectId(prefix) {
  return `test-${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
}

test('approval risk scores deploy + high cost as high risk', () => {
  const task = {
    id: 'RECUR-1',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      estimatedCost: 1200,
    },
  };

  const risk = assessApprovalRisk(task, {
    reason: 'Permission needed for netlify:trigger_deploy',
    checks: [
      { type: 'project_policy', ok: false },
    ],
  });

  assert.equal(risk.level, 'high');
  assert.equal(risk.requiresHuman, true);
  assert.ok(risk.score >= 70);
});

test('retry plan marks transient failures as retryable with backoff', () => {
  const first = connectorRetryPlan(1, 'HTTP 503 connector timeout');
  const third = connectorRetryPlan(3, 'HTTP 503 connector timeout');

  assert.equal(first.retryable, true);
  assert.equal(third.retryable, true);
  assert.ok(third.delayMs > first.delayMs);
});

test('analytics snapshot includes variance alerts when goals drift', () => {
  ensureCredentialStorage();
  const id = projectId('analytics-goals');
  const now = new Date().toISOString();

  const state = {
    id,
    name: 'Goal Drift Test',
    status: 'running',
    startedAt: now,
    tasks: [
      { id: 'D1', status: 'done', completedAt: now },
      { id: 'B1', status: 'backlog' },
      { id: 'B2', status: 'backlog' },
      { id: 'B3', status: 'backlog' },
      { id: 'B4', status: 'backlog' },
      { id: 'B5', status: 'backlog' },
    ],
    agents: [
      { id: 'coordinator', status: 'running', tokens: 0 },
      { id: 'worker', status: 'idle', tokens: 42 },
    ],
    kpiGoals: {
      weeklyTasksDoneTarget: 10,
      maxBacklog: 2,
      maxMonthlySpend: 0,
      weeklyPlan: {
        weekStart: now,
        lastPlannedAt: null,
        nextReviewAt: null,
        summary: null,
      },
    },
    deadLetters: [{ taskId: 'RECUR-failed', retryCount: 3, reason: 'timeout' }],
  };

  const snapshot = makeAnalyticsSnapshot(state);
  assert.ok(Array.isArray(snapshot.alerts));
  assert.ok(snapshot.alerts.length > 0);
  assert.equal(typeof snapshot.variance.weeklyTasksDone, 'number');
  assert.equal(Array.isArray(snapshot.deadLetters), true);
  assert.equal(snapshot.deadLetters.length, 1);
});

test('connector execution key is deterministic for equivalent input payloads', () => {
  const taskA = {
    id: 'RECUR-abc',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      input: { siteId: 'site-1', options: { force: true, region: 'us' } },
    },
  };
  const taskB = {
    id: 'RECUR-abc',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      input: { options: { region: 'us', force: true }, siteId: 'site-1' },
    },
  };

  const keyA = connectorExecutionKey(taskA);
  const keyB = connectorExecutionKey(taskB);
  assert.equal(keyA, keyB);
});

test('connector execution ledger upsert keeps latest status', () => {
  const state = { connectorExecutions: {} };
  const key = 'task-1::netlify::trigger_deploy::abcdef';

  markConnectorExecutionRecord(state, key, {
    status: 'running',
    startedAt: new Date().toISOString(),
    attempts: 1,
  });
  markConnectorExecutionRecord(state, key, {
    status: 'succeeded',
    completedAt: new Date().toISOString(),
    attempts: 1,
  });

  assert.equal(state.connectorExecutions[key].status, 'succeeded');
  assert.equal(state.connectorExecutions[key].attempts, 1);
});

test('manual connector mutation key is deterministic for equivalent payloads', () => {
  const keyA = connectorMutationExecutionKey('netlify', 'trigger_deploy', {
    siteId: 'site-123',
    opts: { branch: 'main', force: true },
  });
  const keyB = connectorMutationExecutionKey('netlify', 'trigger_deploy', {
    opts: { force: true, branch: 'main' },
    siteId: 'site-123',
  });
  assert.equal(keyA, keyB);
});

test('mutating operation guard identifies write actions', () => {
  assert.equal(isMutatingConnectorOperation('netlify', 'trigger_deploy'), true);
  assert.equal(isMutatingConnectorOperation('netlify', 'list_deploys'), false);
  assert.equal(isMutatingConnectorOperation('github', 'list_repos'), false);
});

test('approval governance policy packs auto-deny critical approval context', () => {
  const state = {
    id: projectId('approval-governance'),
    approvalGovernance: null,
  };
  ensureApprovalGovernanceState(state);

  const task = {
    id: 'RECUR-risk',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      estimatedCost: 3000,
      actorRole: 'Intern',
    },
  };

  const decision = evaluateApprovalGovernanceDecision(state, task, {
    riskScore: 95,
    estimatedCost: 3000,
    connector: 'netlify',
    operation: 'trigger_deploy',
    actorRole: 'Intern',
  });

  assert.equal(decision.decision, 'deny');
  assert.equal(typeof decision.matchedRuleId, 'string');
  assert.equal(Boolean(decision.matchedRuleId), true);
});

test('approval decision audit uses immutable hash chaining', () => {
  const id = projectId('approval-audit');
  const first = appendApprovalDecisionAudit(id, {
    taskId: 'T-1',
    decision: 'approve',
    actor: 'operator',
    reason: 'ok',
    riskScore: 25,
  });
  const second = appendApprovalDecisionAudit(id, {
    taskId: 'T-2',
    decision: 'deny',
    actor: 'operator',
    reason: 'risk',
    riskScore: 92,
  });
  const rows = readApprovalDecisionAudit(id, 5);

  assert.equal(Boolean(first.hash), true);
  assert.equal(Boolean(second.hash), true);
  assert.equal(second.prevHash, first.hash);
  assert.equal(rows.length >= 2, true);
});

test('weekly plan generation creates objectives with owner and SLA fields', () => {
  const now = new Date().toISOString();
  const state = {
    id: projectId('weekly-objectives'),
    template: 'business',
    tasks: [],
    deadLetters: [],
    kpiGoals: {
      weeklyTasksDoneTarget: 10,
      maxBacklog: 5,
      maxMonthlySpend: 1000,
      weeklyPlan: {
        weekStart: now,
        lastPlannedAt: null,
        nextReviewAt: null,
        summary: null,
        objectives: [],
      },
    },
    agents: [
      { id: 'coordinator', role: 'Coordinator Agent', isCoordinator: true },
      { id: 'sales_1', role: 'Sales Manager', isCoordinator: false },
      { id: 'support_1', role: 'Customer Support', isCoordinator: false },
      { id: 'finance_1', role: 'Financial Controller', isCoordinator: false },
      { id: 'analytics_1', role: 'Analytics Reporter', isCoordinator: false },
      { id: 'tracker_1', role: 'Finance Tracker', isCoordinator: false },
    ],
    logs: [],
  };

  refreshWeeklyKpiPlan(state, now);
  const objectives = state.kpiGoals.weeklyPlan.objectives;

  assert.equal(Array.isArray(objectives), true);
  assert.equal(objectives.length >= 3, true);
  assert.equal(objectives.every((item) => Number(item.slaHours) > 0), true);
  assert.equal(objectives.every((item) => typeof item.ownerRole === 'string' && item.ownerRole.length > 0), true);
  assert.equal(objectives.every((item) => typeof item.kpiOwnerRole === 'string' && item.kpiOwnerRole.length > 0), true);
});
