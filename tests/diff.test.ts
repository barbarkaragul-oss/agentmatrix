import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffMatrices, renderChangesMarkdown } from '../src/diff.js';
import type { Cell } from '../src/types.js';

function cell(agent: string, capability: string, value: Cell['value'], extra: Partial<Cell> = {}): Cell {
  return { agent, capability, value, quote: 'q', evidence_url: 'https://e.x/', notes: 'n', confidence: 'high', verified: true, verified_at: '2026-09-10', ...extra };
}

test('diffMatrices reports value changes and new cells only', () => {
  const prev = [cell('a', 'x', 'no'), cell('a', 'y', 'yes'), cell('a', 'z', 'partial')];
  const next = [cell('a', 'x', 'yes', { quote: 'now supported' }), cell('a', 'y', 'yes', { quote: 'different quote same value' }), cell('a', 'z', 'partial'), cell('b', 'x', 'yes')];
  const changes = diffMatrices(prev, next);
  assert.deepEqual(
    changes.map((c) => [c.agent, c.capability, c.from, c.to]),
    [
      ['a', 'x', 'no', 'yes'],
      ['b', 'x', 'unknown', 'yes'],
    ],
  );
  assert.equal(changes[0]?.quote, 'now supported');
});

test('renderChangesMarkdown produces a table with names and escapes pipes', () => {
  const md = renderChangesMarkdown(
    {
      run_at: '2026-09-10T06:00:00Z',
      model: 'claude-fable-5-1',
      changes: [{ agent: 'a', capability: 'x', from: 'no', to: 'yes', quote: 'supports a | b', evidence_url: 'https://e.x/', notes: '' }],
      stats: { agents_checked: 1, agents_failed: ['b'], cells_total: 2, cells_verified: 2, cells_unknown: 0 },
    },
    [
      { id: 'a', name: 'Agent A', vendor: 'v', homepage: 'https://a.x/', repo: null, sources: ['https://a.x/'] },
      { id: 'b', name: 'Agent B', vendor: 'v', homepage: 'https://b.x/', repo: null, sources: ['https://b.x/'] },
    ],
    [{ id: 'x', group: 'g', name: 'Cap X', question: 'q', rubric: 'r' }],
  );
  assert.ok(md.includes('1 value change'));
  assert.ok(md.includes('| Agent A | Cap X | no → **yes** |'));
  assert.ok(md.includes('<code>supports a &#124; b</code>'));
  assert.ok(md.includes('Agent B'));
});

test('renderChangesMarkdown with no changes says so', () => {
  const md = renderChangesMarkdown(
    { run_at: 'r', model: 'm', changes: [], stats: { agents_checked: 0, agents_failed: [], cells_total: 0, cells_verified: 0, cells_unknown: 0 } },
    [],
    [],
  );
  assert.ok(md.includes('No capability values changed'));
});
