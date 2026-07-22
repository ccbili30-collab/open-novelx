# NovelX Map Variant Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate the Atlas V3 selected-region map pipeline into the OpenCode-based NovelX integration branch without overwriting the active Growth, Provider, retry, or study work.

**Architecture:** Atlas V3 remains authoritative for region identity, cells, hidden hit testing, full-area edit masks, image-task identity, and raster switching. The integration branch remains authoritative for shared image Provider configuration, asynchronous queue lifecycle, failure/retry projection, and all non-map Growth stages. A new clean integration worktree receives atomic commits from both lines; the four overlapping files are merged manually by responsibility instead of accepting either side wholesale.

**Tech Stack:** TypeScript, Bun, Effect, SolidJS, Electron/OpenCode runtime, `@silvia-odwyer/photon-node`, OpenAI-compatible Image Edit APIs, dy-parse image endpoints.

---

### Task 1: Freeze and verify the map-variant source line

**Files:**

- Modify: `packages/opencode/test/novelx/world-image-queue.test.ts`
- Test: `packages/opencode/test/novelx/world-image-queue.test.ts`

**Step 1: Run the map queue tests after the final full-area-mask correction**

Run:

```powershell
Set-Location D:\CodexW\NovelX_Desktop\work\opencode-novelx-map-variants\packages\opencode
bun test test/novelx/world-image-queue.test.ts
```

Expected: all map edit-plan, boundary-debug-mask, full-area edit-mask, provider request, response transport, and failure-closed tests pass.

**Step 2: Run source-line type checks**

Run:

```powershell
bun run typecheck
Set-Location ..\app
bun run typecheck
```

Expected: both commands exit `0`.

**Step 3: Inspect the source diff**

Run:

```powershell
git -C D:\CodexW\NovelX_Desktop\work\opencode-novelx-map-variants diff --check
git -C D:\CodexW\NovelX_Desktop\work\opencode-novelx-map-variants status --short
```

Expected: no whitespace errors; generated PNGs, preview data, and browser screenshots remain unstaged.

### Task 2: Commit the provider-agnostic map edit contract

**Files:**

- Create: `packages/opencode/src/novelx/world-map-image-provider.ts`
- Modify: `packages/opencode/src/novelx/world-map-variant.ts`
- Modify: `packages/opencode/src/novelx/world-image-queue.ts`
- Modify: `packages/opencode/src/novelx/world-visual.ts`
- Modify: `packages/opencode/test/novelx/world-image-queue.test.ts`

**Step 1: Keep one authoritative map-edit contract**

The contract must express:

```ts
type MapVariantEdit = {
  sourceTaskId: string
  sourcePath: string
  layer: "geography" | "human"
  entityId: string
  editMask: Buffer
  prompt: string
}
```

The edit mask is the complete selected Atlas area. Internal Voronoi cell seams must not appear in the mask.

**Step 2: Keep transport selection outside Atlas logic**

`world-map-variant.ts` may derive source, mask, and prompt. It must not choose credentials, endpoint ownership, or the global model profile.

**Step 3: Keep the two provider paths explicit**

- OpenAI-compatible Image Edit: `gpt-image-2` through the NovelX shared Provider profile.
- dy-parse compatibility path: `/api/v1/image/inpaint`, enabled only by explicit NovelX configuration or the current development environment override.

Missing configuration must fail closed. No hard-coded credential or fixture result may enter source.

**Step 4: Commit only production code and tests**

Run:

```powershell
git add packages/opencode/src/novelx/world-map-image-provider.ts
git add packages/opencode/src/novelx/world-map-variant.ts
git add packages/opencode/src/novelx/world-image-queue.ts
git add packages/opencode/src/novelx/world-visual.ts
git add packages/opencode/test/novelx/world-image-queue.test.ts
git commit -m "feat(novelx): edit complete atlas regions through image providers"
```

Expected: no `prototypes/` asset is staged.

### Task 3: Commit the Atlas grid inspection UI separately

**Files:**

- Modify: `packages/app/src/pages/session/novelx-world-growth-view.tsx`
- Modify: `packages/app/src/pages/session/novelx-workspace.css`

**Step 1: Verify the UI behavior**

The `泰森网格` control toggles only the debug overlay. Geography/human labels, invisible area hits, selected raster switching, second-click focus, and document navigation remain unchanged.

**Step 2: Run the App type check**

Run:

```powershell
Set-Location D:\CodexW\NovelX_Desktop\work\opencode-novelx-map-variants\packages\app
bun run typecheck
```

Expected: exit `0`.

**Step 3: Commit**

Run:

```powershell
git add packages/app/src/pages/session/novelx-world-growth-view.tsx
git add packages/app/src/pages/session/novelx-workspace.css
git commit -m "feat(novelx): expose atlas grid inspection toggle"
```

### Task 4: Preserve the live runner without shipping generated artifacts

**Files:**

- Create: `packages/opencode/script/novelx-map-variant-live.ts`
- Do not commit: `prototypes/map-variant-live/assets/**`
- Do not commit: `prototypes/map-variant-live/data.js`
- Do not commit: `prototypes/map-variant-live/world-visuals.v3.json`
- Do not commit: `prototypes/map-variant-live/preview.png`

**Step 1: Keep the runner as a reproducible Live harness**

The runner must read a real sealed V2/V3 world, preserve its shared base, derive V3 region tasks, call the configured real Provider, write a manifest projection, and never mutate the source project.

**Step 2: Commit the runner alone**

Run:

```powershell
git add packages/opencode/script/novelx-map-variant-live.ts
git commit -m "test(novelx): add live map variant provider harness"
```

### Task 5: Require an integration-line checkpoint

**Files:**

- No files modified by the map-variant line.

**Step 1: Stop if the integration line is still dirty**

Run:

```powershell
git -C D:\CodexW\NovelX_Desktop\work\opencode-novelx-integration status --short
```

Expected before integration: the owner of `codex/novelx-integration` has committed or otherwise provided an explicit checkpoint hash. The map line must not commit, stash, reset, or stage that owner’s files.

**Step 2: Record the checkpoint hash**

Run:

```powershell
git -C D:\CodexW\NovelX_Desktop\work\opencode-novelx-integration rev-parse HEAD
```

Expected: a stable integration source hash supplied by its owning task.

### Task 6: Create a clean joint integration worktree

**Files:**

- Create worktree: `D:\CodexW\NovelX_Desktop\work\opencode-novelx-map-integration`

**Step 1: Create the branch from the integration checkpoint**

Run:

```powershell
git -C D:\CodexW\NovelX_Desktop worktree add `
  D:\CodexW\NovelX_Desktop\work\opencode-novelx-map-integration `
  -b codex/novelx-map-integration <integration-checkpoint>
```

Expected: a clean worktree on `codex/novelx-map-integration`.

**Step 2: Cherry-pick the four existing Atlas commits**

Run:

```powershell
git cherry-pick 493cd70ae f851b2e5d 1afcd39e1 92d5f462c
```

Expected: schema/UI commits apply directly; overlapping runtime/test files may stop for manual resolution.

**Step 3: Cherry-pick the new atomic map commits**

Run:

```powershell
git cherry-pick <map-edit-contract-commit> <atlas-grid-ui-commit> <live-runner-commit>
```

Expected: no generated images or prototype data enter the index.

### Task 7: Resolve the four overlapping files by authority

**Files:**

- Modify: `packages/opencode/src/novelx/world-image-queue.ts`
- Modify: `packages/opencode/src/novelx/world-visual.ts`
- Modify: `packages/opencode/test/novelx/world-image-queue.test.ts`
- Modify: `packages/opencode/test/novelx/world-visual.test.ts`

**Step 1: Resolve `world-image-queue.ts`**

Keep from integration:

- shared `image-provider.ts` configuration and credentials;
- nonblocking visual lifecycle;
- retry/failure state and background-job semantics;
- character/story visual compatibility.

Keep from map variants:

- base-before-variant dependency;
- shared attached base source;
- full selected-area mask;
- V3 task identity and target paths;
- provider request construction for Image Edit/inpaint.

Do not keep a second independent global Provider configuration.

**Step 2: Resolve `world-visual.ts`**

Keep Atlas V3 as the authority for one base task plus one variant per area feature. Keep integration’s nonblocking stage completion and public projection semantics. Preserve V2 read compatibility.

**Step 3: Union the tests**

The final tests must cover:

- V1/V2 readability where already promised;
- Atlas V3 complete variant set;
- one base source reused by every variant;
- full selected-area mask with no internal cell seams;
- missing base and missing feature failure closure;
- real Provider request shape;
- visual failure not blocking the text Growth terminal state.

**Step 4: Commit the manual resolution**

Run:

```powershell
git add packages/opencode/src/novelx/world-image-queue.ts
git add packages/opencode/src/novelx/world-visual.ts
git add packages/opencode/test/novelx/world-image-queue.test.ts
git add packages/opencode/test/novelx/world-visual.test.ts
git cherry-pick --continue
```

### Task 8: Verify the joint head

**Files:**

- Test only.

**Step 1: Run targeted OpenCode tests**

Run:

```powershell
Set-Location D:\CodexW\NovelX_Desktop\work\opencode-novelx-map-integration\packages\opencode
bun test test/novelx/world-visual.test.ts
bun test test/novelx/world-image-queue.test.ts
bun test test/novelx/growth-loop.test.ts
bun test test/novelx/image-provider.test.ts
bun run typecheck
```

Expected: all pass; no ordinary OpenCode session behavior changes.

**Step 2: Run targeted App tests**

Run:

```powershell
Set-Location ..\app
bun test src/context/novelx-world-growth.test.ts
bun run typecheck
```

Expected: pass.

**Step 3: Run the NovelX workspace E2E**

Run the repository’s existing NovelX workspace E2E command after confirming no other task is using the same build output.

Expected: base/geography/human raster switching works; the grid toggle is optional and does not intercept clicks.

### Task 9: Run a real Image Edit comparison

**Files:**

- Generated project output only; do not commit media.

**Step 1: Run one area through `gpt-image-2`**

Use the NovelX shared Provider profile and the same sealed world, shared base, full-area mask, and prompt used by the dy-parse comparison.

Expected: a real Provider result or a typed Provider failure. No fixture fallback.

**Step 2: Compare against dy-parse**

Review:

- whether the complete selected region is immediately distinguishable;
- whether the gold perimeter is continuous;
- whether non-target pixels drift;
- whether terrain identity remains recognizable;
- whether human and geography masks both work.

**Step 3: Stop if the Image model still fails visual acceptance**

Do not weaken Atlas geometry, invent a fake selected raster, or mark the visual task attached. Record the Provider/model/prompt evidence and return for a product decision.

### Task 10: Record the integrated state

**Files:**

- Create: `docs/status/2026-07-23-novelx-map-variant-integration.md`

**Step 1: Record evidence**

Include branch, commit hash, test commands/counts, Provider used, attached/failed task counts, and the exact recovery entry point.

**Step 2: Record exclusions**

State that generated preview images, browser prototype output, credentials, and the legacy `codex/hackathon-10day` product line were not merged.

**Step 3: Commit**

Run:

```powershell
git add docs/status/2026-07-23-novelx-map-variant-integration.md
git commit -m "docs(novelx): record map variant joint baseline"
```

## Stop Conditions

- `codex/novelx-integration` has no owner-provided checkpoint.
- A conflict changes public schema beyond the already reviewed Atlas V3 contract.
- Shared Provider credentials or endpoint ownership are ambiguous.
- Ordinary OpenCode sessions inherit NovelX-only retry or image behavior.
- The real Image Edit model is unavailable and a fixture would be required.
- Generated preview assets or secrets appear in the staged diff.
