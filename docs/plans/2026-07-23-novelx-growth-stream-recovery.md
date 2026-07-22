# NovelX Growth Stream Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to execute this plan task by task.

**Goal:** Make transient upstream response-stream interruption recover automatically inside NovelX Growth without changing ordinary OpenCode session retry semantics, then resume the interrupted live Growth run from its existing compaction task.

**Architecture:** Add an explicit `novelx-growth` retry scope to the existing Session processor. The scope is selected from authoritative NovelX Growth Agent identities at both normal generation and compaction call sites. Only a bounded allowlist of transport interruption messages is added for that scope. Optional workspace resource directories resolve to no path when absent so the renderer does not issue invalid filesystem requests.

**Tech Stack:** TypeScript, Effect, Bun tests, SolidJS, Electron.

## Task 1: Lock the failure into tests

- Add retry classification coverage proving the exact plain upstream interruption remains non-retryable by default and becomes retryable only under the NovelX Growth scope.
- Add resource-path coverage proving a missing `Story`/`Stories` directory resolves to no mountable path.

## Task 2: Implement the Growth-only retry boundary

- Add one authoritative NovelX Growth Agent identity predicate.
- Extend the Session retry policy and processor input with an explicit retry scope.
- Pass the scope from normal prompt generation and compaction using the actual Agent identity, never the session title.
- Keep ordinary OpenCode sessions unchanged.

## Task 3: Prevent invalid optional-directory requests

- Resolve `Stories` and legacy `Story` only when they exist.
- Render the existing empty state rather than mounting `FileTree` for a missing optional resource root.
- Do not create folders implicitly.

## Task 4: Verify and package

- Run the targeted retry, processor/compaction, and workspace tests.
- Run affected package type checks and production build.
- Overwrite the installed NovelX test build only after the code is green.

## Task 5: Resume the existing live run

- Re-enter `ses_0752cd317ffeE5l4Dy2fQhRZZp` without adding a user message or issuing another `/growth`.
- Let the unresolved compaction task finish, then continue the fourth world stage and subsequent text stages.
- Keep image workers held; stop and report immediately at the next non-image blocker.
