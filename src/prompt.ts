import type { Agent, CapabilitiesFile } from './types.js';

/**
 * The system prompt is deliberately stable across agents and runs so it is served from the
 * prompt cache: it contains only the rubric and the output contract. Everything that varies
 * (agent metadata, fetched documentation) goes in the user message.
 */
export function buildSystemPrompt(caps: CapabilitiesFile): string {
  const lines: string[] = [];
  lines.push('You maintain AgentMatrix, a public, cited feature matrix of AI coding agent CLIs. You will receive the official documentation of ONE agent and must decide, for every capability below, whether the agent supports it, using only that documentation.');
  lines.push('');
  lines.push('Value definitions:');
  for (const [k, v] of Object.entries(caps.values)) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push('Capabilities (id, name, question, rubric):');
  for (const c of caps.capabilities) {
    lines.push(`- ${c.id} — ${c.name}. ${c.question} Rubric: ${c.rubric}`);
  }
  lines.push('');
  lines.push('Output contract:');
  lines.push('- Return exactly one entry per capability id listed above, in that order.');
  lines.push('- quote: a verbatim excerpt of 12 to 400 characters copied character for character from the provided documentation text that justifies the value. One contiguous excerpt, no internal ellipsis, no paraphrase. The excerpt will be checked mechanically against the source; a quote that does not appear in the source turns the cell into "unknown".');
  lines.push('- evidence_url: the URL of the source section (given as "=== SOURCE: <url> ===") that contains the quote. Use only URLs that appear in the provided documentation.');
  lines.push('- For value "no": quote text showing the limitation if the documentation states one; if the capability is simply absent, only answer "no" when the documentation clearly covers that area (for example a full command or configuration reference) and does not mention it, and quote the section heading or nearest relevant sentence as evidence. Otherwise answer "unknown" with an empty quote and empty evidence_url.');
  lines.push('- For value "unknown": empty quote and empty evidence_url.');
  lines.push('- notes: one or two sentences naming the concrete feature, flag, command, or file, plus any caveat. For project_instructions, name the file. Never empty for yes or partial.');
  lines.push('- confidence: high for an explicit statement, medium when some interpretation was needed, low for weak evidence.');
  lines.push('- Prefer "partial" with a precise note over an optimistic "yes". A wrong "yes" is the worst outcome.');
  lines.push('- Do not use knowledge from memory or from other agents; only the documentation provided in this request counts.');
  return lines.join('\n');
}

export interface SourceText {
  url: string;
  text: string;
  truncated: boolean;
}

export function buildUserPrompt(agent: Agent, sources: SourceText[]): string {
  const parts: string[] = [];
  parts.push(`Agent under review: ${agent.name} (id: ${agent.id}) by ${agent.vendor}. Homepage: ${agent.homepage}. Repository: ${agent.repo ?? 'none (closed source)'}.`);
  parts.push('');
  parts.push('Official documentation follows. Each source begins with a line "=== SOURCE: <url> ===".');
  parts.push('');
  for (const s of sources) {
    parts.push(`=== SOURCE: ${s.url} ===`);
    parts.push(s.text);
    if (s.truncated) parts.push('[source truncated]');
    parts.push('');
  }
  parts.push('Decide every capability for this agent according to the rubric and the output contract. Return the structured result.');
  return parts.join('\n');
}
