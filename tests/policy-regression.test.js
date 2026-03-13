'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  executeConnectorPolicy,
  upsertProjectCredentialPolicy,
  recordCredentialSpend,
  getCredentialBudgetSnapshot,
  ensureCredentialStorage,
} = require('../hiveforge_server');

function uniqueProjectId(name) {
  return `test-${name}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
}

test('deny-by-default: unknown connector is denied', async () => {
  const result = await executeConnectorPolicy('definitely_not_a_connector', {
    dryRun: true,
    projectId: uniqueProjectId('unknown'),
  });

  assert.equal(result.ok, false);
  assert.equal(result.decision, 'deny');
  assert.equal(result.errorCode, 'unknown_connector');
});

test('policy gate: disabled project service denies connector execution', async () => {
  ensureCredentialStorage();
  const projectId = uniqueProjectId('policy-disabled');

  upsertProjectCredentialPolicy(projectId, 'netlify', {
    enabled: false,
    monthlyCap: null,
  });

  const result = await executeConnectorPolicy('netlify', {
    dryRun: true,
    projectId,
    estimatedCost: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.decision, 'deny');
  const policyCheck = (result.checks || []).find((entry) => entry.type === 'project_policy');
  assert.ok(policyCheck, 'expected project_policy check to be present');
  assert.equal(policyCheck.ok, false);
});

test('overspend blocking: projected monthly cost over cap is denied', async () => {
  ensureCredentialStorage();
  const projectId = uniqueProjectId('overspend');

  upsertProjectCredentialPolicy(projectId, 'netlify', {
    enabled: true,
    monthlyCap: 5,
  });

  // Seed spend so projected monthly spend exceeds cap (4 + 2 > 5).
  recordCredentialSpend(projectId, 'netlify', 4, new Date().toISOString());

  const result = await executeConnectorPolicy('netlify', {
    dryRun: true,
    projectId,
    estimatedCost: 2,
  });

  assert.equal(result.ok, false);
  assert.equal(result.decision, 'deny');

  const capCheck = (result.checks || []).find((entry) => entry.type === 'budget_cap');
  assert.ok(capCheck, 'expected budget_cap check to be present');
  assert.equal(capCheck.ok, false);

  const snapshot = getCredentialBudgetSnapshot(projectId).netlify;
  assert.ok(snapshot, 'expected budget snapshot for netlify');
  assert.equal(typeof snapshot.monthlySpent, 'number');
  assert.equal(snapshot.monthlySpent >= 4, true);
});
