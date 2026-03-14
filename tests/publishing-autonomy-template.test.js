'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const templatePath = path.join(__dirname, '..', 'templates', 'publishing_house.json');

function loadTemplate() {
  const raw = fs.readFileSync(templatePath, 'utf-8');
  return JSON.parse(raw);
}

test('publishing template includes book autonomy contract and release pipeline action', () => {
  const tpl = loadTemplate();
  const contract = tpl.book_autonomy_contract || {};
  const loops = Array.isArray(tpl.recurring_loops) ? tpl.recurring_loops : [];
  const roleCaps = tpl.role_capabilities || {};
  const phases = Array.isArray(tpl.workflow_definition?.phases) ? tpl.workflow_definition.phases : [];
  const releaseLoop = loops.find((entry) => entry.key === 'publishing_release_loop');

  assert.equal(contract.enabled, true);
  assert.equal(contract.story_bible_required, true);
  assert.equal(contract.continuity_validator, true);
  assert.equal(contract.humanization_pass, true);
  assert.ok(Number(contract.chapter_count) >= 8);
  assert.ok(Array.isArray(contract.distribution_targets));
  assert.ok(contract.distribution_targets.includes('gumroad'));

  assert.ok(phases.includes('story_architecture'));
  assert.ok(phases.includes('chapter_planning'));
  assert.ok(phases.includes('chapter_drafting'));
  assert.ok(phases.includes('revision'));

  assert.ok(releaseLoop);
  assert.equal(releaseLoop.action?.type, 'connector');
  assert.equal(releaseLoop.action?.connector, 'custom_cms');
  assert.equal(releaseLoop.action?.operation, 'publish_book');

  const growthAllowed = Array.isArray(roleCaps['Growth Hacker']?.allowed_connectors)
    ? roleCaps['Growth Hacker'].allowed_connectors
    : [];
  assert.ok(growthAllowed.includes('kdp'));
  assert.ok(growthAllowed.includes('gumroad'));
  assert.ok(growthAllowed.includes('substack'));
  assert.ok(growthAllowed.includes('custom_cms'));
});
