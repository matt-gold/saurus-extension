---
"saurus-extension": patch
---

Refactor the extension into clearer modules with explicit boundaries and provider abstractions.

This change moves core runtime pieces into structured `app`, `commands`, `core`, `services`, `state`, and `ui` modules, adds clearer public module surfaces, and splits private implementation files into `internal/` directories.

It also refactors AI and thesaurus integrations so provider-specific behavior lives in provider implementations (including CLI command construction and model discovery metadata), fixes the AI schema path used by the extension activation flow, and simplifies AI loading UI in the suggestion menu to show a single loading spinner state.
