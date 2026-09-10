import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const DOCS_DIR = path.join(ROOT, 'docs');

const httpUrl = z.string().refine((s) => /^https?:\/\/\S+$/.test(s), 'must be an http(s) URL');
const httpUrlOrEmpty = z.string().refine((s) => s === '' || /^https?:\/\/\S+$/.test(s), 'must be empty or an http(s) URL');

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\/\S+$/.test(s);
}

/** Makes a URL safe as a markdown link destination: spaces and parentheses would end or break it. */
export function mdUrl(url: string): string {
  return url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

export const ValueSchema = z.enum(['yes', 'partial', 'no', 'unknown']);
export type Value = z.infer<typeof ValueSchema>;

export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const AgentSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase id with dashes'),
  name: z.string().min(1),
  vendor: z.string().min(1),
  homepage: httpUrl,
  repo: httpUrl.nullable(),
  sources: z.array(httpUrl).min(1),
});
export type Agent = z.infer<typeof AgentSchema>;

export const AgentsFileSchema = z.object({ agents: z.array(AgentSchema).min(1) });

export const CapabilitySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/, 'snake_case id'),
  group: z.string().min(1),
  name: z.string().min(1),
  question: z.string().min(1),
  rubric: z.string().min(1),
});
export type Capability = z.infer<typeof CapabilitySchema>;

export const CapabilitiesFileSchema = z.object({
  values: z.record(z.string(), z.string()),
  groups: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
  capabilities: z.array(CapabilitySchema).min(1),
});
export type CapabilitiesFile = z.infer<typeof CapabilitiesFileSchema>;

export const CellSchema = z.object({
  agent: z.string(),
  capability: z.string(),
  value: ValueSchema,
  quote: z.string(),
  evidence_url: httpUrlOrEmpty,
  notes: z.string(),
  confidence: ConfidenceSchema,
  verified: z.boolean(),
  verified_at: z.string(),
});
export type Cell = z.infer<typeof CellSchema>;

export const MatrixFileSchema = z.object({
  version: z.literal(1),
  generated_at: z.string(),
  cells: z.array(CellSchema),
});
export type MatrixFile = z.infer<typeof MatrixFileSchema>;

export const ChangeSchema = z.object({
  agent: z.string(),
  capability: z.string(),
  from: ValueSchema,
  to: ValueSchema,
  quote: z.string(),
  evidence_url: httpUrlOrEmpty,
  notes: z.string(),
});
export type Change = z.infer<typeof ChangeSchema>;

export const ChangesFileSchema = z.object({
  run_at: z.string(),
  model: z.string(),
  changes: z.array(ChangeSchema),
  stats: z.object({
    agents_checked: z.number(),
    agents_failed: z.array(z.string()),
    cells_total: z.number(),
    cells_verified: z.number(),
    cells_unknown: z.number(),
  }),
});
export type ChangesFile = z.infer<typeof ChangesFileSchema>;

export function cellKey(agent: string, capability: string): string {
  return `${agent}|${capability}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function loadAgents(): Agent[] {
  return AgentsFileSchema.parse(readJson(path.join(DATA_DIR, 'agents.json'))).agents;
}

export function loadCapabilities(): CapabilitiesFile {
  const file = CapabilitiesFileSchema.parse(readJson(path.join(DATA_DIR, 'capabilities.json')));
  const groupIds = new Set(file.groups.map((g) => g.id));
  for (const c of file.capabilities) {
    if (!groupIds.has(c.group)) throw new Error(`capability ${c.id} references unknown group ${c.group}`);
  }
  const ids = new Set<string>();
  for (const c of file.capabilities) {
    if (ids.has(c.id)) throw new Error(`duplicate capability id ${c.id}`);
    ids.add(c.id);
  }
  return file;
}

export function loadMatrix(): MatrixFile {
  const file = path.join(DATA_DIR, 'matrix.json');
  if (!existsSync(file)) return { version: 1, generated_at: '', cells: [] };
  return MatrixFileSchema.parse(readJson(file));
}

export function loadChanges(): ChangesFile | null {
  const file = path.join(DATA_DIR, 'changes.json');
  if (!existsSync(file)) return null;
  return ChangesFileSchema.parse(readJson(file));
}

export function saveJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/** Sort cells in canonical order (agent order, then capability order) so diffs stay stable. */
export function sortCells(cells: Cell[], agents: Agent[], capabilities: Capability[]): Cell[] {
  const agentOrder = new Map(agents.map((a, i) => [a.id, i]));
  const capOrder = new Map(capabilities.map((c, i) => [c.id, i]));
  return [...cells].sort((a, b) => {
    const da = (agentOrder.get(a.agent) ?? 1e9) - (agentOrder.get(b.agent) ?? 1e9);
    if (da !== 0) return da;
    return (capOrder.get(a.capability) ?? 1e9) - (capOrder.get(b.capability) ?? 1e9);
  });
}
