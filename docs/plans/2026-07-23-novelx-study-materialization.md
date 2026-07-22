# NovelX Study Materialization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/study` route that inventories an existing NovelX project, divides readable source material into bounded 80k-token source windows, delegates extraction, merges entities, enriches gaps, writes canonical public dossiers, updates graph-visible files, and registers non-blocking visual work.

**Architecture:** Study owns a separate append-and-seal ledger under `.novelx/study`; it does not mutate Growth manifests or overwrite source files. The Harness owns source discovery, stable IDs, source-window boundaries, target paths, integrity, leases and completion gates. Models own classification, extraction, deduplication decisions, prose synthesis, web research queries and visual candidate selection.

**Tech Stack:** TypeScript, Effect Schema, OpenCode tools and hidden Agents, FSUtil, Bun tests, existing NovelX watcher events and visual queue contracts.

---

## Product contract

The direct route is:

```text
open existing project
→ /study
→ inventory sources
→ convert supported materials to text
→ split each readable source into semantic windows of at most 80k estimated source tokens
→ run one extraction worker per window
→ merge aliases/entities/relations
→ write canonical World, Characters, Stories and reference dossiers
→ research unresolved gaps on the web
→ generate only still-missing facts under source constraints
→ register image search/generation work
→ text_completed while visual work may continue
```

There is no user review stage. Original source files are immutable inputs. Internal segment results are not public drafts; only the integration writer may publish canonical dossiers.

## Public target paths

The model chooses semantic type, group and title. The Harness produces the path and rejects collisions with input sources:

| Study document kind | Public target path |
| --- | --- |
| `world` | `World/<group>/<title>.md` |
| `character` | `Characters/<title>.md` |
| `story_index` | `Stories/作品档案/<title>.md` |
| `reference` | `Stories/文献/<group>/<title>.md` |

Existing novel chapters, Wiki exports and user files remain where the user placed them. Study creates indexes and dossiers around them instead of rewriting the originals.

## Source and completion rules

- Local project files outrank web sources; web sources outrank model prior knowledge; constrained generation is the final fallback.
- Every canonical paragraph must cite at least one local or web evidence record, or carry the internal origin `inferred`/`generated`.
- Unsupported PDF, office, image, audio and video formats remain `adapter_required`; they are never treated as successfully parsed.
- A Study text run may finish only when every readable segment is extracted, every integrated dossier is committed, and every unresolved field is explicitly `unknown` or resolved.
- Visual tasks are independent: `pending`, `queued`, `generating`, `attached` or `failed` never block `text_completed`.

### Task 1: Study schema and pure materialization state machine

**Files:**
- Create: `packages/schema/src/novelx-study.ts`
- Modify: `packages/schema/src/index.ts`
- Create: `packages/opencode/src/novelx/study-materialization.ts`
- Create: `packages/opencode/test/novelx/study-materialization.test.ts`

**Steps:**
1. Write failing tests for source classification, conservative token estimation, semantic segmentation, deterministic target paths, duplicate rejection, source collision rejection and visual-independent text completion.
2. Run `bun test test/novelx/study-materialization.test.ts` in `packages/opencode`; expect missing-module failure.
3. Define `NovelXStudy.Materialization`, source, segment, extraction, evidence, relation, gap, document and visual records.
4. Implement pure creation, verification, segment planning, extraction commit, integration registration, dossier commit and finish functions.
5. Run the targeted test and both Schema/OpenCode typechecks.

### Task 2: Filesystem runtime and inventory tool

**Files:**
- Create: `packages/opencode/src/tool/novelx-study-runtime.ts`
- Create: `packages/opencode/src/tool/novelx-start-study.ts`
- Create: `packages/opencode/test/tool/novelx-study-runtime.test.ts`

**Steps:**
1. Test that `.git`, `.novelx`, dependency/build directories and Study public output collisions are excluded safely.
2. Inventory text, document, image, audio and video files without reading unsupported binary formats as text.
3. Write normalized segment payloads under `.novelx/study/segments` and the integrity-protected ledger under `.novelx/study/materialization.json` atomically.
4. Publish watcher events for the ledger and segment state.

### Task 3: Extraction worker contract

**Files:**
- Create: `packages/opencode/src/tool/novelx-prepare-study-segment.ts`
- Create: `packages/opencode/src/tool/novelx-commit-study-segment.ts`
- Create: `packages/opencode/src/agent/prompt/novelx-study-worker.txt`
- Modify: `packages/opencode/src/agent/agent.ts`
- Modify: `packages/opencode/src/tool/registry.ts`
- Modify: `packages/opencode/test/agent/agent.test.ts`

**Steps:**
1. Grant the worker only its prepare/commit tools; deny generic filesystem mutation, nested tasks and direct public writes.
2. Lease one segment to one worker session and return no more than the registered source window.
3. Require structured entity, relation, event, evidence, gap and visual-candidate output.
4. Commit extraction by exact segment content hash and worker lease.

### Task 4: Integration and canonical file publication

**Files:**
- Create: `packages/opencode/src/tool/novelx-prepare-study-integration.ts`
- Create: `packages/opencode/src/tool/novelx-register-study-documents.ts`
- Create: `packages/opencode/src/tool/novelx-prepare-study-document.ts`
- Create: `packages/opencode/src/tool/novelx-commit-study-document.ts`
- Create: `packages/opencode/src/tool/novelx-finish-study.ts`
- Create: `packages/opencode/src/agent/prompt/novelx-study-integrator.txt`

**Steps:**
1. Give the integrator paginated extraction indexes (at most eight sealed extractions per call) and source lookup handles, not the entire original corpus or one unbounded tool result.
2. Resolve aliases and duplicate entities before registering public documents.
3. Generate target paths exclusively in the Harness and reject any path that equals an input source path.
4. Lease, stream and atomically commit each public dossier with evidence bindings and an integrity hash.
5. Mark unresolved gaps `unknown`, `web`, `inferred` or `generated`; no review state is introduced.

### Task 5: Web enrichment and visual registration

**Files:**
- Create: `packages/opencode/src/agent/prompt/novelx-study-researcher.txt`
- Create: `packages/opencode/src/tool/novelx-register-study-enrichment.ts`
- Create: `packages/opencode/src/tool/novelx-register-study-visuals.ts`
- Reuse without changing contracts: existing world scenery/map, character portrait and story cover queue modules.

**Steps:**
1. Permit the researcher to fetch/search only gaps registered by the integrator.
2. Persist URL, title, retrieval time and evidence fingerprint for every web-derived fact or image.
3. Prefer attributable existing media; otherwise register generation tasks for map, scenery, portrait or cover.
4. Do not wait for visual workers before Study text completion.

### Task 6: `/study` command and root coordinator

**Files:**
- Create: `packages/opencode/src/command/template/novelx-study.txt`
- Modify: `packages/opencode/src/command/index.ts`
- Create: `packages/opencode/src/agent/prompt/novelx-study.txt`
- Modify: `packages/opencode/src/agent/agent.ts`
- Create: `packages/opencode/test/command/novelx-study.test.ts`

**Steps:**
1. Register a built-in, non-overridable `/study` command with `$ARGUMENTS`.
2. Give the hidden primary Study Agent only route/start/finish tools and bounded child Agent dispatch.
3. Route deterministically through inventory, all segment workers, integration, gap research, canonical publication and visual registration.
4. Hide prompts, tool names, session IDs, hashes, manifests and production reports from the user-facing transcript.

### Task 7: UI projection and Live validation

**Files:**
- Create or modify only after runtime green: Study status projection in `packages/app/src`.
- Create: `docs/status/2026-07-23-novelx-study-framework.md`

**Steps:**
1. Show source/segment/document progress without exposing internal prompts or Agent reports.
2. Lock only the public dossier currently being streamed; original sources remain readable.
3. Run Schema, OpenCode and App typechecks plus targeted tests.
4. Use a real project and Provider to validate one text corpus larger than one segment. Do not call the feature Live until this succeeds.
