import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { NovelXWorld, NovelXWorldVisual } from "@opencode-ai/schema"
import {
  novelXWorldNavigationItems,
  parseNovelXWorldBlueprint,
  parseNovelXWorldMaterialization,
  parseNovelXWorldVisuals,
  resolveNovelXWorldMapFeature,
} from "./novelx-world-growth"

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")

const profile: NovelXWorld.BlueprintProfile = {
  title: "日环档案",
  genre: { family: "science fiction", label: "轨道殖民", scale: "单恒星系" },
  designSummary: "从轨道环境长出设施与组织的题材自适应科技世界。",
  stages: [
    {
      label: "轨道环境",
      purpose: "建立能源、辐射与交通的物理边界。",
      itemCount: 1,
      dependsOnStageIndices: [],
      reasoningFocus: ["辐射怎样限制活动", "轨道怎样限制交通"],
      documentSections: ["空间结构", "物理环境"],
    },
  ],
}
const stage = {
  id: "nx-stage",
  label: "轨道环境",
  ordinal: 1,
  purpose: profile.stages[0]!.purpose,
  itemCount: 1,
  dependsOnStageIds: [],
  reasoningFocus: profile.stages[0]!.reasoningFocus,
  documentSections: ["事实依据", "因果推演", "空间结构", "物理环境"],
  status: "registered" as const,
}
const blueprintDraft = {
  schemaVersion: 1 as const,
  stage: "world_blueprint" as const,
  status: "registered" as const,
  registeredAt: 1,
  source: { sessionId: "ses", messageId: "msg", toolCallId: "call", profileSha256: sha256(profile) },
  profile,
  stages: [stage],
}
const blueprint = { ...blueprintDraft, integritySha256: sha256(blueprintDraft) }

test("parses adaptive world state and projects model-selected layers and entities", async () => {
  expect(await parseNovelXWorldBlueprint(JSON.stringify(blueprint))).toEqual(blueprint)
  const entity = {
    id: "nx-entity",
    stageId: stage.id,
    name: "赫利俄斯同步环",
    typeLabel: "采能与通信轨道带",
    ordinal: 1,
    summary: "围绕恒星运行的采能与通信设施集合。",
    facts: [
      { label: "轨道", detail: "节点通过共振轨道轮换避开粒子流。" },
      { label: "能源", detail: "输出受散热和材料疲劳限制。" },
      { label: "通信", detail: "恒星遮挡造成周期性断联。" },
    ],
    constraints: ["载人维护只能在有限窗口进行。"],
    upstreamBindings: [],
    status: "registered" as const,
  }
  const materializationDraft = {
    schemaVersion: 2 as const,
    stage: "world_materialization" as const,
    status: "running" as const,
    blueprintIntegritySha256: blueprint.integritySha256,
    growthSessionId: "ses",
    startedAt: 2,
    updatedAt: 3,
    stages: [
      {
        stageId: stage.id,
        status: "registered" as const,
        editorSessionId: "ses-stage-editor",
        sourceReads: [],
        preparedContextSha256: "a".repeat(64),
        preparedAt: 2,
        registeredAt: 3,
        entities: [entity],
        relations: [],
        handoff: null,
      },
    ],
    documents: [
      {
        entityId: entity.id,
        stageId: stage.id,
        targetPath: "World/01-轨道环境/赫利俄斯同步环.md",
        draftPath: ".novelx/growth/world-drafts/nx-entity.md",
        status: "registered" as const,
        lease: null,
        taskSessionId: null,
        draftSha256: null,
        committedSha256: null,
        updatedAt: 3,
        errorCode: null,
      },
    ],
    memoryCheckpoints: [],
  }
  const materialization = { ...materializationDraft, integritySha256: sha256(materializationDraft) }
  expect(await parseNovelXWorldMaterialization(JSON.stringify(materialization), blueprint.integritySha256)).toEqual(
    materialization,
  )
  expect(novelXWorldNavigationItems(blueprint, materialization).map((item) => [item.kind, item.label])).toEqual([
    ["root", "Growth 总主编"],
    ["stage", "轨道环境"],
    ["editor", "阶段主编"],
    ["entity", "赫利俄斯同步环"],
  ])
})

test("verifies visual evidence and resolves whole features without letting rivers steal cell clicks", async () => {
  const cells: NovelXWorldVisual.AtlasCell[] = Array.from({ length: 24 }, (_, index) => ({
    id: `cell-${index}`,
    center: { x: (index % 6) / 6 + 0.04, y: Math.floor(index / 6) / 4 + 0.04 },
    polygon: [
      { x: 0.01, y: 0.01 },
      { x: 0.02, y: 0.01 },
      { x: 0.01, y: 0.02 },
    ],
    neighborIds: [],
    surface: "plain",
    geographyEntityIds: index < 2 ? ["basin", "river"] : [],
    humanEntityIds: index < 3 ? ["realm"] : [],
  }))
  const sourceSha256 = "b".repeat(64)
  const features: NovelXWorldVisual.AtlasFeature[] = [
    {
      entityId: "river",
      layer: "geography",
      kind: "river",
      surface: "coast",
      cellIds: ["cell-0", "cell-1"],
      label: "银涌河",
      labelPoint: { x: 0.2, y: 0.3 },
      summary: "自北岭流入盆地的主河道。",
      sourceSha256,
      importance: "notable",
    },
    {
      entityId: "basin",
      layer: "geography",
      kind: "region",
      surface: "plain",
      cellIds: ["cell-0", "cell-1"],
      label: "暮谷盆地",
      labelPoint: { x: 0.3, y: 0.4 },
      summary: "群山环抱、由河谷冲积形成的盆地。",
      sourceSha256,
      importance: "ordinary",
    },
    {
      entityId: "realm",
      layer: "human",
      kind: "polity",
      surface: "plain",
      cellIds: ["cell-0", "cell-1", "cell-2"],
      label: "北烽王国",
      labelPoint: { x: 0.4, y: 0.5 },
      summary: "跨越盆地和北岭隘口的山地王国。",
      sourceSha256,
      importance: "required",
    },
  ]
  const task: NovelXWorldVisual.ImageTask = {
    id: "map-task",
    type: "map",
    subtype: "world-map",
    ownerEntityId: null,
    status: "queued",
    title: "测试世界地图",
    prompt: "绘制一张无文字的古典中世纪世界地图底图。",
    rationale: "使用权威语义蒙版生成可叠加标签的地图。",
    sourceEntityIds: ["basin"],
    sourceSha256s: [sourceSha256],
    targetPath: NovelXWorldVisual.MAP_RASTER_PATH,
    mime: null,
    assetSha256: null,
    model: null,
    startedAt: null,
    completedAt: null,
    errorCode: null,
  }
  const materializationSha256 = "c".repeat(64)
  const draft = {
    schemaVersion: 1 as const,
    stage: "world_visuals" as const,
    status: "queued" as const,
    worldMaterializationIntegritySha256: materializationSha256,
    visualLanguage: "温暖羊皮纸质感、克制色彩、古典地图绘画语言。",
    visualLanguageSha256: "d".repeat(64),
    atlas: {
      id: "atlas",
      title: "测试世界",
      width: 1024 as const,
      height: 1024 as const,
      seed: "seed",
      meshSha256: "e".repeat(64),
      semanticMaskPath: NovelXWorldVisual.SEMANTIC_MASK_PATH,
      semanticMaskSha256: "f".repeat(64),
      rasterPath: NovelXWorldVisual.MAP_RASTER_PATH,
      cells,
      features,
    },
    tasks: [task],
    createdAt: 1,
    updatedAt: 1,
  }
  const manifest = { ...draft, integritySha256: sha256(draft) } satisfies NovelXWorldVisual.Manifest
  expect(await parseNovelXWorldVisuals(JSON.stringify(manifest), materializationSha256)).toEqual(manifest)
  expect(resolveNovelXWorldMapFeature(manifest, "geography", { cellId: "cell-0" })?.entityId).toBe("basin")
  expect(resolveNovelXWorldMapFeature(manifest, "geography", { explicitEntityId: "river" })?.entityId).toBe("river")
  expect(resolveNovelXWorldMapFeature(manifest, "human", { cellId: "cell-0" })?.cellIds).toEqual([
    "cell-0",
    "cell-1",
    "cell-2",
  ])
})
