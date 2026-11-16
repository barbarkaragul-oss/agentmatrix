/**
 * The weekly workflow's split, for a week with value changes: rewrites data/matrix.json so that
 * every cell this run changed in value keeps its version from main (git HEAD), while dates and
 * missing-quote flags stay as the run left them, and empties the change list in data/changes.json,
 * so main's README and site do not announce value changes main does not have. The workflow commits
 * that to main, then puts the full result back and opens the pull request with it.
 *
 *   tsx scripts/split-value-changes.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { withoutValueChanges } from '../src/split.ts';

const result = JSON.parse(readFileSync('data/matrix.json', 'utf8'));
const changes = JSON.parse(readFileSync('data/changes.json', 'utf8'));
const before = JSON.parse(execFileSync('git', ['show', 'HEAD:data/matrix.json'], { encoding: 'utf8', maxBuffer: 64 << 20 }));
writeFileSync('data/matrix.json', JSON.stringify({ ...result, cells: withoutValueChanges(result.cells, before.cells, changes.changes) }, null, 2) + '\n', 'utf8');
writeFileSync('data/changes.json', JSON.stringify({ ...changes, changes: [] }, null, 2) + '\n', 'utf8');
console.log(`kept ${changes.changes.length} value change(s) out of main; they go to the pull request`);
