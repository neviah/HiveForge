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

  const result = await executeConnectorPolicy('netlify', {
    dryRun: true,
    projectId,
    estimatedCost: 6,
  });

  assert.equal(result.ok, false);
  assert.equal(result.decision, 'deny');

  const capCheck = (result.checks || []).find((entry) => entry.type === 'budget_cap');
  assert.ok(capCheck, 'expected budget_cap check to be present');
  assert.equal(capCheck.ok, false);

  const snapshot = getCredentialBudgetSnapshot(projectId).netlify;
  assert.ok(snapshot, 'expected budget snapshot for netlify');
  assert.equal(typeof snapshot.monthlySpent, 'number');
  assert.equal(snapshot.monthlySpent >= 0, true);
});

test('role capability gate: non-deploy role cannot trigger netlify deploy', async () => {
  const projectId = uniqueProjectId('role-deny-deploy');
  const result = await executeConnectorPolicy('netlify', {
    dryRun: true,
    projectId,
    actorRole: 'Reality Checker',
    operation: 'trigger_deploy',
    roleCapabilities: {
      'Reality Checker': {
        canDeploy: false,
        canSpend: false,
        allowedConnectors: ['analytics'],
      },
    },
  });

  assert.equal(result.ok, false);
  const roleDeploy = (result.checks || []).find((entry) => entry.type === 'role_deploy');
  assert.ok(roleDeploy, 'expected role_deploy check to be present');
  assert.equal(roleDeploy.ok, false);
});

test('role capability gate: deploy role can run netlify connector', async () => {
  const projectId = uniqueProjectId('role-allow-deploy');
  const result = await executeConnectorPolicy('netlify', {
    dryRun: true,
    projectId,
    actorRole: 'DevOps Automator',
    operation: 'list_sites',
    roleCapabilities: {
      'DevOps Automator': {
        canDeploy: true,
        canSpend: true,
        allowedConnectors: ['netlify', 'github'],
      },
    },
  });

  const roleCapability = (result.checks || []).find((entry) => entry.type === 'role_capability');
  assert.ok(roleCapability, 'expected role_capability check to be present');
  assert.equal(roleCapability.ok, true);
});
