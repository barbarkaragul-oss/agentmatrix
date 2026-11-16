import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFix, classifyCell, failingNow, structuralProblems, unusablePage, GRACE_DAYS, type CellReport } from '../src/check.js';
import { prepareText } from '../src/quotes.js';
import type { Agent, Capability, Cell } from '../src/types.js';

function cell(agent: string, capability: string, value: Cell['value'], quote = 'A documented sentence about the feature.', url = 'https://docs.example/page'): Cell {
  return { agent, capability, value, quote, evidence_url: url, notes: 'note', confidence: 'high', verified: true, verified_at: '2026-09-01' };
}

test('classifyCell: ok, fail, error and skipped', () => {
  const page = prepareText('Intro. A documented sentence about the feature. Outro.');
  assert.equal(classifyCell(cell('a', 'x', 'yes'), page).status, 'ok');
  const fail = classifyCell(cell('a', 'x', 'yes', 'A sentence that is not on the page.'), page);
  assert.equal(fail.status, 'fail');
  assert.deepEqual(fail.problems, ['quote not found on page']);
  const err = classifyCell(cell('a', 'x', 'yes'), { error: 'HTTP 503' });
  assert.equal(err.status, 'error');
  const missing = classifyCell(cell('a', 'x', 'yes'), undefined);
  assert.equal(missing.status, 'error');
  assert.equal(classifyCell(cell('a', 'x', 'unknown', '', ''), page).status, 'skipped');
});

const failReport = (capability: string, value = 'yes'): CellReport => ({ agent: 'a', capability, value, status: 'fail', method: 'none', evidence_url: 'https://docs.example/page', problems: ['quote not found on page'] });

test('applyFix: verified cells are dated, a first missing quote only flags the cell, errors are untouched', () => {
  const cells = [cell('a', 'ok', 'yes'), cell('a', 'gone', 'partial'), cell('a', 'err', 'no'), cell('a', 'unk', 'unknown', '', '')];
  const reports: CellReport[] = [
    { agent: 'a', capability: 'ok', value: 'yes', status: 'ok', method: 'exact', evidence_url: 'https://docs.example/page', problems: [] },
    failReport('gone', 'partial'),
    { agent: 'a', capability: 'err', value: 'no', status: 'error', method: 'none', evidence_url: 'https://docs.example/page', problems: ['fetch failed: HTTP 503'] },
    { agent: 'a', capability: 'unk', value: 'unknown', status: 'skipped', method: 'none', evidence_url: '', problems: [] },
  ];
  const { cells: out, demoted, pending } = applyFix(cells, reports, ['a|missing'], '2026-09-10');
  assert.equal(demoted, 0);
  assert.deepEqual(pending, [{ agent: 'a', capability: 'gone', evidence_url: 'https://docs.example/page', since: '2026-09-10' }]);
  const byCap = new Map(out.map((c) => [c.capability, c]));
  assert.deepEqual([byCap.get('ok')!.verified, byCap.get('ok')!.verified_at], [true, '2026-09-10']);
  const gone = byCap.get('gone')!;
  assert.equal(gone.value, 'partial', 'kept for the grace week');
  assert.equal(gone.quote_missing_since, '2026-09-10');
  assert.equal(gone.verified_at, '2026-09-01', 'a missing quote does not re-date the cell');
  const err = byCap.get('err')!;
  assert.equal(err.value, 'no');
  assert.equal(err.verified_at, '2026-09-01', 'fetch errors must not touch the cell');
  assert.equal(byCap.get('unk')!.verified, false);
  assert.equal(byCap.get('missing')!.value, 'unknown');
});

test('applyFix: a quote still missing GRACE_DAYS after its flag demotes the cell, keeping the old data in the notes', () => {
  const flagged = { ...cell('a', 'gone', 'partial'), quote_missing_since: '2026-09-10' };
  const soon = applyFix([flagged], [failReport('gone', 'partial')], [], '2026-09-15');
  assert.equal(soon.demoted, 0, `${GRACE_DAYS - 1} days: still within the grace week`);
  assert.equal(soon.cells[0]!.quote_missing_since, '2026-09-10', 'the first date is kept');
  const late = applyFix([flagged], [failReport('gone', 'partial')], [], '2026-09-16');
  assert.equal(late.demoted, 1);
  const gone = late.cells[0]!;
  assert.equal(gone.value, 'unknown');
  assert.equal(gone.quote, '');
  assert.equal(gone.evidence_url, '');
  assert.equal(gone.verified, false);
  assert.equal(gone.quote_missing_since, undefined);
  assert.match(gone.notes, /^UNVERIFIED on 2026-09-16 \(quote not found on page since 2026-09-10; was partial\): "A documented sentence about the feature\." at https:\/\/docs\.example\/page \| note$/);
  // A demoted cell is skipped next time instead of failing again.
  const again = applyFix(late.cells, [classifyCell(gone, prepareText('anything'))], [], '2026-09-23');
  assert.equal(again.demoted, 0);
  assert.deepEqual(again.cells[0], gone);
});

test('applyFix: a quote found again clears the flag; a page that cannot be read keeps it', () => {
  const flagged = { ...cell('a', 'x', 'yes'), quote_missing_since: '2026-09-10' };
  const ok = applyFix([flagged], [{ agent: 'a', capability: 'x', value: 'yes', status: 'ok', method: 'exact', evidence_url: 'https://docs.example/page', problems: [] }], [], '2026-09-12');
  assert.equal(ok.cells[0]!.quote_missing_since, undefined);
  assert.equal(ok.cells[0]!.verified_at, '2026-09-12');
  const err = applyFix([flagged], [{ agent: 'a', capability: 'x', value: 'yes', status: 'error', method: 'none', evidence_url: 'https://docs.example/page', problems: ['fetch failed: HTTP 503'] }], [], '2026-09-20');
  assert.deepEqual(err.cells[0], flagged, 'an outage neither demotes nor moves the clock');
});

test('failingNow: a missing quote on a cell the weekly run already flagged is reported, not failed', () => {
  // 2026-11-16: a flag on main must not fail every pull request for the grace week.
  const flagged = { ...cell('a', 'old', 'yes'), quote_missing_since: '2026-11-16' };
  const fresh = cell('a', 'new', 'yes');
  assert.deepEqual(failingNow([failReport('old'), failReport('new')], [flagged, fresh]).map((r) => r.capability), ['new']);
});

test('structuralProblems: a missing-quote flag must be a date no later than today', () => {
  const agents = [{ id: 'a', name: 'A' }] as any;
  const caps = [{ id: 'x' }] as any;
  const run = (since: string) => structuralProblems([{ ...cell('a', 'x', 'yes'), quote_missing_since: since }], agents, caps, '2026-11-16').problems;
  assert.deepEqual(run('2026-11-10'), []);
  assert.deepEqual(run('2026-11-16'), []);
  assert.equal(run('2099-01-01').length, 1, 'a future date would put the demotion off for good');
  assert.equal(run('soon').length, 1);
});

test('unusablePage rejects truncated, empty and bot-challenge pages', () => {
  assert.equal(unusablePage('x'.repeat(5000), true), 'page larger than the download limit');
  assert.match(unusablePage('short', false) ?? '', /only 5 characters/);
  assert.match(unusablePage('Just a moment... Checking your browser before accessing the site. ' + 'x'.repeat(300), false) ?? '', /bot challenge/);
  assert.equal(unusablePage('Real documentation. '.repeat(20), false), null);
});

test('structuralProblems finds duplicates, unknown ids, missing quotes and missing cells', () => {
  const agents: Agent[] = [{ id: 'a', name: 'A', vendor: 'v', homepage: 'https://a.x/', repo: null, sources: ['https://a.x/'] }];
  const caps: Capability[] = [
    { id: 'x', group: 'g', name: 'X', question: 'q', rubric: 'r' },
    { id: 'y', group: 'g', name: 'Y', question: 'q', rubric: 'r' },
  ];
  const { problems, missing } = structuralProblems([cell('a', 'x', 'yes'), cell('a', 'x', 'yes'), cell('b', 'z', 'no', '', ''), { ...cell('a', 'y', 'unknown', '', ''), verified: true }], agents, caps);
  assert.ok(problems.some((p) => p.startsWith('duplicate cell a|x')));
  assert.ok(problems.some((p) => p === 'unknown agent b'));
  assert.ok(problems.some((p) => p === 'unknown capability z'));
  assert.ok(problems.some((p) => p.includes('requires quote and evidence_url')));
  assert.ok(problems.some((p) => p.includes('unknown cells cannot be verified')));
  assert.deepEqual(missing, []);
  assert.deepEqual(structuralProblems([cell('a', 'x', 'yes')], agents, caps).missing, ['a|y']);
});
