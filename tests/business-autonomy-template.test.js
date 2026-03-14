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
  const invoice = loops.find((entry) => entry.key === 'business_finance_invoice_loop');
  const collections = loops.find((entry) => entry.key === 'business_finance_collections_loop');
  const refunds = loops.find((entry) => entry.key === 'business_finance_refund_loop');

  assert.ok(ads);
  assert.ok(support);
  assert.ok(analytics);
  assert.ok(invoice);
  assert.ok(collections);
  assert.ok(refunds);

  assert.equal(ads.action?.type, 'connector');
  assert.equal(ads.action?.connector, 'google_ads');
  assert.equal(ads.action?.operation, 'optimize_campaigns');

  assert.equal(support.action?.type, 'connector');
  assert.equal(support.action?.connector, 'support_ticket');
  assert.equal(support.action?.operation, 'triage_tickets');

  assert.equal(analytics.action?.type, 'connector');
  assert.equal(analytics.action?.connector, 'stripe');
  assert.equal(analytics.action?.operation, 'get_balance');

  assert.equal(invoice.action?.connector, 'stripe');
  assert.equal(invoice.action?.operation, 'create_invoice');

  assert.equal(collections.action?.connector, 'stripe');
  assert.equal(collections.action?.operation, 'create_payment_intent');

  assert.equal(refunds.action?.connector, 'stripe');
  assert.equal(refunds.action?.operation, 'create_refund');
});
