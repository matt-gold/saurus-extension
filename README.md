# Saurus Extension

`Saurus Extension` adds placeholder replacement suggestions for prose writing in VS Code.

It detects placeholders (default `{{...}}`) and shows replacement options in the native completion popover at the cursor. Suggestions are generated through local `codex` CLI using your existing Codex/ChatGPT login.

## Features

- Configurable placeholder delimiters (default `{{` and `}}`)
- Thesaurus suggestions (Merriam-Webster) shown first and cached per placeholder context
- AI suggestions via Codex, optionally auto-run or on-demand
- Grouped source labeling in the completion UI (`📚 Thesaurus`, `🤖 AI`)
- Auto-trigger when cursor enters a placeholder
- Manual commands for generate and novelty refresh
- In-popover action: `↻ Generate/Get more AI options`
- Workspace-configurable prompt template
- Cache with force refresh that avoids previously shown options
- Color-coded placeholder highlighting in the editor

## Requirements

- VS Code 1.92+
- Node.js 20+
- Codex CLI installed and available on PATH (or configure `saurus.codex.path`)
- Logged-in Codex CLI session
- Merriam-Webster Thesaurus API key (`saurus.thesaurus.apiKey`)

Check login:

```bash
codex login status
```

If needed:

```bash
codex login
```

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
4. Pick a replacement from the grouped completion list.
5. Thesaurus suggestions appear first and are always cached.
6. AI suggestions either auto-run (`saurus.ai.autoRun: true`) or run on demand via `↻ Generate AI options`.
7. To force additional AI options, choose `↻ Get more AI options`.

Selected-text workflow:

1. Select text you want alternatives for.
2. Press `cmd+shift+s` (macOS) or `ctrl+shift+s` (Windows/Linux).
3. Saurus wraps the selection in configured delimiters and opens the autocomplete popover.
4. Pick a replacement from the popover, or choose `↻ Generate/Get more AI options` to append more suggestions.

## Commands

- `Saurus: Generate Placeholder Suggestions` (`saurus.generateSuggestions`)
- `Saurus: Suggest For Selected Text` (`saurus.suggestForSelection`)
- `Saurus: Get More AI Options` (`saurus.refreshSuggestions`)
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
- `saurus.ai.autoRun`
- `saurus.placeholderHighlight.enabled`
- `saurus.placeholderHighlight.backgroundColor`
- `saurus.placeholderHighlight.borderColor`
- `saurus.placeholderHighlight.delimiterColor`
- `saurus.placeholderHighlight.textColor`
- `saurus.prompt.template`
- `saurus.suggestions.count`
- `saurus.autoTrigger.onCursorEnter`
- `saurus.autoTrigger.debounceMs`
- `saurus.context.charsBefore`
- `saurus.context.charsAfter`
- `saurus.codex.path`
- `saurus.codex.model` (default `gpt-5.3-codex`)
- `saurus.codex.reasoningEffort` (default `low`)
- `saurus.codex.timeoutMs`

Example workspace settings:

```json
{
  "saurus.delimiters.open": "[[",
  "saurus.delimiters.close": "]]",
  "saurus.thesaurus.enabled": true,
  "saurus.thesaurus.provider": "merriamWebster",
  "saurus.thesaurus.apiKey": "YOUR_MW_API_KEY",
  "saurus.thesaurus.timeoutMs": 10000,
  "saurus.ai.autoRun": false,
  "saurus.suggestions.count": 10,
  "saurus.codex.model": "gpt-5.3-codex",
  "saurus.codex.reasoningEffort": "low",
  "saurus.prompt.template": "Give ${suggestionCount} literary replacements for ${placeholder}. Context: ${contextBefore} || ${contextAfter}. Avoid: ${avoidSuggestions}. Return JSON {\"suggestions\":[\"...\"]}."
}
```

## Prompt Variables

- `${placeholder}`
- `${contextBefore}`
- `${contextAfter}`
- `${suggestionCount}`
- `${avoidSuggestions}`
- `${fileName}`
- `${languageId}`

## Troubleshooting

- `Codex CLI was not found`: set `saurus.codex.path` or install Codex CLI.
- `Codex CLI is not logged in`: run `codex login`.
- `Merriam-Webster thesaurus API key is missing`: set `saurus.thesaurus.apiKey`.
- No new results on refresh: adjust prompt template or context window.

## Performance Tips

- Keep `saurus.codex.reasoningEffort` at `low` (fastest reliable option on `gpt-5.3-codex`).
- Lower `saurus.suggestions.count` if latency is high (default is `10`).
- Reduce `saurus.context.charsBefore` / `saurus.context.charsAfter` if latency is high.
