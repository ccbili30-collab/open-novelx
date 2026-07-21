# NovelX Protagonist Growth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Insert one source-anchored protagonist dossier between completed World Growth and new Story Growth, then require every newly created Story manifest to bind that exact character source before history, documents, and the novel can be written.

**Architecture:** Keep the completed World pipeline unchanged. Add an independent Character Materialization ledger and a clean character editor/writer pair that produces exactly one committed dossier. Growth routes new projects through World → Character → Story; Story snapshots both the frozen world and character SHA, while legacy completed Story v1 manifests remain readable and are never rewritten.

**Tech Stack:** TypeScript, Effect Schema, Effect runtime services, OpenCode Agent/Tool permissions, Bun tests, SolidJS projection deferred from this text-only batch.

---

## Fixed scope

- Text only: character portrait generation, character UI redesign, graph, and package export are excluded.
- Exactly one protagonist is registered and committed.
- No planned user confirmation point exists in `/growth`.
- A real Provider or tool failure fails closed; no fixture or deterministic fallback may create a live dossier.
- Existing completed Story v1 artifacts are readable and terminal. New Story creation requires a committed protagonist source.

### Task 1: Character storage contract and pure state machine

**Files:**
- Create: `packages/schema/src/novelx-character.ts`
- Create: `packages/opencode/src/novelx/character-materialization.ts`
- Create: `packages/opencode/test/novelx/character-materialization.test.ts`

**Step 1: Write failing tests**

Cover:

- creation from a frozen world source index;
- all world sources must be read before registration;
- registration creates exactly one stable protagonist ID and `Characters/<name>.md` target;
- stale context SHA, unknown source, duplicate source, and unsafe path fail;
- prepare leases the single document and returns exact selected world originals;
- commit validates title, concrete content length, internal-production leaks, lease, and writer session;
- repeated commit is idempotent only for identical content;
- finish requires one committed document;
- persisted integrity detects tampering.

**Step 2: Run the focused test and verify RED**

Run from `packages/opencode`:

`bun test test/novelx/character-materialization.test.ts`

Expected: FAIL because the schema and state machine do not exist.

**Step 3: Implement the minimal contract**

The manifest owns:

- `schemaVersion: 1`, `stage: "character_materialization"`;
- `planning | writing | text_completed | failed | waiting_user` status;
- frozen world title, integrity SHA, and exact source index;
- editor session, prepared context SHA, source reads, registration SHA;
- exactly one protagonist profile and one document record;
- created/updated timestamps and manifest integrity SHA.

The registration profile owns fixed pre-novel facts only: name, aliases, identity, origin and affiliation source IDs, appearance, personality contradiction, desire, fear, wound, voice, capabilities, limitations, initial relationships, opening state, and visual brief. It must not contain a completed character arc or ending.

**Step 4: Run test and Schema typecheck**

- `packages/opencode`: `bun test test/novelx/character-materialization.test.ts`
- `packages/schema`: `bun typecheck`

Expected: PASS.

**Step 5: Commit**

`feat(character): add protagonist materialization`

### Task 2: Character editor, writer, tools, and ownership gates

**Files:**
- Create: `packages/opencode/src/tool/novelx-character-runtime.ts`
- Create: `packages/opencode/src/tool/novelx-prepare-character.ts`
- Create: `packages/opencode/src/tool/novelx-read-character-world.ts`
- Create: `packages/opencode/src/tool/novelx-register-character.ts`
- Create: `packages/opencode/src/tool/novelx-prepare-character-document.ts`
- Create: `packages/opencode/src/tool/novelx-commit-character-document.ts`
- Create: `packages/opencode/src/tool/novelx-finish-character.ts`
- Create: `packages/opencode/src/agent/prompt/novelx-character-editor.txt`
- Create: `packages/opencode/src/agent/prompt/novelx-character-writer.txt`
- Modify: `packages/opencode/src/agent/agent.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Modify: `packages/opencode/src/tool/task.ts`
- Test: `packages/opencode/test/agent/agent.test.ts`
- Test: `packages/opencode/test/tool/registry.test.ts`
- Test: `packages/opencode/test/tool/task.test.ts`
- Create: `packages/opencode/test/tool/novelx-character-growth.test.ts`

**Step 1: Add failing permission, registry, dispatch, and tool-flow tests**

Prove that:

- Growth may dispatch only the character editor for this phase;
- the character editor owns character tools and may dispatch only the character writer;
- the character writer has read-only access to its context pack and cannot write files or spawn agents;
- unrelated agents cannot call character mutation tools;
- the commit tool accepts only an owned `novelx-character-writer` child;
- prepare → source reads → register → prepare document → child output → commit → finish creates one formal file.

**Step 2: Run tests and verify RED**

Run from `packages/opencode`:

`bun test test/tool/novelx-character-growth.test.ts test/agent/agent.test.ts test/tool/registry.test.ts test/tool/task.test.ts`

**Step 3: Implement runtime and tools by following the existing Story boundary**

- The editor reads every frozen world original before registration.
- Harness determines the ID/path and writes the manifest/context pack.
- The leaf reads one immutable context pack and returns Markdown only.
- Only the editor commit tool publishes `Characters/**`.
- No image tool is granted in this batch.

**Step 4: Run focused tests and typecheck**

- `packages/opencode`: focused tests above
- `packages/opencode`: `bun typecheck`

Expected: PASS.

**Step 5: Commit**

`feat(growth): generate one protagonist dossier`

### Task 3: Route Growth through Character before Story

**Files:**
- Modify: `packages/opencode/src/tool/novelx-route-growth.ts`
- Modify: `packages/opencode/src/agent/prompt/novelx-world-growth.txt`
- Modify: `packages/opencode/test/tool/novelx-character-growth.test.ts`
- Modify: `packages/opencode/test/agent/agent.test.ts`

**Step 1: Add failing route tests**

Cover:

- completed world without character → `character_required`;
- incomplete character → `character_resume` with the same character editor;
- completed character without Story → `story_required`;
- completed legacy Story v1 remains terminal and does not receive a retroactive character;
- a character manifest from another world fails closed.

**Step 2: Run route tests and verify RED**

`bun test test/tool/novelx-character-growth.test.ts test/agent/agent.test.ts`

**Step 3: Implement the route and root prompt**

Growth dispatches one foreground `novelx-character-editor`, receives its manifest/integrity handoff, then calls the route again. It never writes the profile or dossier itself and never asks the user to approve the protagonist.

**Step 4: Run focused tests**

Expected: PASS.

**Step 5: Commit**

`feat(growth): route story through protagonist`

### Task 4: Bind every new Story to the committed protagonist

**Files:**
- Modify: `packages/schema/src/novelx-story.ts`
- Modify: `packages/opencode/src/novelx/story-materialization.ts`
- Modify: `packages/opencode/src/tool/novelx-story-runtime.ts`
- Modify: `packages/opencode/src/tool/novelx-prepare-story.ts`
- Create: `packages/opencode/src/tool/novelx-read-story-character.ts`
- Modify: `packages/opencode/src/tool/novelx-register-story.ts`
- Modify: `packages/opencode/src/tool/novelx-prepare-story-document.ts`
- Modify: `packages/opencode/src/agent/prompt/novelx-story-editor.txt`
- Modify: `packages/opencode/src/agent/prompt/novelx-story-writer.txt`
- Modify: `packages/opencode/src/agent/agent.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Test: `packages/opencode/test/novelx/story-materialization.test.ts`
- Test: `packages/opencode/test/tool/registry.test.ts`

**Step 1: Add failing Story source tests**

Cover:

- new Story creation fails without a completed character manifest and committed dossier;
- new Story stores protagonist ID/path/SHA and includes it in prepared context integrity;
- the story editor must record reading the exact dossier before registration;
- a changed or missing dossier fails with a character-source drift error;
- every novel chapter context includes the complete frozen protagonist dossier;
- legacy completed v1 Story manifests still decode and verify without mutation.

**Step 2: Run tests and verify RED**

Run from `packages/opencode`:

`bun test test/novelx/story-materialization.test.ts test/tool/novelx-character-growth.test.ts`

**Step 3: Implement current-v2 creation plus legacy-v1 read compatibility**

- New manifests use `schemaVersion: 2` and a required `protagonist` source record.
- V1 remains a decode/verify-only legacy variant.
- Registration context SHA covers both world and character sources.
- Novel writer context always includes the character card; history/reference documents may also use it but may not contradict it.
- Existing completed v1 projects remain complete and are not backfilled.

**Step 4: Run Story, Character, Agent, Registry, and Task tests plus typechecks**

- `packages/schema`: `bun typecheck`
- `packages/opencode`: all focused NovelX tests
- `packages/opencode`: `bun typecheck`

Expected: PASS.

**Step 5: Commit**

`feat(story): bind novels to protagonist source`

### Task 5: Real Provider text acceptance and status record

**Files:**
- Create: `docs/status/2026-07-22-novelx-protagonist-growth-live.md`

**Step 1: Prepare a recoverable real acceptance project**

Use a new directory containing a verified frozen world and no Character/Story materialization, or run a new one-sentence project if Provider capacity permits. Never delete Story from an existing live project in place.

**Step 2: Run the formal `/growth` route with the configured real Provider**

Expected chain:

`world completed → character_required → character text_completed → story_required → story text_completed`

Images are not invoked.

**Step 3: Verify artifacts directly**

- one character manifest and one non-empty `Characters/*.md`;
- character manifest world integrity equals the frozen world;
- Story v2 protagonist SHA equals the committed dossier SHA;
- every novel chapter context pack includes the same protagonist source;
- history, references, and 6–8 novel chapters are committed;
- no Agent/tool/hash/placeholder text leaks into reader-facing files.

**Step 4: Record exact Provider, session IDs, project path, commands, counts, hashes, failures, and non-Live boundaries**

Do not call this a full NovelX closure. Character UI, portrait, graph, and world package remain unimplemented.

**Step 5: Commit**

`docs(growth): record protagonist text evidence`

