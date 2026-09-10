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

/** Escapes text for a markdown table cell inside a PR or issue body: no pipes, no line breaks, no HTML, no @-mentions or #refs rendered as links. */
export function escapeMd(s: string): string {
  // Order matters: '&' and '#' are escaped first because the entities inserted afterwards contain them.
  return s
    .replace(/&/g, '&amp;')
    .replace(/#/g, '&#35;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/@/g, '&#64;')
    .replace(/`/g, '&#96;')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function shorten(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export function renderChangesMarkdown(file: ChangesFile, agents: Agent[], capabilities: Capability[], fetchErrors: string[] = []): string {
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const capName = new Map(capabilities.map((c) => [c.id, c.name]));
  const lines: string[] = [];
  const n = file.changes.length;
  lines.push(`## Weekly re-verification: ${n} value change${n === 1 ? '' : 's'}`);
  lines.push('');
  lines.push(`Run: ${file.run_at} · Method: ${escapeMd(file.model)} · Agents checked: ${file.stats.agents_checked} · Cells verified: ${file.stats.cells_verified}/${file.stats.cells_total} · Unknown: ${file.stats.cells_unknown}`);
  if (file.stats.agents_failed.length > 0) {
    lines.push('');
    lines.push(`Agents that could not be checked this run (previous values kept): ${file.stats.agents_failed.map((a) => escapeMd(agentName.get(a) ?? a)).join(', ')}`);
  }
  if (fetchErrors.length > 0) {
    lines.push('');
    lines.push(`Pages that could not be fetched this run (cells left untouched, ${fetchErrors.length}):`);
    for (const e of fetchErrors.slice(0, 30)) lines.push(`- ${escapeMd(e)}`);
    if (fetchErrors.length > 30) lines.push(`- …and ${fetchErrors.length - 30} more`);
  }
  lines.push('');
  if (n === 0) {
    lines.push('No capability values changed. Verification dates were refreshed.');
    return lines.join('\n') + '\n';
  }
  lines.push('| Agent | Capability | Change | Evidence |');
  lines.push('|---|---|---|---|');
  for (const ch of file.changes) {
    const change = `${ch.from} → **${ch.to}**`;
    const evidence = ch.evidence_url
      ? `[source](${ch.evidence_url})${ch.quote ? ` — <code>${escapeMd(shorten(ch.quote, 160))}</code>` : ''}`
      : ch.notes
        ? `<code>${escapeMd(shorten(ch.notes, 220))}</code>`
        : '—';
    lines.push(`| ${escapeMd(agentName.get(ch.agent) ?? ch.agent)} | ${escapeMd(capName.get(ch.capability) ?? ch.capability)} | ${change} | ${evidence} |`);
  }
  lines.push('');
  lines.push('Review each row against its source before merging. A wrong cell is worse than a stale one. Cells demoted to unknown keep their previous quote and URL in the notes; restore them with a current quote, or leave them unknown.');
  return lines.join('\n') + '\n';
}
