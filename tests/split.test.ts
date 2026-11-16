import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutValueChanges } from '../src/split.js';
import type { Cell } from '../src/types.js';

const cell = (capability: string, extra: Partial<Cell> = {}): Cell => ({ agent: 'a', capability, value: 'yes', quote: 'A documented sentence.', evidence_url: 'https://docs.example/p', notes: '', confidence: 'high', verified: true, verified_at: '2026-11-01', ...extra });

test('withoutValueChanges keeps dates and flags, puts changed cells back as they were, and holds back cells main never had', () => {
  const before = [cell('x', { quote_missing_since: '2026-11-09' }), cell('y')];
  const result = [cell('x', { value: 'unknown', quote: '', evidence_url: '', verified: false, verified_at: '' }), cell('y', { verified_at: '2026-11-16' }), cell('new', { value: 'partial' })];
  const main = withoutValueChanges(result, before, [{ agent: 'a', capability: 'x' }, { agent: 'a', capability: 'new' }]);
  assert.deepEqual(main[0], before[0], 'the demoted cell stays as it was, still flagged');
  assert.equal(main[1]!.verified_at, '2026-11-16', 'an unchanged cell keeps its new date');
  assert.equal(main[2]!.value, 'unknown', 'a new value waits for the pull request');
  assert.equal(result[0]!.value, 'unknown', 'the result itself is not modified');
});
