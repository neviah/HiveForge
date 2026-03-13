'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const templatePath = path.join(__dirname, '..', 'templates', 'business.json');

function loadTemplate() {
  const raw = fs.readFileSync(templatePath, 'utf-8');
  return JSON.parse(raw);
}

test('business recurring loops include autonomous connector actions', () => {
  const tpl = loadTemplate();
  const loops = Array.isArray(tpl.recurring_loops) ? tpl.recurring_loops : [];

  const ads = loops.find((entry) => entry.key === 'business_ads_loop');
  const support = loops.find((entry) => entry.key === 'business_support_loop');
  const analytics = loops.find((entry) => entry.key === 'business_analytics_loop');

  assert.ok(ads);
  assert.ok(support);
  assert.ok(analytics);

  assert.equal(ads.action?.type, 'connector');
  assert.equal(ads.action?.connector, 'google_ads');
  assert.equal(ads.action?.operation, 'optimize_campaigns');

  assert.equal(support.action?.type, 'connector');
  assert.equal(support.action?.connector, 'email_provider');
  assert.equal(support.action?.operation, 'triage_inbox');

  assert.equal(analytics.action?.type, 'connector');
  assert.equal(analytics.action?.connector, 'stripe');
  assert.equal(analytics.action?.operation, 'get_balance');
});
