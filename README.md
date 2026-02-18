# Saurus

`Saurus` is an AI-second writing tool designed to keep you in the flow.

It detects placeholders (default `{{...}}`) and shows replacement options in the native completion popover at the cursor. It prioritizes thesaurus results first, keeps AI as opt-in or configurable auto-run, and is designed to avoid slop by targeting single words or short phrases.

It is easy to lose your voice in AI slop with other writing tools. Saurus is designed to keep you honest and in the flow.

## Features

- Configurable placeholder delimiters (default `{{` and `}}`)
- Top heading row to exit and remove placeholder braces (`🦖  (Select a replacement)`)
- Thesaurus suggestions (Merriam-Webster) shown first and cached per placeholder context (`📖`)
- AI suggestions are optional (on-demand by default, auto-run configurable)
- AI suggestions are prefixed with `✨`
- Built for single words and short phrases to avoid generic long-form AI rewrites
- Auto-trigger when cursor enters a placeholder
- Manual commands for generate and novelty refresh
- In-popover actions: `↻ Generate more` and `↻ Generate w/ prompt`
- Workspace-configurable prompt template
- Cache with force refresh that avoids previously shown options
- Optional persistent cache across VS Code reloads with TTL pruning
- Color-coded placeholder highlighting in the editor

## Requirements

- VS Code 1.92+
- Node.js 20+
- An AI CLI provider installed (`codex`, `copilot`, or `claude`)
- AI CLI provider configured in `saurus.ai.provider` (optional overrides: `saurus.ai.path`, `saurus.ai.model`)
- Merriam-Webster Thesaurus API key (`saurus.thesaurus.apiKey`)

Check login (Codex provider):

```bash
codex login status
```

If needed (Codex provider):

```bash
codex login
```

Check login (Copilot via `gh` provider path):

```bash
gh auth status
```

Check Claude CLI:

```bash
claude --version
```

If Claude asks you to sign in, run `claude` once and complete the flow, or set `ANTHROPIC_API_KEY`.

## Development Setup

```bash
cd /Users/mattgold/Code/saurus-extension
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

## Packaging

```bash
npm run package
```

This produces a `.vsix` you can install locally.

## Usage

1. Open a Markdown or plaintext file.
2. Put cursor inside a placeholder, for example: `The bell felt {{mood}}.`
3. Wait for auto suggestions or run command `Saurus: Generate Placeholder Suggestions`.
4. Pick a replacement from the completion list, or use `🦖  (Select a replacement)` / `Esc` to exit and remove delimiters.
5. Thesaurus suggestions appear first and are always cached.
6. AI suggestions either auto-run (`saurus.ai.autoGenerateOnOpen: true`) or run on demand via `↻ Generate more`.
7. To force additional AI options, choose `↻ Generate more`.
8. To run a one-off directed generation, choose `↻ Generate w/ prompt` and enter a short instruction.
9. Use `saurus.activation.modeOnEnter` to choose default entry mode (`hybrid`, `ai`, or `thesaurus`) when cursor enters/clicks a placeholder.

Selected-text workflow:

1. Select text you want alternatives for.
2. Press `cmd+shift+s` (macOS) or `ctrl+shift+s` (Windows/Linux).
3. Saurus wraps the selection in configured delimiters and opens the autocomplete popover.
4. Pick a replacement from the popover, or choose `↻ Generate more` to append more suggestions.
5. Inside a placeholder, press `cmd+shift+a` / `ctrl+shift+a` for AI-only view, or `cmd+shift+z` / `ctrl+shift+z` for thesaurus-only view.

## Commands

- `Saurus: Generate Placeholder Suggestions` (`saurus.generateSuggestions`)
- `Saurus: Suggest For Selected Text` (`saurus.suggestForSelection`)
- `Saurus: Get More AI Options` (`saurus.refreshSuggestions`)
- `Saurus: Generate With Prompt` (`saurus.refreshSuggestionsWithPrompt`)
- `Saurus: Show AI Suggestions Only` (`saurus.showAiOnlySuggestions`)
- `Saurus: Show Thesaurus Suggestions Only` (`saurus.showThesaurusOnlySuggestions`)
- `Saurus: Exit Placeholder Suggestions` (`saurus.exitPlaceholderSuggestions`)
- `Saurus: Clear Persistent Cache` (`saurus.clearPersistentCache`)
- `Saurus: Disable Auto Trigger (Workspace)` (`saurus.disableAutoTriggerForWorkspace`)

## Settings

All settings are under `saurus.*`.

- `saurus.enabled`
- `saurus.languages`
- `saurus.delimiters.open`
- `saurus.delimiters.close`
- `saurus.thesaurus.enabled`
- `saurus.thesaurus.provider`
- `saurus.thesaurus.apiKey`
- `saurus.thesaurus.timeoutMs`
- `saurus.thesaurus.maxSuggestions` (default `20`)
- `saurus.ai.autoGenerateOnOpen`
- `saurus.ai.provider` (`codex` | `copilot` | `claude`)
- `saurus.ai.path` (optional; defaults by provider: `codex`, `gh`, `claude`)
- `saurus.ai.model` (optional)
- `saurus.ai.reasoningEffort`
- `saurus.ai.timeoutMs`
- `saurus.menu.thesaurusPrefix`
- `saurus.menu.aiPrefix`
- `saurus.cache.persistAcrossReload`
- `saurus.cache.persistTtlDays`
- `saurus.placeholderHighlight.enabled`
- `saurus.placeholderHighlight.backgroundColor`
- `saurus.placeholderHighlight.borderColor`
- `saurus.placeholderHighlight.delimiterColor`
- `saurus.placeholderHighlight.textColor`
- `saurus.prompt.template`
- `saurus.activation.modeOnEnter` (`hybrid` | `ai` | `thesaurus`, default `hybrid`)
- `saurus.suggestions.count`
- `saurus.autoTrigger.onCursorEnter`
- `saurus.autoTrigger.debounceMs`
- `saurus.context.charsBefore`
- `saurus.context.charsAfter`
- `saurus.codex.path` (deprecated alias of `saurus.ai.path`)
- `saurus.codex.model` (deprecated alias of `saurus.ai.model`)
- `saurus.codex.reasoningEffort` (deprecated alias of `saurus.ai.reasoningEffort`)
- `saurus.codex.timeoutMs` (deprecated alias of `saurus.ai.timeoutMs`)

Example workspace settings:

```json
{
  "saurus.delimiters.open": "[[",
  "saurus.delimiters.close": "]]",
  "saurus.thesaurus.enabled": true,
  "saurus.thesaurus.provider": "merriamWebster",
  "saurus.thesaurus.apiKey": "YOUR_MW_API_KEY",
  "saurus.thesaurus.timeoutMs": 10000,
  "saurus.thesaurus.maxSuggestions": 20,
  "saurus.ai.autoGenerateOnOpen": false,
  "saurus.ai.provider": "codex",
  "saurus.ai.path": "codex",
  "saurus.ai.model": "gpt-5.3-codex",
  "saurus.ai.reasoningEffort": "low",
  "saurus.ai.timeoutMs": 20000,
  "saurus.activation.modeOnEnter": "hybrid",
  "saurus.menu.thesaurusPrefix": "📖",
  "saurus.menu.aiPrefix": "✨",
  "saurus.cache.persistAcrossReload": false,
  "saurus.cache.persistTtlDays": 7,
  "saurus.suggestions.count": 10,
  "saurus.prompt.template": "Give ${suggestionCount} literary replacements for ${placeholder}. Context: ${contextBefore} || ${contextAfter}. Avoid: ${avoidSuggestions}. Return JSON {\"suggestions\":[\"...\"]}."
}
```

Claude provider example:

```json
{
  "saurus.ai.provider": "claude",
  "saurus.ai.path": "claude",
  "saurus.ai.model": "sonnet"
}
```

## Prompt Variables

- `${placeholder}`
- `${contextBefore}`
- `${contextAfter}`
- `${suggestionCount}`
- `${avoidSuggestions}`
- `${direction}`
- `${fileName}`
- `${languageId}`

## Troubleshooting

- `AI CLI was not found`: set `saurus.ai.path` or install the selected provider CLI.
- `AI CLI is not logged in`: log in for your selected provider (Codex: `codex login`; Copilot via `gh`: `gh auth login`; Claude: run `claude` and complete login or set `ANTHROPIC_API_KEY`).
- `Merriam-Webster thesaurus API key is missing`: set `saurus.thesaurus.apiKey`.
- No new results on refresh: adjust prompt template or context window.

## Performance Tips

- Keep `saurus.ai.reasoningEffort` at `low` for faster responses.
- Lower `saurus.suggestions.count` if latency is high (default is `10`).
- Reduce `saurus.context.charsBefore` / `saurus.context.charsAfter` if latency is high.
