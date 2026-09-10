import type { Agent, Capability, Cell, Change, ChangesFile } from './types.js';
import { cellKey } from './types.js';

export function diffMatrices(previous: Cell[], next: Cell[]): Change[] {
  const prevByKey = new Map(previous.map((c) => [cellKey(c.agent, c.capability), c]));
  const changes: Change[] = [];
  for (const cell of next) {
    const before = prevByKey.get(cellKey(cell.agent, cell.capability));
    const from = before?.value ?? 'unknown';
    if (from === cell.value) continue;
    changes.push({
      agent: cell.agent,
      capability: cell.capability,
      from,
      to: cell.value,
      quote: cell.quote,
      evidence_url: cell.evidence_url,
      notes: cell.notes,
    });
  }
  return changes;
}

const VALUE_LABEL: Record<string, string> = { yes: 'yes', partial: 'partial', no: 'no', unknown: 'unknown' };

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

export function renderChangesMarkdown(file: ChangesFile, agents: Agent[], capabilities: Capability[]): string {
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const capName = new Map(capabilities.map((c) => [c.id, c.name]));
  const lines: string[] = [];
  const n = file.changes.length;
  lines.push(`## Weekly re-verification: ${n} change${n === 1 ? '' : 's'}`);
  lines.push('');
  lines.push(`Run: ${file.run_at} · Model: \`${file.model}\` · Agents checked: ${file.stats.agents_checked} · Cells verified: ${file.stats.cells_verified}/${file.stats.cells_total} · Unknown: ${file.stats.cells_unknown}`);
  if (file.stats.agents_failed.length > 0) {
    lines.push('');
    lines.push(`Agents that could not be checked this run (previous values kept): ${file.stats.agents_failed.map((a) => agentName.get(a) ?? a).join(', ')}`);
  }
  lines.push('');
  if (n === 0) {
    lines.push('No capability values changed. Verification dates were refreshed.');
    return lines.join('\n') + '\n';
  }
  lines.push('| Agent | Capability | Change | Evidence |');
  lines.push('|---|---|---|---|');
  for (const ch of file.changes) {
    const change = `${VALUE_LABEL[ch.from]} → **${VALUE_LABEL[ch.to]}**`;
    const evidence = ch.evidence_url ? `[source](${ch.evidence_url})${ch.quote ? ` — “${escapeMd(ch.quote.slice(0, 160))}${ch.quote.length > 160 ? '…' : ''}”` : ''}` : '—';
    lines.push(`| ${agentName.get(ch.agent) ?? ch.agent} | ${capName.get(ch.capability) ?? ch.capability} | ${change} | ${evidence} |`);
  }
  lines.push('');
  lines.push('Review each row against its source before merging. A wrong cell is worse than a stale one.');
  return lines.join('\n') + '\n';
}
