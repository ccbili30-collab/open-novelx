# NovelX workspace UI batch status

## Source and commit

- Upstream: OpenCode v1.18.3, `127bdb30784d508cc556c71a0f32b508a3061517`.
- Branch: `novelx-ui`.
- Implementation commit: `320c42a` (`feat(app): add NovelX workspace shell`).
- Design: [`../plans/2026-07-19-novelx-workspace-ui-design.md`](../plans/2026-07-19-novelx-workspace-ui-design.md).

## Implemented

- Session and new-task routes now share a collapsible NovelX left pane.
- New Task uses the current server/directory draft API.
- Agent selection uses `useLocal().agent`, the same authority as the composer.
- Project sessions use the current directory sync, load up to 30 real root sessions, and exclude child and archived sessions.
- The right file tree has Files and World views. World reads `World/**` through the existing file API and opens files through existing session file tabs.
- English and Simplified Chinese copy is localized. Other existing locales explicitly fall back to English for this first batch.

## Verification

- `packages/app: bun typecheck`: passed.
- `packages/app: bun typecheck:e2e`: passed.
- `packages/desktop: bun typecheck`: passed.
- `packages/app: bun test --preload ./happydom.ts ./src/pages/session/novelx-workspace-model.test.ts`: 4 passed, 0 failed.
- `packages/app: bunx playwright test e2e/regression/novelx-workspace.spec.ts --project=chromium --workers=1`: 1 passed, exercising session selection, Agent selection, World expansion/file opening, sidebar collapse/expand, and New Task navigation.
- `packages/app: bun run build`: passed, 2,425 modules transformed.
- `packages/desktop: bun run build`: passed; main, preload, renderer, and bundled OpenCode node sidecar built.
- Targeted Oxlint: 0 errors; existing warnings in the shared mock-server utility remain.
- App production output changed from 72,813,003 to 72,861,158 bytes. The main JavaScript chunk changed from 2,862,533 to 2,869,725 bytes (+7,192).

The E2E test uses the repository's route-level Mock Server to make UI state deterministic. No real Provider was used, so this is not Live Agent or Growth verification.

## Known failure

`packages/app: bun run test:unit` reports 624 passed and 1 failed. The remaining failure is the pinned upstream v1.18.3 Arabic i18n parity gap for these existing keys:

- `session.header.reveal.finder`
- `session.header.reveal.fileExplorer`
- `session.header.reveal.containingFolder`

The 12 NovelX keys introduced by this batch were removed from the failure list by adding explicit locale fallbacks. The unrelated upstream Arabic gap was not modified.

## Not complete

- No Home-page redesign or full OpenCode-to-NovelX rebrand.
- No updater, deep-link protocol, public protocol, schema, permissions, or Runtime change.
- No semantic geography/organization/character-card projection beyond the real `World/**` file tree.
- No Growth orchestration, image generation, Canon mutation, or Change Set flow.
- No real Provider end-to-end run.
- Electron startup, shutdown, IPC, and residual-process behavior were not runtime-tested in this batch; only Desktop typecheck and production build passed.

## Recovery entry

Continue from `packages/app/src/pages/session/novelx-workspace-sidebar.tsx` for left navigation and `packages/app/src/pages/session/session-side-panel.tsx` for Files/World. Preserve `useLocal`, `useTabs`, `useSync`, and `useFile` as the current truth boundaries.
