# Contributing

Thanks for helping keep the matrix honest. The rules are simple: every non-unknown cell needs a verbatim quote from official documentation, and CI checks that the quote really exists at the URL.

## Data files

### `data/agents.json`

```json
{
  "id": "aider",
  "name": "Aider",
  "vendor": "Aider AI",
  "homepage": "https://aider.chat",
  "repo": "https://github.com/Aider-AI/aider",
  "sources": [
    "https://aider.chat/docs/usage.html",
    "https://raw.githubusercontent.com/Aider-AI/aider/main/HISTORY.md"
  ]
}
```

- `id`: lowercase, dashes only. Used in `matrix.json`.
- `sources`: the documentation pages the weekly pipeline fetches for this agent. Prefer URLs whose text is available to a plain HTTP request: raw markdown on GitHub (`raw.githubusercontent.com/...`) or static documentation pages. GitHub `blob` URLs are rewritten to raw automatically. Include the changelog or release notes so new features are picked up.
- `repo`: `null` for closed-source products.

### `data/capabilities.json`

Each capability has a `question` (what is being asked) and a `rubric` (how to decide yes / partial / no). Rubrics must be decidable from documentation alone. If you find two reasonable people would disagree about a cell, the fix is usually a sharper rubric, not a longer argument.

### `data/matrix.json`

One entry per agent × capability:

```json
{
  "agent": "aider",
  "capability": "local_models",
  "value": "yes",
  "quote": "Aider can connect to local Ollama models.",
  "evidence_url": "https://aider.chat/docs/llms/ollama.html",
  "notes": "Documented Ollama setup; also supports any OpenAI-compatible endpoint.",
  "confidence": "high",
  "verified": true,
  "verified_at": "2026-09-10"
}
```

- `quote`: 12 to 400 characters, one contiguous excerpt, copied exactly. Smart quotes, markdown emphasis and whitespace differences are tolerated; different wording is not.
- `evidence_url`: the page that contains the quote. Fragments (`#section`) are fine.
- `value: "unknown"` cells have an empty quote and `verified: false`.
- Leave `verified` and `verified_at` alone; `npm run check -- --fix` sets them.

## Workflow

```bash
npm install
# edit data/*.json
npm run check            # every quote must be found at its URL
npm run build            # regenerate README tables and docs/
npm test
```

Commit the regenerated `README.md` and `docs/` together with your data change; CI fails if they are out of sync.

## The weekly run

The `weekly` workflow re-fetches every evidence URL and searches for every quote. When all quotes are still present it commits the refreshed verification dates directly. When a quote has disappeared it demotes the cell to *unknown*, keeps the old quote, URL and value in the notes, and opens both a pull request and an issue labelled `needs-recheck`. Fixing such a cell is a good first contribution: find the current wording in the docs (or confirm the feature is gone), update the cell, run `npm run check`, and open a pull request.

If the repository has an `ANTHROPIC_API_KEY` secret, the same workflow re-derives every cell with Claude instead and opens a pull request titled *matrix: weekly re-verification*. Review each row in the description against its source. Merging is a human decision; if a change looks wrong, fix the rubric or the source list in the same PR so the next run agrees with you.

Pull requests opened by the workflow do not trigger the CI workflow (GitHub does not run workflows for changes made with the default token), which is why the weekly workflow runs the typecheck, tests and build itself before opening one.

## Scope

- CLI and terminal agents only. IDE-only products are out of scope; IDE-only capabilities of a CLI product are *partial* with a note.
- Official documentation only as evidence: vendor docs sites, the official repository (README, docs folder, changelog) and official release notes. No blog posts, no third-party comparisons.
