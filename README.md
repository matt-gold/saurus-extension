# Saurus Extension

`Saurus Extension` adds placeholder replacement suggestions for prose writing in VS Code.

It detects placeholders (default `{{...}}`) and shows replacement options in the native completion popover at the cursor. Suggestions are generated through local `codex` CLI using your existing Codex/ChatGPT login.

## Features

- Configurable placeholder delimiters (default `{{` and `}}`)
- Multiple replacement options in the normal completion UI
- Auto-trigger when cursor enters a placeholder
- Manual commands for generate and novelty refresh
- In-popover action: `↻ Get different options`
- Workspace-configurable prompt template
- Cache with force refresh that avoids previously shown options
- Color-coded placeholder highlighting in the editor

## Requirements

- VS Code 1.92+
- Node.js 20+
- Codex CLI installed and available on PATH (or configure `saurus.codex.path`)
- Logged-in Codex CLI session

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
4. Pick a replacement from the completion list.
5. To force new options, choose `↻ Get different options`.

Selected-text workflow:

1. Select text you want alternatives for.
2. Press `cmd+shift+s` (macOS) or `ctrl+shift+s` (Windows/Linux).
3. Saurus wraps the selection in configured delimiters and opens the autocomplete popover.
4. Pick a replacement from the popover, or choose `↻ Get different options` to append more suggestions.

## Commands

- `Saurus: Generate Placeholder Suggestions` (`saurus.generateSuggestions`)
- `Saurus: Suggest For Selected Text` (`saurus.suggestForSelection`)
- `Saurus: Get Different Placeholder Options` (`saurus.refreshSuggestions`)
- `Saurus: Disable Auto Trigger (Workspace)` (`saurus.disableAutoTriggerForWorkspace`)

## Settings

All settings are under `saurus.*`.

- `saurus.enabled`
- `saurus.languages`
- `saurus.delimiters.open`
- `saurus.delimiters.close`
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
  "saurus.placeholderHighlight.backgroundColor": "rgba(56, 189, 248, 0.12)",
  "saurus.placeholderHighlight.delimiterColor": "#0369a1",
  "saurus.placeholderHighlight.textColor": "#0c4a6e",
  "saurus.suggestions.count": 6,
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
- No new results on refresh: adjust prompt template or context window.

## Performance Tips

- Keep `saurus.codex.reasoningEffort` at `low` (fastest reliable option on `gpt-5.3-codex`).
- Lower `saurus.suggestions.count` if latency is high (default is `10`).
- Reduce `saurus.context.charsBefore` / `saurus.context.charsAfter` if latency is high.
