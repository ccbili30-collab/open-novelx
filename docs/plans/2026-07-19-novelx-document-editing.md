# NovelX Document Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a real, conflict-safe file editing loop inside the NovelX file workspace.

**Architecture:** Add an experimental exact-text read/conditional-write HttpApi backed by existing location and file-mutation services, regenerate the V2 SDK, then add a project-scoped document state controller and ProseMirror CommonMark editor to the existing NovelX resource workspace. Keep unsupported Markdown in source mode and derive Agent locks from real running tool parts.

**Tech Stack:** Effect HttpApi, FileMutation, generated TypeScript SDK, SolidJS, ProseMirror, Bun tests, Playwright, Electron.

---

### Task 1: Declare the exact edit protocol with failing server tests

**Files:**
- Modify: `packages/opencode/test/server/httpapi-file.test.ts`
- Modify: `packages/opencode/src/server/routes/instance/httpapi/groups/file.ts`

**Steps:**
1. Extend the test request helper to accept HTTP method and JSON payload.
2. Add failing tests for exact leading/trailing whitespace, CRLF and BOM reads.
3. Add failing tests for successful conditional save and a second stale save returning 409.
4. Add failing tests for missing, binary and project-escape targets.
5. Declare `FileEditableContent`, `FileEditableWrite`, and explicit 400/404/409 error schemas plus GET/PUT `/file/edit` endpoints.
6. Run `bun test test/server/httpapi-file.test.ts` in `packages/opencode`; expect new cases to fail until handlers exist.

### Task 2: Implement the protocol through authoritative services

**Files:**
- Modify: `packages/opencode/src/server/routes/instance/httpapi/handlers/file.ts`
- Test: `packages/opencode/test/server/httpapi-file.test.ts`

**Steps:**
1. Add exact UTF-8/BOM decoding and encoding helpers.
2. Resolve targets through `LocationMutation.Service`; reject external targets and non-files.
3. Read bytes through `FSUtil.Service` in the current location layer.
4. Save through `FileMutation.Service.writeIfUnchanged` using encoded baseline bytes.
5. Translate domain/path/platform errors into the declared public JSON errors; translate stale content only to 409.
6. Run the focused server test and typecheck; all new cases must pass.
7. Commit the server contract and implementation as one compiling semantic batch.

### Task 3: Regenerate and exercise the SDK protocol

**Files:**
- Modify: `packages/opencode/test/server/httpapi-exercise/index.ts`
- Modify: `packages/opencode/test/server/httpapi-sdk.test.ts`
- Regenerate: `packages/sdk/openapi.json` and `packages/sdk/js/src/v2/gen/**` according to the existing build script

**Steps:**
1. Add authorized GET/PUT exercises, including a stale conflict response.
2. Add generated-client tests for exact read and conditional write.
3. Run `bun run build` in `packages/sdk/js` to regenerate the client.
4. Run the SDK file tests and `bun run test:httpapi`; no new endpoint may remain skipped or uncovered.
5. Run SDK and server typechecks.
6. Commit generated protocol artifacts with their source contract.

### Task 4: Build tested document-domain state

**Files:**
- Create: `packages/app/src/context/document-edit-state.ts`
- Create: `packages/app/src/context/document-edit-state.test.ts`
- Create: `packages/app/src/context/active-file-mutations.ts`
- Create: `packages/app/src/context/active-file-mutations.test.ts`
- Modify: `packages/app/src/context/novelx-workspace.ts`
- Modify: `packages/app/src/context/novelx-workspace.test.ts`
- Modify: `packages/app/src/context/layout.tsx`

**Steps:**
1. Write failing tests for load/edit/save/error/conflict/reload transitions.
2. Write failing tests for front matter split/join and unsupported Markdown detection.
3. Write failing tests extracting normalized paths from pending/running `write`, `edit`, and `apply_patch` parts while excluding completed/error tools.
4. Add persisted `activeFile` to the per-project NovelX layout state.
5. Implement the smallest pure reducers/helpers that satisfy the tests.
6. Run the focused unit tests and app typecheck.

### Task 5: Implement the project-scoped document controller

**Files:**
- Create: `packages/app/src/context/document-editor.tsx`
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`

**Steps:**
1. Wrap the resource workspace in a controller that survives switching among the six resource surfaces.
2. Load exact text through generated `client.file.editable` and store an immutable save baseline.
3. Save through generated `client.file.write`; map 409 separately from transport and validation failures.
4. Listen to real file watcher events; reload clean documents and preserve/flag dirty ones.
5. Derive current-file read-only state from real sync tool parts.
6. Prevent a dirty draft from being silently discarded when another file is selected.
7. Add focused controller tests with a fake SDK boundary; no Mock result is labeled Live.

### Task 6: Add the CommonMark visual/source editor

**Files:**
- Modify: `packages/app/package.json`
- Modify: `bun.lock`
- Create: `packages/app/src/pages/session/novelx-document-editor.tsx`
- Create: `packages/app/src/pages/session/novelx-document-editor.css`
- Modify: `packages/app/src/pages/session/novelx-resource-workspace.tsx`
- Modify: `packages/app/src/i18n/en.ts`
- Modify: `packages/app/src/i18n/zh.ts`
- Modify: `packages/app/src/i18n/zht.ts`

**Steps:**
1. Add official ProseMirror markdown/state/view/history/keymap/commands dependencies with Bun.
2. Mount/destroy `EditorView` with Solid lifecycle and serialize only document-changing transactions.
3. Preserve front matter outside the ProseMirror document.
4. Implement source textarea, persistent mode control, Alt hold, IME guards, Ctrl+S/Z/Y and focus restoration.
5. Render loading, clean, dirty, saving, locked, conflict and error states without color-heavy buttons.
6. Make unsupported Markdown source-only and explain why.
7. Run unit tests and app typecheck after each behavior group.

### Task 7: Integrate and verify the real loop

**Files:**
- Modify: `packages/app/e2e/regression/novelx-workspace.spec.ts`
- Modify: `packages/app/e2e/regression/new-session-panel-corner.spec.ts` only if geometry assertions legitimately change
- Modify: `docs/design/2026-07-19-novelx-workspace-visual-spec.md`

**Steps:**
1. Add UI regression for selecting a real tree item, editing, undoing, source toggle, saving, lock state and conflict actions.
2. Run focused app unit tests, app/E2E typechecks and the two NovelX Playwright regressions.
3. Run server file tests, SDK tests, HttpApi exercise, production app build and production desktop build.
4. Launch the built Electron app against a temporary project, edit and save a real Markdown file, close/reload, and compare disk bytes.
5. Capture the real Electron result and overwrite `C:\Users\16014\Desktop\NovelX-正式预览.png`.
6. Stop only the test Electron/sidecar processes, inspect staged files, update acceptance evidence and commit.

### Stop conditions

- Any implementation would bypass `LocationMutation` or `FileMutation`.
- Conditional conflict cannot be reproduced with a real temporary file.
- ProseMirror serialization can silently erase an unsupported construct without source-only fallback.
- SDK generation changes unrelated public contracts.
- A required behavior depends on a fake Provider, hidden local template or renderer-only claim.
