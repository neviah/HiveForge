'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureCredentialStorage,
  upsertProjectCredentialPolicy,
  recordCredentialSpend,
  evaluateProductionPreflight,
} = require('../hiveforge_server');

function projectId(prefix) {
  return `test-${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000000000)}`;
}

function baseState(id) {
  return {
    id,
    connectorExecutions: {},
  };
}

test('production preflight passes for non-connector action with healthy notifications', () => {
  const id = projectId('preflight-pass');
  const state = baseState(id);

  const result = evaluateProductionPreflight(state, {
    connector: '',
    operation: '',
    notifications: {
      whatsapp: { enabled: true },
      telegram: { enabled: false },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.checks.every((entry) => entry.ok), true);
});

test('production preflight fails when operator notification routes are not configured', () => {
  const id = projectId('preflight-notify-fail');
  const state = baseState(id);

  const result = evaluateProductionPreflight(state, {
    connector: '',
    operation: '',
    notifications: {
      whatsapp: { enabled: false },
      telegram: { enabled: false },
    },
  });

  const notify = result.checks.find((entry) => entry.id === 'notification_route_health');
  assert.equal(result.ok, false);
  assert.ok(notify);
  assert.equal(notify.ok, false);
});

test('production preflight fails rollback readiness for netlify deploy without rollback plan or history', () => {
  const id = projectId('preflight-rollback-fail');
  const state = baseState(id);

  const result = evaluateProductionPreflight(state, {
    connector: 'netlify',
    operation: 'trigger_deploy',
    input: {
      siteId: 'site-123',
    },
    notifications: {
      whatsapp: { enabled: true },
      telegram: { enabled: false },
    },
  });

  const rollback = result.checks.find((entry) => entry.id === 'rollback_readiness');
  assert.equal(result.ok, false);
  assert.ok(rollback);
  assert.equal(rollback.ok, false);
});

test('production preflight fails budget sanity when projected spend exceeds cap', () => {
  ensureCredentialStorage();
  const id = projectId('preflight-budget-fail');
  const state = baseState(id);

  upsertProjectCredentialPolicy(id, 'netlify', {
    enabled: true,
    monthlyCap: 10,
  });
  recordCredentialSpend(id, 'netlify', 9, new Date().toISOString());

  const result = evaluateProductionPreflight(state, {
    connector: 'netlify',
    operation: 'trigger_deploy',
    estimatedCost: 5,
    input: {
      siteId: 'site-123',
      rollbackDeployId: 'dep-1',
    },
    notifications: {
      whatsapp: { enabled: true },
      telegram: { enabled: false },
    },
  });

  const budget = result.checks.find((entry) => entry.id === 'budget_sanity');
  assert.equal(result.ok, false);
  assert.ok(budget);
  assert.equal(budget.ok, false);
});
