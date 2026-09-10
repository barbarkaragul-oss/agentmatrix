/**
 * Offline verification of the matrix: does every quote really appear at its evidence URL?
 *
 *   npm run check                 report only, exit 1 on any failure
 *   npm run check -- --soft       report only, always exit 0
 *   npm run check -- --fix        rewrite data/matrix.json: passing cells -> verified today,
 *                                 failing cells -> value "unknown", verified false
 *   npm run check -- --agent id   limit to one agent
 *
 * No API key needed. This is the same mechanical check the weekly pipeline applies to the
 * model's output, so contributors can run it on hand-written data before opening a PR.
 */
import path from 'node:path';
import { Fetcher } from './fetch.js';
import { findQuote, prepareText, quoteProblems, type MatchMethod } from './quotes.js';
import {
  DATA_DIR,
  cellKey,
  loadAgents,
  loadCapabilities,
  loadMatrix,
  saveJson,
  sortCells,
  todayIso,
  type Cell,
} from './types.js';

interface CellReport {
  agent: string;
  capability: string;
  value: string;
  status: 'ok' | 'fail' | 'skipped';
  method: MatchMethod;
  evidence_url: string;
  problems: string[];
}

function parseArgs(argv: string[]): { soft: boolean; fix: boolean; agent: string | null } {
  const out = { soft: false, fix: false, agent: null as string | null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--soft') out.soft = true;
    else if (a === '--fix') out.fix = true;
    else if (a === '--agent') out.agent = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') {
      console.log('usage: check [--soft] [--fix] [--agent <id>]');
      process.exit(0);
    }
  }
  return out;
}

export async function runCheck(opts: { soft: boolean; fix: boolean; agent: string | null }): Promise<number> {
  const agents = loadAgents();
  const caps = loadCapabilities();
  const matrix = loadMatrix();
  const agentIds = new Set(agents.map((a) => a.id));
  const capIds = new Set(caps.capabilities.map((c) => c.id));

  const structural: string[] = [];
  const seen = new Set<string>();
  for (const cell of matrix.cells) {
    const key = cellKey(cell.agent, cell.capability);
    if (seen.has(key)) structural.push(`duplicate cell ${key}`);
    seen.add(key);
    if (!agentIds.has(cell.agent)) structural.push(`unknown agent ${cell.agent}`);
    if (!capIds.has(cell.capability)) structural.push(`unknown capability ${cell.capability}`);
    if (cell.value !== 'unknown' && (!cell.quote.trim() || !cell.evidence_url.trim())) {
      structural.push(`${key}: value ${cell.value} requires quote and evidence_url`);
    }
    if (cell.value === 'unknown' && cell.verified) structural.push(`${key}: unknown cells cannot be verified`);
  }
  const missing: string[] = [];
  for (const a of agents) {
    for (const c of caps.capabilities) {
      if (!seen.has(cellKey(a.id, c.id))) missing.push(cellKey(a.id, c.id));
    }
  }

  const targets = matrix.cells.filter((c) => !opts.agent || c.agent === opts.agent);
  const fetcher = new Fetcher({}, 4);
  const reports: CellReport[] = [];
  const cellsToCheck = targets.filter((c) => c.quote.trim() && c.evidence_url.trim());
  const skipped = targets.filter((c) => !(c.quote.trim() && c.evidence_url.trim()));

  const urls = [...new Set(cellsToCheck.map((c) => c.evidence_url))];
  console.log(`Checking ${cellsToCheck.length} quoted cells across ${urls.length} URLs (${skipped.length} cells without a quote skipped)`);

  const prepared = new Map<string, ReturnType<typeof prepareText> | { error: string }>();
  await Promise.all(
    urls.map(async (url) => {
      const res = await fetcher.get(url);
      if (!res.ok) {
        prepared.set(url, { error: res.error ?? `HTTP ${res.status}` });
        console.log(`  FETCH FAIL ${url} (${res.error ?? res.status})`);
      } else {
        prepared.set(url, prepareText(res.text));
      }
    }),
  );

  for (const cell of cellsToCheck) {
    const problems = quoteProblems(cell.quote);
    const page = prepared.get(cell.evidence_url);
    let method: MatchMethod = 'none';
    if (!page) problems.push('page not fetched');
    else if ('error' in page) problems.push(`fetch failed: ${page.error}`);
    else {
      const m = findQuote(page, cell.quote);
      method = m.method;
      if (!m.found) problems.push('quote not found on page');
    }
    reports.push({
      agent: cell.agent,
      capability: cell.capability,
      value: cell.value,
      status: problems.length === 0 ? 'ok' : 'fail',
      method,
      evidence_url: cell.evidence_url,
      problems,
    });
  }
  for (const cell of skipped) {
    reports.push({ agent: cell.agent, capability: cell.capability, value: cell.value, status: 'skipped', method: 'none', evidence_url: cell.evidence_url, problems: [] });
  }

  const failures = reports.filter((r) => r.status === 'fail');
  const okCount = reports.filter((r) => r.status === 'ok').length;
  for (const f of failures) console.log(`  FAIL ${f.agent}/${f.capability} [${f.value}] ${f.problems.join('; ')} <${f.evidence_url}>`);
  for (const s of structural) console.log(`  STRUCTURE ${s}`);
  if (missing.length) console.log(`  MISSING ${missing.length} cells (agent x capability pairs without an entry)`);

  const byMethod: Record<string, number> = {};
  for (const r of reports) if (r.status === 'ok') byMethod[r.method] = (byMethod[r.method] ?? 0) + 1;
  console.log(`Result: ${okCount} ok, ${failures.length} failed, ${skipped.length} skipped, ${structural.length} structural problems, ${missing.length} missing. Match methods: ${JSON.stringify(byMethod)}`);

  saveJson(path.join(DATA_DIR, 'check-report.json'), {
    run_at: new Date().toISOString(),
    ok: okCount,
    failed: failures.length,
    skipped: skipped.length,
    structural,
    missing,
    cells: reports,
  });

  if (opts.fix) {
    const today = todayIso();
    const failKeys = new Set(failures.map((f) => cellKey(f.agent, f.capability)));
    const okKeys = new Set(reports.filter((r) => r.status === 'ok').map((r) => cellKey(r.agent, r.capability)));
    const cells: Cell[] = matrix.cells.map((cell) => {
      const key = cellKey(cell.agent, cell.capability);
      if (failKeys.has(key)) {
        const marker = 'UNVERIFIED';
        const notes = cell.notes.startsWith(marker) ? cell.notes : `${marker} (quote not found at source on ${today}; previous value ${cell.value}): ${cell.notes}`;
        return { ...cell, value: 'unknown', verified: false, notes };
      }
      if (okKeys.has(key)) return { ...cell, verified: true, verified_at: today };
      if (cell.value === 'unknown') return { ...cell, verified: false };
      return cell;
    });
    for (const key of missing) {
      const [agent, capability] = key.split('|') as [string, string];
      cells.push({ agent, capability, value: 'unknown', quote: '', evidence_url: '', notes: '', confidence: 'low', verified: false, verified_at: '' });
    }
    saveJson(path.join(DATA_DIR, 'matrix.json'), {
      version: 1,
      generated_at: new Date().toISOString(),
      cells: sortCells(cells, agents, caps.capabilities),
    });
    console.log(`Wrote data/matrix.json (${failures.length} cells set to unknown, ${missing.length} missing cells added)`);
  }

  const bad = failures.length + structural.length + (opts.fix ? 0 : missing.length);
  return bad > 0 && !opts.soft ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('src', 'check.ts'));
if (isMain) {
  runCheck(parseArgs(process.argv.slice(2)))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 2;
    });
}
