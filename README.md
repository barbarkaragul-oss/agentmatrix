<h1 align="center">AgentMatrix</h1>

<p align="center"><b>Which AI coding agent supports what?</b><br>Every cell quotes the official documentation. Claude re-reads the docs every week and opens a pull request when something changed.</p>

<p align="center">
  <a href="https://OWNER.github.io/agentmatrix/">Interactive matrix</a> ·
  <a href="docs/matrix.json">Raw JSON</a> ·
  <a href="#contributing">Add an agent</a> ·
  <a href="#how-it-works">How it works</a>
</p>

<p align="center">
  <a href="https://github.com/OWNER/agentmatrix/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/OWNER/agentmatrix/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/OWNER/agentmatrix/actions/workflows/weekly.yml"><img alt="Weekly verification" src="https://github.com/OWNER/agentmatrix/actions/workflows/weekly.yml/badge.svg"></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg">
</p>

<!-- stats:start -->
**10 agents × 32 capabilities · 0/0 cells verified against their source · last verification never** · ✅ 0 · 🟡 0 · ❌ 0 · ❔ 0
<!-- stats:end -->

Comparison posts about coding agents go stale the week they are published. Claude Code, Codex CLI, Gemini CLI, Cursor, Copilot CLI, OpenCode, Cline, Aider, Goose and Amp ship features every few days, and "does X support Y?" usually gets answered from memory. This repository answers it from the docs:

- **Every cell is a quote.** Hover a cell to read the sentence from the vendor's documentation that justifies it; click to open the source.
- **Nothing is taken on faith.** A cell is only shown as yes, partial or no if its quote was found, character for character, at the linked URL. If the quote cannot be found, the cell becomes *unknown* until a human or the weekly run fixes it.
- **It updates itself.** A GitHub Action re-fetches the documentation weekly, asks Claude to re-decide every cell against a fixed rubric, re-checks every quote mechanically, and opens a pull request listing exactly what changed and why.

## The matrix

<!-- matrix:start -->
Legend: ✅ yes · 🟡 partial · ❌ no · ❔ unknown. Hover a cell for the quote, click it for the source.

### Extensibility

| Capability | Claude Code | Codex CLI | Gemini CLI | Cursor CLI | GitHub Copilot CLI | Cline | OpenCode | Goose | Aider | Amp |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **MCP client** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Acts as MCP server** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Lifecycle hooks** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Custom slash commands** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Agent Skills** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Plugin system** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Subagents** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Project instruction file** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **AGENTS.md support** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |

### Control and safety

| Capability | Claude Code | Codex CLI | Gemini CLI | Cursor CLI | GitHub Copilot CLI | Cline | OpenCode | Goose | Aider | Amp |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Permission modes** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Built-in sandbox** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Checkpoints and rewind** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Plan mode** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Full-auto mode** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |

### Sessions and automation

| Capability | Claude Code | Codex CLI | Gemini CLI | Cursor CLI | GitHub Copilot CLI | Cline | OpenCode | Goose | Aider | Amp |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Resume sessions** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Headless and CI mode** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Background tasks** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Parallel agents** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |

### Models

| Capability | Claude Code | Codex CLI | Gemini CLI | Cursor CLI | GitHub Copilot CLI | Cline | OpenCode | Goose | Aider | Amp |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Model selection** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Custom providers and BYOK** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Local models** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Reasoning control** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Token and cost display** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |

### Input and output

| Capability | Claude Code | Codex CLI | Gemini CLI | Cursor CLI | GitHub Copilot CLI | Cline | OpenCode | Goose | Aider | Amp |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Image input** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Built-in web search** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Built-in URL fetch** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Official IDE integration** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Git and PR workflow** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Persistent memory** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |

### Platform

| Capability | Claude Code | Codex CLI | Gemini CLI | Cursor CLI | GitHub Copilot CLI | Cline | OpenCode | Goose | Aider | Amp |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Native Windows** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Open source** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| **Free tier** | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
<!-- matrix:end -->

Values follow a written rubric per capability (see [`data/capabilities.json`](data/capabilities.json)). *Partial* means documented but limited: experimental, one platform only, or only reachable through an add-on such as an MCP server. When in doubt the matrix says *partial* or *unknown*, never an optimistic *yes*.

## Recent changes

<!-- changes:start -->
_No value changes in the last verification run._
<!-- changes:end -->

## How it works

```
data/agents.json ──┐
data/capabilities.json ──┤
                         ▼
   1. fetch every documentation source for one agent (raw markdown or page text)
   2. Claude (claude-fable-5-1) reads all of it in one request and returns one JSON entry per
      capability: value + verbatim quote + source URL + notes, constrained by a JSON schema
   3. every quote is searched for in the fetched text; a quote that is not found demotes the
      cell to "unknown" (the model cannot invent evidence that survives this step)
   4. the new matrix is diffed against the previous one → data/matrix.json + data/changes.json
   5. README tables and the static site are regenerated → a pull request is opened for review
```

Design choices worth knowing:

- **One request per agent, whole docs in context.** No chunking or retrieval, so the model can reconcile statements that live on different pages (a feature announced in the changelog but marked experimental in the reference).
- **The rubric is the contract.** Model and humans decide cells by the same written rules, so a disagreement is a rubric bug, not a matter of taste.
- **Mechanical verification is the safety net.** `npm run check` needs no API key and works on hand-written data too, which is how contributions are validated in CI.
- **Humans merge.** The weekly run only opens a pull request. Maintainers review each changed row against its source before it lands.

## Run it locally

```bash
git clone https://github.com/OWNER/agentmatrix && cd agentmatrix
npm install
npm test                       # unit tests
npm run check                  # verify every quote against its source (network, no API key)
npm run build                  # regenerate README tables and docs/ from data/
```

To run the Claude pipeline yourself:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run verify -- --agent aider   # one agent
npm run verify                    # all agents, then: npm run build
```

`verify` accepts `--model <id>` (default `claude-fable-5-1`, also read from `AGENTMATRIX_MODEL`), `--effort low|medium|high|xhigh|max`, and `--dry-run` to only fetch the sources and report their size.

## Contributing

- **Add an agent:** append it to [`data/agents.json`](data/agents.json) with the documentation URLs the pipeline should read (prefer raw markdown on GitHub or static docs pages), run `npm run verify -- --agent <id>` if you have an API key, or fill the cells by hand in `data/matrix.json`, then `npm run check` and `npm run build`.
- **Fix a cell:** edit its `value`, `quote`, `evidence_url` and `notes` in `data/matrix.json`. The quote must appear verbatim on the page. CI runs `npm run check` on every pull request.
- **Add a capability:** append it to `data/capabilities.json` with a question and an unambiguous rubric, then run `npm run verify` (or open the PR with the capability alone and let the weekly run fill it).
- **Report a wrong cell:** [open an issue](https://github.com/OWNER/agentmatrix/issues/new?template=wrong-cell.yml) with a link to the docs.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the data format.

## FAQ

**Why is a cell "unknown" when I know the feature exists?** Either the documentation the pipeline reads does not state it, or the quote could not be verified at the URL. Send a PR with the doc link; that is exactly what the check is for.

**Does it cover IDE features?** The matrix is about the CLI or terminal agent. Where a capability only exists in the vendor's IDE extension, the rubric says *partial* and the notes say so.

**Which model, and what does a weekly run cost?** `claude-fable-5-1` by default, one request per agent with the documentation in context and prompt caching for the rubric. The exact spend is printed at the end of each run; any Claude model can be substituted with `--model`.

**Is the model allowed to disagree with a human edit?** Yes, and the diff will show it with the model's quote next to it. The pull request is the place to settle it, and the rubric is the referee.

## License

MIT. Documentation quotes belong to their respective vendors and are reproduced as short excerpts for the purpose of citation.
