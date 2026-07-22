import { describe, expect, test } from "bun:test"
import { NovelXWorld, NovelXWorldVisual } from "@opencode-ai/schema"
import { compileWorldBlueprint, worldSha256 } from "../../src/novelx/world-blueprint"
import { compileWorldVisuals, updateImageTask, verifyWorldVisuals } from "../../src/novelx/world-visual"

const blueprint = compileWorldBlueprint({
  profile: {
    title: "长风大陆",
    genre: { family: "fantasy", label: "经典中世纪奇幻", scale: "大陆" },
    designSummary: "自然地形约束人类政体、道路与城市分布。",
    stages: [
      {
        label: "自然地域",
        purpose: "建立山地、盆地与水系。",
        itemCount: 2,
        dependsOnStageIndices: [],
        reasoningFocus: ["地形经过哪些长期过程形成", "气候如何受到地势与水系约束"],
        documentSections: ["空间结构", "气候与水系"],
      },
      {
        label: "国家与组织",
        purpose: "依据自然条件形成政体和交通网络。",
        itemCount: 1,
        dependsOnStageIndices: [0],
        reasoningFocus: ["疆域边界为何形成当前形态", "首都为何必须位于当前位置"],
        documentSections: ["疆域", "制度与生计"],
      },
    ],
  },
  source: { sessionId: "ses-growth", messageId: "msg-growth", toolCallId: "call", registeredAt: 1 },
})

const sourceA = "a".repeat(64)
const sourceB = "b".repeat(64)
const sourceC = "c".repeat(64)
const naturalEntities: NovelXWorld.RegisteredEntity[] = [
  {
    id: "natural-basin",
    stageId: blueprint.stages[0]!.id,
    name: "丰穗盆地",
    typeLabel: "河谷盆地",
    ordinal: 1,
    summary: "由群山围合、河网灌溉的中央盆地。",
    facts: [
      { label: "地势", detail: "盆地中央低平。" },
      { label: "水系", detail: "多条支流汇入主河。" },
      { label: "气候", detail: "山地雨影造成季节差。" },
    ],
    constraints: ["洪水和山口决定聚落位置。"],
    upstreamBindings: [],
    status: "registered",
  },
  {
    id: "natural-mountains",
    stageId: blueprint.stages[0]!.id,
    name: "断冠山链",
    typeLabel: "高山屏障",
    ordinal: 2,
    summary: "横贯大陆北部的高山和冰雪水源。",
    facts: [
      { label: "走向", detail: "山链东西延展。" },
      { label: "水源", detail: "冰雪融水补给河流。" },
      { label: "通行", detail: "只有少数山口常年可用。" },
    ],
    constraints: ["越岭交通必须经过山口。"],
    upstreamBindings: [],
    status: "registered",
  },
]
const humanEntity: NovelXWorld.RegisteredEntity = {
  id: "human-kingdom",
  stageId: blueprint.stages[1]!.id,
  name: "河冠王国",
  typeLabel: "河谷王国",
  ordinal: 1,
  summary: "控制盆地粮道和北部山口的封建王国。",
  facts: [
    { label: "疆域", detail: "覆盖中央盆地和北部山口。" },
    { label: "首都", detail: "首都位于两河汇流处。" },
    { label: "生计", detail: "粮食、驮运和关税支撑王权。" },
  ],
  constraints: ["不能脱离盆地粮食和山口交通。"],
  upstreamBindings: [
    {
      entityId: "natural-basin",
      relation: "粮食腹地",
      impact: "提供粮食和人口。",
      constraints: ["洪水季限制道路。"],
      sourceSha256: sourceA,
    },
    {
      entityId: "natural-mountains",
      relation: "北境屏障",
      impact: "形成边疆和关隘。",
      constraints: ["军队只能走山口。"],
      sourceSha256: sourceB,
    },
  ],
  status: "registered",
}

const document = (
  entityId: string,
  stageId: string,
  entityName: string,
  sha256: string,
): NovelXWorld.WorldDocumentRecord => ({
  entityId,
  stageId,
  targetPath: (() => {
    const stage = blueprint.stages.find((item) => item.id === stageId)!
    return `World/${String(stage.ordinal).padStart(2, "0")}-${stage.label}/${entityName}.md`
  })(),
  draftPath: `${NovelXWorld.DRAFT_DIRECTORY}/${entityId}.md`,
  status: "committed",
  lease: null,
  taskSessionId: `ses-${entityId}`,
  draftSha256: sha256,
  committedSha256: sha256,
  updatedAt: 3,
  errorCode: null,
})

const handoff = (
  stageId: string,
  editorSessionId: string,
  entityIds: string[],
  documents: Array<{ entityId: string; sha256: string }>,
) => {
  const draft = {
    sealedAt: 4,
    editorSessionId,
    entityIds,
    sourceEntityIds: stageId === blueprint.stages[0]!.id ? [] : naturalEntities.map((entity) => entity.id),
    documents,
    navigationSummary: "该阶段已经封存真实自然与人文约束，供后续视觉投影引用。",
  }
  return { ...draft, integritySha256: worldSha256(draft) }
}

const documents = [
  document("natural-basin", blueprint.stages[0]!.id, "丰穗盆地", sourceA),
  document("natural-mountains", blueprint.stages[0]!.id, "断冠山链", sourceB),
  document("human-kingdom", blueprint.stages[1]!.id, "河冠王国", sourceC),
]
const naturalHandoff = handoff(
  blueprint.stages[0]!.id,
  "ses-natural-editor",
  naturalEntities.map((entity) => entity.id),
  documents.slice(0, 2).map((item) => ({ entityId: item.entityId, sha256: item.committedSha256! })),
)
const humanHandoff = handoff(
  blueprint.stages[1]!.id,
  "ses-human-editor",
  [humanEntity.id],
  [{ entityId: humanEntity.id, sha256: sourceC }],
)
const materializationDraft = {
  schemaVersion: 2 as const,
  stage: "world_materialization" as const,
  status: "completed" as const,
  blueprintIntegritySha256: blueprint.integritySha256,
  growthSessionId: "ses-growth",
  startedAt: 2,
  updatedAt: 8,
  stages: [
    {
      stageId: blueprint.stages[0]!.id,
      status: "completed" as const,
      editorSessionId: "ses-natural-editor",
      sourceReads: [],
      preparedContextSha256: "d".repeat(64),
      preparedAt: 2,
      registeredAt: 3,
      entities: naturalEntities,
      relations: [],
      handoff: naturalHandoff,
    },
    {
      stageId: blueprint.stages[1]!.id,
      status: "completed" as const,
      editorSessionId: "ses-human-editor",
      sourceReads: [
        { entityId: naturalEntities[0]!.id, sourceSha256: sourceA, readAt: 5 },
        { entityId: naturalEntities[1]!.id, sourceSha256: sourceB, readAt: 5 },
      ],
      preparedContextSha256: "e".repeat(64),
      preparedAt: 5,
      registeredAt: 6,
      entities: [humanEntity],
      relations: [],
      handoff: humanHandoff,
    },
  ],
  documents,
  memoryCheckpoints: [
    {
      stageId: blueprint.stages[0]!.id,
      handoffIntegritySha256: naturalHandoff.integritySha256,
      contextEpoch: 1,
      compactionMessageId: "msg-c1",
      createdAt: 5,
    },
    {
      stageId: blueprint.stages[1]!.id,
      handoffIntegritySha256: humanHandoff.integritySha256,
      contextEpoch: 2,
      compactionMessageId: "msg-c2",
      createdAt: 7,
    },
  ],
}
const materialization: NovelXWorld.WorldMaterialization = {
  ...materializationDraft,
  integritySha256: worldSha256(materializationDraft),
}

const profile: NovelXWorldVisual.VisualRegistrationProfile = {
  visualLanguage: "古典手绘羊皮纸地图，低饱和赭石、墨绿和灰蓝，无现代 UI 符号，无文字，无水印。",
  mapPrompt:
    "生成一张无字中世纪奇幻大陆地图。中央是丰饶盆地，北方横贯断裂山链，河流从雪山流入盆地；保持语义蒙版拓扑，不绘制网格、标签或国界。",
  claims: [
    {
      entityId: "natural-basin",
      layer: "geography",
      kind: "region",
      geometry: "area",
      parentEntityId: null,
      surface: "plain",
      anchors: [{ x: 0.51, y: 0.55 }],
      radius: 0.32,
      label: "丰穗盆地",
      summary: "群山环绕并有河流灌溉的中央盆地。",
      importance: "notable",
    },
    {
      entityId: "natural-mountains",
      layer: "geography",
      kind: "mountain",
      geometry: "area",
      parentEntityId: null,
      surface: "mountain",
      anchors: [
        { x: 0.25, y: 0.25 },
        { x: 0.5, y: 0.2 },
        { x: 0.78, y: 0.24 },
      ],
      radius: 0.13,
      label: "断冠山链",
      summary: "北部高山屏障和大陆主要水源。",
      importance: "required",
    },
    {
      entityId: "human-kingdom",
      layer: "human",
      kind: "polity",
      geometry: "area",
      parentEntityId: null,
      surface: "plain",
      anchors: [
        { x: 0.48, y: 0.52 },
        { x: 0.56, y: 0.42 },
      ],
      radius: 0.29,
      label: "河冠王国",
      summary: "覆盖盆地与山口的河谷王国。",
      importance: "required",
    },
  ],
  scenery: [
    {
      ownerEntityId: "natural-mountains",
      subtype: "wonder",
      title: "断冠雪隘",
      rationale: "山链决定大陆水源、交通与北境防线，具有世界级影响。",
      prompt: "广角中世纪奇幻风景画，断裂雪山与唯一山口，不出现文字、边框或水印。",
    },
    {
      ownerEntityId: "human-kingdom",
      subtype: "capital",
      title: "河冠王都",
      rationale: "重要王国必须展示位于两河汇流处的首都。",
      prompt: "广角中世纪河谷王都，两河汇流、石桥和城墙，符合盆地农业与山口贸易，不出现文字或水印。",
    },
  ],
}

describe("NovelX world visual materialization", () => {
  test("builds a deterministic authoritative Thiessen mesh and sparse image queue", async () => {
    const first = await compileWorldVisuals({ blueprint, materialization, profile, now: 10 })
    const second = await compileWorldVisuals({ blueprint, materialization, profile, now: 10 })
    expect(first.manifest.atlas.cells).toHaveLength(72)
    expect(first.manifest.atlas.meshSha256).toBe(second.manifest.atlas.meshSha256)
    expect(first.manifest.atlas.semanticMaskSha256).toBe(second.manifest.atlas.semanticMaskSha256)
    expect(first.maskBytes.subarray(1, 4).toString()).toBe("PNG")
    expect(first.manifest.tasks.map((task) => [task.type, task.subtype])).toEqual([
      ["map", "world-map"],
      ["scenery", "wonder"],
      ["scenery", "capital"],
    ])
    expect(
      first.manifest.atlas.features.find((feature) => feature.entityId === "natural-basin")!.cellIds.length,
    ).toBeGreaterThan(1)
    const basin = first.manifest.atlas.features.find((feature) => feature.entityId === "natural-basin")!
    const mountains = first.manifest.atlas.features.find((feature) => feature.entityId === "natural-mountains")!
    expect(basin.rings.length).toBeGreaterThan(0)
    expect(mountains.rings.length).toBeGreaterThan(0)
    expect(basin.cellIds.filter((cellId) => mountains.cellIds.includes(cellId))).toEqual([])
    expect(
      first.manifest.atlas.cells.every((cell) =>
        cell.geographyAreaEntityId ? ["natural-basin", "natural-mountains"].includes(cell.geographyAreaEntityId) : true,
      ),
    ).toBe(true)
    expect(verifyWorldVisuals({ manifest: first.manifest, materialization })).toEqual(first.manifest)
  })

  test("fills a display task when an important polity has no explicit scenery", async () => {
    const compiled = await compileWorldVisuals({
      blueprint,
      materialization,
      profile: { ...profile, scenery: profile.scenery.filter((item) => item.ownerEntityId !== "human-kingdom") },
      now: 10,
    })

    expect(compiled.manifest.tasks).toContainEqual(
      expect.objectContaining({
        type: "scenery",
        subtype: "emblem",
        ownerEntityId: "human-kingdom",
        title: "河冠王国徽记",
        status: "queued",
      }),
    )
  })

  test("detaches an invalid cross-layer spatial parent instead of blocking the display", async () => {
    const compiled = await compileWorldVisuals({
      blueprint,
      materialization,
      profile: {
        ...profile,
        claims: profile.claims.map((claim) =>
          claim.entityId === "human-kingdom" ? { ...claim, parentEntityId: "natural-basin" } : claim,
        ),
      },
      now: 10,
    })

    expect(
      compiled.manifest.atlas.features.find((feature) => feature.entityId === "human-kingdom")?.parentEntityId,
    ).toBeNull()
  })

  test("enforces resumable queue transitions and rejects stale world facts", async () => {
    const compiled = await compileWorldVisuals({ blueprint, materialization, profile, now: 10 })
    const task = compiled.manifest.tasks[0]!
    expect(() =>
      updateImageTask({ manifest: compiled.manifest, taskId: task.id, status: "attached", now: 11 }),
    ).toThrow("may not transition")
    const generating = updateImageTask({
      manifest: compiled.manifest,
      taskId: task.id,
      status: "generating",
      now: 11,
      model: "openai-compatible/gpt-image-2",
    })
    const failed = updateImageTask({
      manifest: generating,
      taskId: task.id,
      status: "failed",
      now: 12,
      errorCode: "NOVELX_IMAGE_PROVIDER_TIMEOUT",
    })
    const retrying = updateImageTask({
      manifest: failed,
      taskId: task.id,
      status: "generating",
      now: 13,
      model: "openai-compatible/gpt-image-2",
    })
    expect(retrying.tasks[0]?.completedAt).toBeNull()
    expect(retrying.tasks[0]?.errorCode).toBeNull()
    const validating = updateImageTask({ manifest: retrying, taskId: task.id, status: "validating", now: 14 })
    const attached = updateImageTask({
      manifest: validating,
      taskId: task.id,
      status: "attached",
      now: 15,
      model: "openai-compatible/gpt-image-2",
      mime: "image/png",
      assetSha256: "f".repeat(64),
    })
    expect(attached.tasks[0]?.status).toBe("attached")
    expect(() =>
      verifyWorldVisuals({
        manifest: attached,
        materialization: { ...materialization, integritySha256: "0".repeat(64) },
      }),
    ).toThrow("stale world facts")
  })
})
