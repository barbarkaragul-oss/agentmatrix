/**
 * Splitting a weekly run's result between main and a pull request: dates and missing-quote flags
 * go to main at once, value changes (a demotion, or a re-derived value) wait in a pull request for
 * a human. Used by scripts/split-value-changes.ts in the weekly workflow.
 */
import type { Cell } from './types.js';

const key = (c: { agent: string; capability: string }): string => `${c.agent}|${c.capability}`;

/**
 * The cells that go to main when a run also changes values: the run's result, except that every
 * changed cell keeps its version from before the run (still flagged, so the next run demotes it
 * again until the pull request is merged or the quote is fixed). A changed cell that did not exist
 * before goes to main as unknown, so its new value too waits for the pull request.
 */
export function withoutValueChanges(result: Cell[], before: Cell[], changed: Array<{ agent: string; capability: string }>): Cell[] {
  const changedKeys = new Set(changed.map(key));
  const beforeByKey = new Map(before.map((c) => [key(c), c]));
  const placeholder = (c: Cell): Cell => ({ agent: c.agent, capability: c.capability, value: 'unknown', quote: '', evidence_url: '', notes: '', confidence: 'low', verified: false, verified_at: '' });
  return result.map((c) => (changedKeys.has(key(c)) ? (beforeByKey.get(key(c)) ?? placeholder(c)) : c));
}
