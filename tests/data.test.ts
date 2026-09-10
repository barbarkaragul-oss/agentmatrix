import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellKey, loadAgents, loadCapabilities, loadMatrix } from '../src/types.js';

test('data files parse and are internally consistent', () => {
  const agents = loadAgents();
  const caps = loadCapabilities();
  assert.ok(agents.length >= 1);
  assert.ok(caps.capabilities.length >= 1);
  const groupIds = new Set(caps.groups.map((g) => g.id));
  for (const c of caps.capabilities) assert.ok(groupIds.has(c.group), `group ${c.group} for ${c.id}`);
  for (const a of agents) assert.ok(a.sources.length >= 1, `agent ${a.id} needs sources`);
});

test('matrix cells reference known agents and capabilities, no duplicates', () => {
  const agents = new Set(loadAgents().map((a) => a.id));
  const caps = new Set(loadCapabilities().capabilities.map((c) => c.id));
  const matrix = loadMatrix();
  const seen = new Set<string>();
  for (const cell of matrix.cells) {
    assert.ok(agents.has(cell.agent), `unknown agent ${cell.agent}`);
    assert.ok(caps.has(cell.capability), `unknown capability ${cell.capability}`);
    const key = cellKey(cell.agent, cell.capability);
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
    if (cell.value !== 'unknown') {
      assert.ok(cell.quote.trim().length > 0, `${key} needs a quote`);
      assert.ok(/^https?:\/\//.test(cell.evidence_url), `${key} needs an evidence_url`);
    }
  }
});
