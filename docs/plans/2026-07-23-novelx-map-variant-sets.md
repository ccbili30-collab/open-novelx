# NovelX Map Variant Sets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build one shared world-map base image plus geography and human-region highlight variants, while keeping the authoritative Thiessen geometry hidden and using it only for hit testing, labels, and document navigation.

**Architecture:** Atlas V3 keeps the existing authoritative cells and features, adds Harness-derived map variant tasks grouped by layer, and preserves V2 as a readable legacy projection. The image worker generates the base map first, derives every selected-region image from that same base, and persists each result independently. The renderer keeps vector hit regions invisible and swaps the complete raster according to the existing idle/highlighted/focused selection state.

**Tech Stack:** TypeScript, Effect Schema, Effect runtime, SolidJS, Bun tests, Playwright Electron/workspace tests.

---

## Product and compatibility boundary

- The world facts, Growth stage order, publication, character, story, graph, files, Electron shell, and installer are out of scope.
- Image work remains asynchronous and must never block the text Growth terminal state.
- The Harness derives variant tasks from committed Atlas features. Agents do not register one task or prompt per image.
- Geography and human layers share one base raster and one authoritative cell mesh, but have independent cell ownership, labels, selected images, and document targets.
- Atlas V3 is authoritative for newly generated maps. Atlas V2 remains readable; it has only a base image and therefore cannot display generated region variants until regenerated.
- Provider calls must fail closed. Tests may inject recorded bytes, but no Fixture is Live evidence.

### Task 1: Add the Atlas V3 variant-set contract

**Files:**
- Modify: `packages/schema/src/novelx-world-visual.ts`
- Modify: `packages/opencode/test/novelx/world-visual.test.ts`
- Modify: `packages/app/src/context/novelx-world-growth.test.ts`

**Step 1: Write failing schema tests**

- Decode a V3 manifest containing one base task and geography/human variant tasks.
- Reject a variant without `layer`, `entityId`, or `baseTaskId`.
- Reject duplicate `(layer, entityId)` bindings.
- Confirm the application parser still accepts a valid V2 manifest as a legacy read-only projection.

**Step 2: Run tests and confirm the new cases fail**

Run:

```powershell
bun test packages/opencode/test/novelx/world-visual.test.ts packages/app/src/context/novelx-world-growth.test.ts
```

Expected: new V3 and V2-compatibility assertions fail before implementation.

**Step 3: Implement the minimal contract**

- Keep the existing task lifecycle states.
- Distinguish `map-base`, `map-variant`, and `scenery` task roles.
- Add stable `layer`, `entityId`, and `baseTaskId` fields only where semantically valid.
- Raise the task budget from the current sparse-image limit to a bounded value derived from the existing maximum of 64 Atlas features plus scenery.
- Export stable base and variant media directories.
- Define a union reader for V2/V3 rather than guessing a migration.

**Step 4: Run schema tests**

Expected: all targeted contract and parser cases pass.

### Task 2: Derive variant sets from authoritative Atlas features

**Files:**
- Modify: `packages/opencode/src/novelx/world-visual.ts`
- Modify: `packages/opencode/test/novelx/world-visual.test.ts`

**Step 1: Write failing compiler tests**

- Compile one base task.
- Compile exactly one variant for every geography/human area feature.
- Do not create variants for line or point features.
- Use deterministic task IDs and paths.
- Ensure geography and human variants may reference different entity IDs while sharing the same base task.
- Ensure labels and source hashes remain Atlas data and are not embedded in the image filename contract or raster.

**Step 2: Run the compiler test and confirm failure**

Run:

```powershell
bun test packages/opencode/test/novelx/world-visual.test.ts
```

**Step 3: Implement Harness-derived prompts and tasks**

- Keep the visual editor input limited to shared visual language, base map prompt, claims, and scenery candidates.
- Create variant prompts programmatically from the feature label, layer, summary, label point, and stable shared instructions.
- State that geography, proportions, camera, labels, and all non-target regions remain substantially unchanged; only the target region receives the selected-state treatment.
- Produce stable paths such as `World/Media/maps/geography/<entityId>.png` and `World/Media/maps/human/<entityId>.png`.

**Step 4: Run the compiler test**

Expected: deterministic base and complete layer variant sets pass.

### Task 3: Enforce base-image dependency in the image worker

**Files:**
- Create: `packages/opencode/src/novelx/world-map-variant.ts`
- Modify: `packages/opencode/src/novelx/world-image-queue.ts`
- Modify: `packages/opencode/test/novelx/world-image-queue.test.ts`

**Step 1: Write failing queue tests**

- Base map edit consumes the semantic mask.
- Variant edit consumes the attached base image, never the semantic mask as its visible source.
- A variant cannot run before its base is attached.
- A failed variant does not alter attached siblings or text Growth state.
- Retrying one failed variant does not regenerate the base or successful variants.
- Worker restart converts interrupted tasks to explicit failure and can resume them without duplicate attachment.

**Step 2: Run the queue tests and confirm failure**

Run:

```powershell
bun test packages/opencode/test/novelx/world-image-queue.test.ts
```

**Step 3: Implement provider-neutral variant preparation**

- Put base/variant source resolution and prompt construction in `world-map-variant.ts`.
- Keep provider transport in the existing image-provider boundary.
- Submit each variant as image-to-image against the same base bytes.
- Preserve one logical variant-set progress projection while persisting each task independently.
- Do not add retries to ordinary OpenCode sessions.

**Step 4: Run queue tests**

Expected: dependency, restart, failure isolation, and incremental retry cases pass.

### Task 4: Load V3 assets and choose the current raster

**Files:**
- Modify: `packages/app/src/context/novelx-world-growth.ts`
- Modify: `packages/app/src/context/novelx-world-growth.test.ts`

**Step 1: Write failing projection tests**

- Idle selection resolves the base image.
- Geography selection resolves only the matching geography variant.
- Human selection resolves only the matching human variant.
- Missing/failed variant falls back to the base image without inventing success.
- Changing layers resets selection and returns to the shared base.

**Step 2: Run the context test and confirm failure**

Run:

```powershell
bun test packages/app/src/context/novelx-world-growth.test.ts
```

**Step 3: Implement a pure raster resolver**

- Resolve by `(mode, selection.entityId)` and attached task evidence.
- Keep names, label points, source hashes, and document IDs independent from image assets.
- Expose variant-set progress without exposing internal prompts or task mechanics in the conversation.

**Step 4: Run context tests**

Expected: base, selected, cross-layer, and failure fallback cases pass.

### Task 5: Hide geometry and swap complete images

**Files:**
- Modify: `packages/app/src/pages/session/novelx-world-growth-view.tsx`
- Modify: `packages/app/src/pages/session/novelx-workspace.css`
- Modify: `packages/app/e2e/regression/novelx-workspace.spec.ts`

**Step 1: Add failing UI/E2E assertions**

- Region paths retain pointer hit testing but have no visible fill or stroke.
- First click swaps from base to the selected variant.
- Second click keeps the same variant, zooms to the feature, and opens details.
- Third click returns to the base image and full view.
- Geography/human tab changes use their independent feature bindings.
- Labels remain visible and continue opening the correct entity.

**Step 2: Run focused UI tests and confirm failure**

Run:

```powershell
bun test packages/app/src/context/novelx-world-growth.test.ts
```

Run the focused Playwright workspace scenario after the unit boundary passes.

**Step 3: Implement image swapping**

- Keep the SVG transform, hit paths, labels, lines, points, zoom, and detail panel.
- Remove visible selected-region vector styling.
- Render the resolved complete raster for each state.
- Preload attached variants for the active layer and use a restrained opacity transition only if it does not blur hit testing or create stale-image races.

**Step 4: Run UI and E2E tests**

Expected: the map looks like one image changing state; no Thiessen edge is visible outside the explicit semantic debug view.

### Task 6: Verify, document, and commit the isolated batch

**Files:**
- Create: `docs/status/2026-07-23-novelx-map-variant-sets.md`
- Update only if required: `docs/project/current-state-and-routes.md`

**Step 1: Run targeted suites**

```powershell
bun test packages/opencode/test/novelx/world-visual.test.ts packages/opencode/test/novelx/world-image-queue.test.ts packages/opencode/test/tool/novelx-register-world-visuals.test.ts packages/app/src/context/novelx-world-growth.test.ts
```

**Step 2: Run package type checks**

Run the schema, OpenCode, and App type checks using the repository package scripts.

**Step 3: Run the focused workspace E2E**

- Verify base image, geography variant, human variant, three-state click behavior, names, and detail navigation.
- Record that Mock/Fixture E2E is not Live image evidence.

**Step 4: Build affected application targets**

- Build the desktop application.
- Build the local Android APK if the repository target remains available, following the stored project preference.
- Do not install over or launch the other thread's running NovelX instance.

**Step 5: Write an honest status record**

- Record exact commands, counts, failures, commit hash, and whether a real Provider was used.
- Record the integration conflict seam in `world-image-queue.ts` and the expected adaptation to the other line's finalized provider module.
- Do not claim Live until a real provider creates one base plus geography and human variant images from an actual completed world.

**Step 6: Commit by semantic boundary**

- Commit contract/compiler.
- Commit queue/provider integration.
- Commit renderer projection.
- Commit evidence/documentation after verification.
