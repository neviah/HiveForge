'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  connectorRetryPlan,
  recoverProjectStateAfterRestart,
  runProjectHeartbeat,
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
  assert.equal(rateLimit.retryable, true);
  assert.equal(delayedWebhook.retryable, true);
  assert.equal(hardFailure.retryable, false);
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
