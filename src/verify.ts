/**
 * The weekly pipeline: re-read every agent's documentation with Claude and rebuild the matrix.
 *
 *   npm run verify                       all agents
 *   npm run verify -- --agent aider      one agent (other agents keep their previous cells)
 *   npm run verify -- --dry-run          fetch sources and report sizes, no API calls
 *   npm run verify -- --model <id> --effort high --concurrency 2
 *
 * For each agent:
 *   1. fetch every source URL from data/agents.json as text
 *   2. one Claude request with all of it in context, constrained to a JSON schema
 *   3. every returned quote is searched for in the fetched text; not found -> "unknown"
 *   4. cells that became unknown fall back to the previous verified cell if its quote is still
 *      present at its source (so a flaky answer does not erase good data)
 * Then the whole matrix is diffed against the previous one and written with a change log.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { diffMatrices, renderChangesMarkdown } from './diff.js';
import { Fetcher, toFetchableUrl } from './fetch.js';
import { buildSystemPrompt, buildUserPrompt, type SourceText } from './prompt.js';
import { findQuote, prepareText, quoteProblems, type PreparedText } from './quotes.js';
import {
  DATA_DIR,
  cellKey,
  loadAgents,
  loadCapabilities,
  loadMatrix,
  saveJson,
  sortCells,
  todayIso,
  type Agent,
  type Capability,
  type Cell,
  type ChangesFile,
  type Value,
} from './types.js';

const DEFAULT_MODEL = 'claude-fable-5-1';
const MAX_SOURCE_CHARS = 300_000;
const MAX_TOTAL_CHARS = 800_000;
const MIN_SOURCE_CHARS = 200;

// USD per million tokens: [input, output, cache read, cache write]. Approximate, for the run summary only.
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-fable-5-1': [10, 50, 0.25, 12.5],
  'claude-fable-5': [10, 50, 1, 12.5],
  'claude-opus-5': [5, 25, 0.5, 6.25],
  'claude-opus-4-8': [5, 25, 0.5, 6.25],
  'claude-sonnet-5': [2, 10, 0.2, 2.5],
  'claude-haiku-4-5': [1, 5, 0.1, 1.25],
};

const ModelCell = z.object({
  capability_id: z.string(),
  value: z.enum(['yes', 'partial', 'no', 'unknown']),
  quote: z.string(),
  evidence_url: z.string(),
  notes: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});
const ModelOutput = z.object({ cells: z.array(ModelCell) });

interface Options {
  agent: string | null;
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  dryRun: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    agent: null,
    model: process.env.AGENTMATRIX_MODEL?.trim() || DEFAULT_MODEL,
    effort: 'high',
    dryRun: false,
    concurrency: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--agent') opts.agent = argv[++i] ?? null;
    else if (a === '--model') opts.model = argv[++i] ?? opts.model;
    else if (a === '--effort') opts.effort = (argv[++i] as Options['effort']) ?? opts.effort;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--concurrency') opts.concurrency = Math.max(1, Number.parseInt(argv[++i] ?? '2', 10) || 2);
    else if (a === '--help' || a === '-h') {
      console.log('usage: verify [--agent <id>] [--model <id>] [--effort low|medium|high|xhigh|max] [--concurrency N] [--dry-run]');
      process.exit(0);
    }
  }
  return opts;
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function addUsage(total: Usage, u: Anthropic.Usage | Anthropic.Beta.BetaUsage): void {
  total.input += u.input_tokens ?? 0;
  total.output += u.output_tokens ?? 0;
  total.cacheRead += u.cache_read_input_tokens ?? 0;
  total.cacheWrite += u.cache_creation_input_tokens ?? 0;
}

function estimateCost(model: string, u: Usage): string {
  const p = PRICES[model];
  if (!p) return 'unknown price for this model';
  const usd = (u.input * p[0] + u.output * p[1] + u.cacheRead * p[2] + u.cacheWrite * p[3]) / 1e6;
  return `about $${usd.toFixed(2)} (list prices, approximate)`;
}

async function loadSources(agent: Agent, fetcher: Fetcher): Promise<{ sources: SourceText[]; prepared: Map<string, PreparedText>; failures: string[] }> {
  const results = await Promise.all(agent.sources.map((u) => fetcher.get(u)));
  const sources: SourceText[] = [];
  const prepared = new Map<string, PreparedText>();
  const failures: string[] = [];
  let total = 0;
  for (const r of results) {
    if (!r.ok || r.text.length < MIN_SOURCE_CHARS) {
      failures.push(`${r.url} (${r.error ?? `HTTP ${r.status}`}${r.ok ? ', too little text' : ''})`);
      continue;
    }
    const room = Math.max(0, MAX_TOTAL_CHARS - total);
    const limit = Math.min(MAX_SOURCE_CHARS, room);
    const text = r.text.length > limit ? r.text.slice(0, limit) : r.text;
    if (text.length < MIN_SOURCE_CHARS) {
      failures.push(`${r.url} (dropped: total size budget exhausted)`);
      continue;
    }
    total += text.length;
    sources.push({ url: r.url, text, truncated: text.length < r.text.length });
    prepared.set(toFetchableUrl(r.url), prepareText(text));
  }
  return { sources, prepared, failures };
}

async function askClaude(client: Anthropic, opts: Options, system: string, user: string): Promise<{ output: z.infer<typeof ModelOutput>; usage: Anthropic.Beta.BetaUsage; model: string }> {
  const stream = client.beta.messages.stream({
    model: opts.model,
    max_tokens: 16_000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { effort: opts.effort, format: zodOutputFormat(ModelOutput) },
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    const details = message.stop_details ? ` (${message.stop_details.category ?? 'no category'})` : '';
    throw new Error(`request declined by safety classifiers${details}`);
  }
  if (message.stop_reason === 'max_tokens') throw new Error('output truncated at max_tokens');
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const output = ModelOutput.parse(JSON.parse(text));
  return { output, usage: message.usage, model: message.model };
}

interface AgentResult {
  agent: string;
  cells: Cell[];
  failed: string | null;
  usage: Usage;
}

async function verifyAgent(
  agent: Agent,
  capabilities: Capability[],
  previous: Map<string, Cell>,
  client: Anthropic | null,
  opts: Options,
  system: string,
  fetcher: Fetcher,
): Promise<AgentResult> {
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const keep = (reason: string): AgentResult => ({
    agent: agent.id,
    cells: capabilities.map((c) => previous.get(cellKey(agent.id, c.id)) ?? emptyCell(agent.id, c.id)),
    failed: reason,
    usage,
  });

  const { sources, prepared, failures } = await loadSources(agent, fetcher);
  const size = sources.reduce((n, s) => n + s.text.length, 0);
  console.log(`[${agent.id}] ${sources.length}/${agent.sources.length} sources, ${size.toLocaleString()} chars${failures.length ? `; failed: ${failures.join(', ')}` : ''}`);
  if (sources.length === 0) return keep('no source could be fetched');
  if (opts.dryRun || !client) return keep('dry run');

  let output: z.infer<typeof ModelOutput>;
  try {
    const res = await askClaude(client, opts, system, buildUserPrompt(agent, sources));
    output = res.output;
    addUsage(usage, res.usage);
    console.log(`[${agent.id}] model ${res.model}: ${res.usage.input_tokens} in, ${res.usage.output_tokens} out, cache read ${res.usage.cache_read_input_tokens ?? 0}, cache write ${res.usage.cache_creation_input_tokens ?? 0}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[${agent.id}] FAILED: ${msg}`);
    return keep(msg);
  }

  const today = todayIso();
  const byCap = new Map(output.cells.map((c) => [c.capability_id, c]));
  const cells: Cell[] = [];
  let verifiedCount = 0;
  let demoted = 0;
  let restored = 0;
  for (const cap of capabilities) {
    const key = cellKey(agent.id, cap.id);
    const m = byCap.get(cap.id);
    const prev = previous.get(key);
    let cell: Cell;
    if (m && m.value !== 'unknown') {
      const page = prepared.get(toFetchableUrl(m.evidence_url)) ?? (await fetchExtra(m.evidence_url, fetcher));
      const problems = quoteProblems(m.quote);
      const found = page ? findQuote(page, m.quote).found : false;
      if (problems.length === 0 && found) {
        cell = { agent: agent.id, capability: cap.id, value: m.value, quote: m.quote.trim(), evidence_url: m.evidence_url, notes: m.notes.trim(), confidence: m.confidence, verified: true, verified_at: today };
        verifiedCount++;
      } else {
        demoted++;
        const why = problems.length ? problems.join('; ') : page ? 'quote not found at source' : 'source not fetched';
        cell = { agent: agent.id, capability: cap.id, value: 'unknown', quote: '', evidence_url: '', notes: `UNVERIFIED (${why}); model proposed ${m.value}: ${m.notes.trim()}`, confidence: 'low', verified: false, verified_at: '' };
      }
    } else {
      cell = { agent: agent.id, capability: cap.id, value: 'unknown', quote: '', evidence_url: '', notes: m?.notes.trim() ?? '', confidence: 'low', verified: false, verified_at: '' };
    }

    if (cell.value === 'unknown' && prev && prev.value !== 'unknown' && prev.quote) {
      const page = prepared.get(toFetchableUrl(prev.evidence_url)) ?? (await fetchExtra(prev.evidence_url, fetcher));
      if (page && findQuote(page, prev.quote).found) {
        cell = { ...prev, verified: true, verified_at: today };
        restored++;
      }
    }
    cells.push(cell);
  }
  console.log(`[${agent.id}] ${verifiedCount} verified, ${demoted} demoted to unknown, ${restored} restored from previous, ${cells.filter((c) => c.value === 'unknown').length} unknown`);
  return { agent: agent.id, cells, failed: null, usage };
}

const extraCache = new Map<string, Promise<PreparedText | null>>();
function fetchExtra(url: string, fetcher: Fetcher): Promise<PreparedText | null> {
  if (!/^https?:\/\//.test(url)) return Promise.resolve(null);
  const key = toFetchableUrl(url);
  let p = extraCache.get(key);
  if (!p) {
    p = fetcher.get(url).then((r) => (r.ok && r.text.length >= MIN_SOURCE_CHARS ? prepareText(r.text) : null));
    extraCache.set(key, p);
  }
  return p;
}

function emptyCell(agent: string, capability: string): Cell {
  return { agent, capability, value: 'unknown', quote: '', evidence_url: '', notes: '', confidence: 'low', verified: false, verified_at: '' };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function runVerify(opts: Options): Promise<number> {
  const agents = loadAgents();
  const caps = loadCapabilities();
  const previousFile = loadMatrix();
  const previous = new Map(previousFile.cells.map((c) => [cellKey(c.agent, c.capability), c]));

  const targets = opts.agent ? agents.filter((a) => a.id === opts.agent) : agents;
  if (targets.length === 0) throw new Error(`unknown agent ${opts.agent}`);

  const client = opts.dryRun ? null : new Anthropic({ timeout: 20 * 60 * 1000, maxRetries: 3 });
  const system = buildSystemPrompt(caps);
  const fetcher = new Fetcher({}, 4);
  console.log(`Verifying ${targets.length} agent(s) with ${opts.dryRun ? 'no model (dry run)' : `${opts.model} at effort ${opts.effort}`}`);

  const results = await mapLimit(targets, opts.concurrency, (agent) => verifyAgent(agent, caps.capabilities, previous, client, opts, system, fetcher));

  const total: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const r of results) {
    total.input += r.usage.input;
    total.output += r.usage.output;
    total.cacheRead += r.usage.cacheRead;
    total.cacheWrite += r.usage.cacheWrite;
  }
  console.log(`Tokens: ${total.input.toLocaleString()} in, ${total.output.toLocaleString()} out, ${total.cacheRead.toLocaleString()} cache read, ${total.cacheWrite.toLocaleString()} cache write; ${estimateCost(opts.model, total)}`);

  if (opts.dryRun) return 0;

  const processed = new Set(results.map((r) => r.agent));
  const cells: Cell[] = [];
  for (const r of results) cells.push(...r.cells);
  for (const a of agents) {
    if (processed.has(a.id)) continue;
    for (const c of caps.capabilities) cells.push(previous.get(cellKey(a.id, c.id)) ?? emptyCell(a.id, c.id));
  }
  const sorted = sortCells(cells, agents, caps.capabilities);
  const changes = diffMatrices(previousFile.cells, sorted);
  const failed = results.filter((r) => r.failed).map((r) => r.agent);
  const changesFile: ChangesFile = {
    run_at: new Date().toISOString(),
    model: opts.model,
    changes,
    stats: {
      agents_checked: results.length - failed.length,
      agents_failed: failed,
      cells_total: sorted.length,
      cells_verified: sorted.filter((c) => c.verified).length,
      cells_unknown: sorted.filter((c) => c.value === 'unknown').length,
    },
  };

  saveJson(path.join(DATA_DIR, 'matrix.json'), { version: 1, generated_at: changesFile.run_at, cells: sorted });
  saveJson(path.join(DATA_DIR, 'changes.json'), changesFile);
  writeFileSync(path.join(DATA_DIR, 'changes.md'), renderChangesMarkdown(changesFile, agents, caps.capabilities), 'utf8');
  console.log(`Wrote data/matrix.json (${sorted.length} cells), data/changes.json (${changes.length} changes), data/changes.md${failed.length ? `; agents kept from previous run: ${failed.join(', ')}` : ''}`);
  const counts: Record<Value, number> = { yes: 0, partial: 0, no: 0, unknown: 0 };
  for (const c of sorted) counts[c.value]++;
  console.log(`Matrix: ${JSON.stringify(counts)}`);
  return failed.length === results.length ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('src', 'verify.ts'));
if (isMain) {
  runVerify(parseArgs(process.argv.slice(2)))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(2);
    });
}
