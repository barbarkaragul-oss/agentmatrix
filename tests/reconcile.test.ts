import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, type ModelCell } from '../src/verify.js';
import { prepareText } from '../src/quotes.js';
import { cellKey, type Capability, type Cell } from '../src/types.js';

const caps: Capability[] = [
  { id: 'hooks', group: 'extend', name: 'Hooks', question: 'q', rubric: 'r' },
  { id: 'sandbox', group: 'control', name: 'Sandbox', question: 'q', rubric: 'r' },
  { id: 'plan_mode', group: 'control', name: 'Plan mode', question: 'q', rubric: 'r' },
];

const PAGES: Record<string, string> = {
  'https://docs.example/hooks': 'Hooks run shell commands at lifecycle events such as PreToolUse and PostToolUse.',
  'https://docs.example/sandbox': 'The sandbox is built in and available on macOS only for now.',
  'https://docs.example/plan': 'Plan mode lets the agent explore without editing files.',
};
const lookup = async (url: string) => (PAGES[url] ? prepareText(PAGES[url]) : null);

function model(capability_id: string, value: ModelCell['value'], quote: string, evidence_url: string): ModelCell {
  return { capability_id, value, quote, evidence_url, notes: `note for ${capability_id}`, confidence: 'high' };
}

function prevCell(capability: string, value: Cell['value'], quote: string, evidence_url: string): Cell {
  return { agent: 'a', capability, value, quote, evidence_url, notes: 'previous note', confidence: 'high', verified: true, verified_at: '2026-09-01' };
}

test('reconcile keeps verified proposals and dates them', async () => {
  const r = await reconcile('a', caps, [
    model('hooks', 'yes', 'Hooks run shell commands at lifecycle events', 'https://docs.example/hooks'),
    model('sandbox', 'partial', 'available on macOS only for now', 'https://docs.example/sandbox'),
    model('plan_mode', 'yes', 'Plan mode lets the agent explore without editing files.', 'https://docs.example/plan'),
  ], new Map(), lookup, '2026-09-10');
  assert.equal(r.verifiedCount, 3);
  assert.equal(r.demoted, 0);
  assert.deepEqual(r.cells.map((c) => [c.capability, c.value, c.verified, c.verified_at]), [
    ['hooks', 'yes', true, '2026-09-10'],
    ['sandbox', 'partial', true, '2026-09-10'],
    ['plan_mode', 'yes', true, '2026-09-10'],
  ]);
});

test('reconcile demotes a proposal whose quote is not on the page, keeping the proposal in the notes', async () => {
  const r = await reconcile('a', caps, [
    model('hooks', 'yes', 'Hooks support twelve documented events and HTTP handlers.', 'https://docs.example/hooks'),
    model('sandbox', 'no', 'There is no sandbox at all.', 'https://docs.example/does-not-exist'),
  ], new Map(), lookup, '2026-09-10');
  const hooks = r.cells.find((c) => c.capability === 'hooks')!;
  const sandbox = r.cells.find((c) => c.capability === 'sandbox')!;
  const plan = r.cells.find((c) => c.capability === 'plan_mode')!;
  assert.equal(r.demoted, 2);
  assert.equal(hooks.value, 'unknown');
  assert.equal(hooks.verified, false);
  assert.match(hooks.notes, /^UNVERIFIED \(quote not found at source\); model proposed yes: note for hooks/);
  assert.equal(sandbox.value, 'unknown');
  assert.match(sandbox.notes, /source not fetched/);
  assert.equal(plan.value, 'unknown');
  assert.equal(plan.notes, '');
});

test('reconcile restores the previous verified cell when the new answer is unknown and the old quote still exists', async () => {
  const previous = new Map<string, Cell>([
    [cellKey('a', 'hooks'), prevCell('hooks', 'yes', 'lifecycle events such as PreToolUse', 'https://docs.example/hooks')],
    [cellKey('a', 'sandbox'), prevCell('sandbox', 'yes', 'The sandbox works on every platform.', 'https://docs.example/sandbox')],
  ]);
  const r = await reconcile('a', caps, [
    model('hooks', 'unknown', '', ''),
    model('sandbox', 'yes', 'this quote is fabricated', 'https://docs.example/sandbox'),
  ], previous, lookup, '2026-09-10');
  const hooks = r.cells.find((c) => c.capability === 'hooks')!;
  const sandbox = r.cells.find((c) => c.capability === 'sandbox')!;
  assert.equal(r.restored, 1);
  assert.equal(hooks.value, 'yes');
  assert.equal(hooks.quote, 'lifecycle events such as PreToolUse');
  assert.equal(hooks.notes, 'previous note');
  assert.equal(hooks.verified_at, '2026-09-10');
  assert.equal(sandbox.value, 'unknown', 'previous quote no longer on the page must not be restored');
  assert.match(sandbox.notes, /model proposed yes/);
});

test('reconcile rejects malformed quotes even when the words appear on the page', async () => {
  const r = await reconcile('a', caps, [
    model('plan_mode', 'yes', 'Plan mode', 'https://docs.example/plan'),
  ], new Map(), lookup, '2026-09-10');
  const plan = r.cells.find((c) => c.capability === 'plan_mode')!;
  assert.equal(plan.value, 'unknown');
  assert.match(plan.notes, /shorter than/);
});
