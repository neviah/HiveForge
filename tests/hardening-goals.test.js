'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessApprovalRisk,
  connectorRetryPlan,
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
