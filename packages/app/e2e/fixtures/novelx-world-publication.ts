import type { NovelXWorld } from "@opencode-ai/schema"

export async function completedWorldFixtures(materialization: NovelXWorld.WorldMaterialization) {
  const completedMaterialization = await completedWorldMaterializationFixture(materialization)
  const visual = await worldVisualFixture(completedMaterialization)
  const publication = await worldPublicationFixture(completedMaterialization, visual)
  return {
    materialization: completedMaterialization,
    visual,
    publication,
    atlasText: atlasPublicationText(),
    travelogueText: traveloguePublicationText(),
  }
}

async function completedWorldMaterializationFixture(materialization: NovelXWorld.WorldMaterialization) {
  const committedSha256 = "b".repeat(64)
  const draft = {
    schemaVersion: 2 as const,
    stage: "world_materialization" as const,
    status: "completed" as const,
    blueprintIntegritySha256: materialization.blueprintIntegritySha256,
    growthSessionId: materialization.growthSessionId,
    startedAt: materialization.startedAt,
    updatedAt: 1700000004000,
    stages: materialization.stages.map((stage) => ({
      ...stage,
      status: "completed" as const,
    })),
    documents: materialization.documents.map((document) => ({
      ...document,
      status: "committed" as const,
      lease: null,
      taskSessionId: "ses_child",
      draftSha256: committedSha256,
      committedSha256,
      updatedAt: 1700000004000,
      errorCode: null,
    })),
    memoryCheckpoints: materialization.memoryCheckpoints,
  }
  return { ...draft, integritySha256: await testSha256(draft) }
}

async function worldVisualFixture(
  materialization: Awaited<ReturnType<typeof completedWorldMaterializationFixture>>,
) {
  const entity = materialization.stages[0]!.entities[0]!
  const sourceSha256 = materialization.documents[0]!.committedSha256!
  const cells = Array.from({ length: 24 }, (_, index) => {
    const column = index % 6
    const row = Math.floor(index / 6)
    const left = column / 6
    const right = (column + 1) / 6
    const top = row / 4
    const bottom = (row + 1) / 4
    const id = `cell-${index + 1}`
    const neighborIds = [
      column > 0 ? `cell-${index}` : undefined,
      column < 5 ? `cell-${index + 2}` : undefined,
      row > 0 ? `cell-${index - 5}` : undefined,
      row < 3 ? `cell-${index + 7}` : undefined,
    ].filter((value): value is string => !!value)
    return {
      id,
      center: { x: (left + right) / 2, y: (top + bottom) / 2 },
      polygon: [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ],
      neighborIds,
      surface: column < 3 ? ("plain" as const) : ("ocean" as const),
      geographyAreaEntityId: column < 3 ? entity.id : null,
      humanAreaEntityId: column < 3 ? entity.id : null,
      geographyLineEntityIds: [],
      humanLineEntityIds: [],
      pointEntityIds: [],
    }
  })
  const cellIds = cells.filter((cell) => cell.geographyAreaEntityId === entity.id).map((cell) => cell.id)
  const rings = [
    [
      { x: 0.02, y: 0.03 },
      { x: 0.5, y: 0.03 },
      { x: 0.5, y: 0.97 },
      { x: 0.02, y: 0.97 },
    ],
  ]
  const featureDetails = {
    parentEntityId: null,
    surface: "plain" as const,
    cellIds,
    rings,
    path: [],
    label: entity.name,
    labelPoint: { x: 0.26, y: 0.5 },
    summary: entity.summary,
    sourceSha256,
    importance: "required" as const,
  }
  const visualLanguage = "冷白恒星光照亮磨损的轨道结构，深空保持克制的灰蓝层次与可读轮廓。"
  const draft = {
    schemaVersion: 2 as const,
    stage: "world_visuals" as const,
    status: "ready" as const,
    worldMaterializationIntegritySha256: materialization.integritySha256,
    visualLanguage,
    visualLanguageSha256: await testSha256(visualLanguage),
    atlas: {
      id: "atlas-helios",
      title: "日环世界图册",
      width: 1024 as const,
      height: 1024 as const,
      seed: "helios-ring-e2e",
      meshSha256: await testSha256(cells),
      semanticMaskPath: ".novelx/visuals/world-map-semantic.png",
      semanticMaskSha256: "c".repeat(64),
      rasterPath: "World/Media/world-map.png",
      cells,
      features: [
        {
          entityId: entity.id,
          layer: "geography" as const,
          kind: "region" as const,
          geometry: "area" as const,
          ...featureDetails,
        },
        {
          entityId: entity.id,
          layer: "human" as const,
          kind: "polity" as const,
          geometry: "area" as const,
          ...featureDetails,
        },
      ],
    },
    tasks: [
      {
        id: "image-world-map",
        type: "map" as const,
        subtype: "world-map" as const,
        ownerEntityId: null,
        status: "attached" as const,
        title: "日环世界地图",
        prompt: "以俯视构图描绘恒星同步环、轨道阴影和深空边界，保留清楚的地理分区供交互覆盖。",
        rationale: "为世界地理与人文图层提供同一张权威美术底图。",
        sourceEntityIds: [entity.id],
        sourceSha256s: [sourceSha256],
        targetPath: "World/Media/world-map.png",
        mime: "image/png" as const,
        assetSha256: "d".repeat(64),
        model: "openai-compatible/gpt-image-2",
        startedAt: 1700000004100,
        completedAt: 1700000004200,
        errorCode: null,
      },
      {
        id: "image-helios-ring",
        type: "scenery" as const,
        subtype: "wonder" as const,
        ownerEntityId: entity.id,
        status: "attached" as const,
        title: "赫利俄斯同步环弧光",
        prompt: "从维护驿站的窄窗望向恒星同步环，冷亮弧光横过深空，画面一角保留无名旅人的尺度。",
        rationale: "同步环是世界中最具辨识度的公共奇观，应配套一篇个人纪行。",
        sourceEntityIds: [entity.id],
        sourceSha256s: [sourceSha256],
        targetPath: "World/Media/scenery/helios-ring.png",
        mime: "image/png" as const,
        assetSha256: "e".repeat(64),
        model: "openai-compatible/gpt-image-2",
        startedAt: 1700000004200,
        completedAt: 1700000004300,
        errorCode: null,
      },
    ],
    createdAt: 1700000004000,
    updatedAt: 1700000004300,
  }
  return { ...draft, integritySha256: await testSha256(draft) }
}

async function worldPublicationFixture(
  materialization: Awaited<ReturnType<typeof completedWorldMaterializationFixture>>,
  visual: Awaited<ReturnType<typeof worldVisualFixture>>,
) {
  const entity = materialization.stages[0]!.entities[0]!
  const source = materialization.documents[0]!
  const draft = {
    schemaVersion: 1 as const,
    stage: "world_publication" as const,
    status: "ready" as const,
    worldMaterializationIntegritySha256: materialization.integritySha256,
    worldVisualIntegritySha256: visual.integritySha256,
    records: [
      {
        id: "publication-helios-atlas",
        entityId: entity.id,
        kind: "atlas" as const,
        title: "赫利俄斯同步环图志",
        status: "committed" as const,
        sourcePath: source.targetPath,
        sourceSha256: source.committedSha256!,
        targetPath: "World/Atlas/entity-helios-ring/图志.md",
        committedSha256: await testSha256(atlasPublicationText()),
        updatedAt: 1700000004400,
      },
      {
        id: "publication-helios-travelogue",
        entityId: entity.id,
        kind: "travelogue" as const,
        title: "赫利俄斯同步环纪行",
        status: "committed" as const,
        sourcePath: source.targetPath,
        sourceSha256: source.committedSha256!,
        targetPath: "World/Atlas/entity-helios-ring/纪行.md",
        committedSha256: await testSha256(traveloguePublicationText()),
        updatedAt: 1700000004400,
      },
    ],
    createdAt: 1700000004400,
    updatedAt: 1700000004400,
  }
  return { ...draft, integritySha256: await testSha256(draft) }
}

function atlasPublicationText() {
  return [
    "# 赫利俄斯同步环图志",
    "",
    "环带在晨昏线外侧收拢成一条冷亮弧线。它不是完整的圆环，而是一组依靠共振窗口轮换位置的采能、通信与维护轨道。近星侧材料承受强辐射和热疲劳，背星侧则成为人员换班与货物转运的短暂安全区。",
    "",
    "从远处看，同步环像是恒星边缘一道经年不熄的刻痕；靠近之后，连续光带才分解为相隔遥远的镜阵、散热翼和驿站灯火。",
  ].join("\n")
}

function traveloguePublicationText() {
  return [
    "# 赫利俄斯同步环纪行",
    "",
    "署名：无名驿路抄写员",
    "",
    "我是在第三次警报之后看见那道弧光的。驿站刚转入背星面，舷窗外的恒星被遮光板削成一线，远处的镜阵却一节一节亮起来，像有人沿着黑暗点燃了没有尽头的路标。",
    "",
    "领航员不肯让我多看。他说再过十一分钟，粒子风会扫过这里，所有人都得回到内舱。于是我只来得及记下那道弧线，以及维修艇从它下方经过时小得像一粒灰。",
  ].join("\n")
}

async function testSha256(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
