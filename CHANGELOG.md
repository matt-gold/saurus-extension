# Changelog

## 0.4.1

### Patch Changes

- 4c378e0: Refactor the extension into clearer modules with explicit boundaries and provider abstractions.

  This change moves core runtime pieces into structured `app`, `commands`, `core`, `services`, `state`, and `ui` modules, adds clearer public module surfaces, and splits private implementation files into `internal/` directories.

  It also refactors AI and thesaurus integrations so provider-specific behavior lives in provider implementations (including CLI command construction and model discovery metadata), fixes the AI schema path used by the extension activation flow, and simplifies AI loading UI in the suggestion menu to show a single loading spinner state.

## 0.4.0

### Minor Changes

- d501d16: Add `Saurus: Configure AI Model`, a provider-aware model picker that supports Copilot Chat discovery and provider-specific CLI model lists/fallbacks for Copilot CLI, Claude CLI, and Codex CLI. Includes a provider-default option, manual model entry, and safe rollback if updating `saurus.ai.model` fails.

### Patch Changes

- 1293853: Fix several popover reliability issues (including auto-wrap placeholder entry and loading-state refresh behavior) and improve AI/thesaurus caching so results are reused more consistently.

## 0.3.0

### Minor Changes

- cca024a: Stabilize the Saurus popover refresh behavior (including cursor-entry flow) and add setup commands for configuring thesaurus and AI providers. Also adds a first-class "suggest selected text with prompt" command/hotkey.

## 0.2.0

### Minor Changes

- 857c893: Make Copilot Chat the default AI provider for Saurus.

  - Add native VS Code Language Model API support via `copilotChat` (no external CLI required)
  - Keep existing CLI providers (`copilot`, `codex`, `claude`) available
  - Use consent-aware behavior for background auto-trigger
  - Update provider settings/docs and UI provider labels for native vs CLI paths

## 0.1.3

### Patch Changes

- f1381a4: Improve README onboarding and documentation clarity:

  - Promote keyboard-driven workflows near the top
  - Clarify supported file types and provider setup paths
  - Simplify feature descriptions and move CI/CD docs to the end

## [0.1.2](https://github.com/matt-gold/saurus/compare/saurus-extension-v0.1.1...saurus-extension-v0.1.2) (2026-02-18)

### Bug Fixes

- trigger release please ([1a6b6d4](https://github.com/matt-gold/saurus/commit/1a6b6d4c746c2371096117671eaa0ec5f8886db5))

## [0.1.1](https://github.com/matt-gold/saurus/compare/saurus-extension-v0.1.0...saurus-extension-v0.1.1) (2026-02-18)

### Bug Fixes

- enforce ci before release ([d607a84](https://github.com/matt-gold/saurus/commit/d607a845bdd31da8b2f19f1d657b14104b38ce51))
- enforce ci before release ([bb5e1db](https://github.com/matt-gold/saurus/commit/bb5e1db3beccf960315a18258683e047d0e92d24))
- trigger release please ([2331c71](https://github.com/matt-gold/saurus/commit/2331c714e78cf411c726c03f0ca04a644842cce0))
- trigger release please ([be45b62](https://github.com/matt-gold/saurus/commit/be45b62ef0c3edf2eff8e580942b81610b3bece6))
- wf change ([176ec55](https://github.com/matt-gold/saurus/commit/176ec552f371da0b08a4970249b9c15cccdeaaa3))
