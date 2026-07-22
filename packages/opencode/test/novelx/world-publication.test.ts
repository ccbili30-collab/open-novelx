import { describe, expect, test } from "bun:test"
import { NovelXWorld, NovelXWorldVisual } from "@opencode-ai/schema"
import {
  commitWorldPublication,
  createWorldPublication,
  verifyWorldPublication,
} from "../../src/novelx/world-publication"
import { worldVisualRegistrationSha256 } from "../../src/novelx/world-visual"

const sha = (value: string) => value.repeat(64)
const entity: NovelXWorld.RegisteredEntity = {
  id: "mirror-lake",
  stageId: "natural",
  name: "镜盐湖",
  typeLabel: "高原盐湖",
  ordinal: 1,
  summary: "季节性水位变化显著的高原盐湖。",
  facts: [
    { label: "位置", detail: "位于三门高原中央低地。" },
    { label: "水文", detail: "春季融雪补水，夏末蒸发析盐。" },
    { label: "通行", detail: "盐壳只在旱季部分可行。" },
  ],
  constraints: ["不得把盐壳描述为全年稳定道路。"],
  upstreamBindings: [],
  status: "registered",
}
const materialization = {
  schemaVersion: 2,
  stage: "world_materialization",
  status: "completed",
  blueprintIntegritySha256: sha("a"),
  growthSessionId: "growth",
  startedAt: 1,
  updatedAt: 2,
  stages: [
    {
      stageId: "natural",
      status: "completed",
      editorSessionId: "editor",
      sourceReads: [],
      preparedContextSha256: sha("b"),
      preparedAt: 1,
      registeredAt: 1,
      entities: [entity],
      relations: [],
      handoff: {
        sealedAt: 2,
        editorSessionId: "editor",
        entityIds: [entity.id],
        sourceEntityIds: [],
        documents: [{ entityId: entity.id, sha256: sha("c") }],
        navigationSummary: "自然阶段已封存。",
        integritySha256: sha("d"),
      },
    },
  ],
  documents: [
    {
      entityId: entity.id,
      stageId: "natural",
      targetPath: "World/01-自然/镜盐湖.md",
      draftPath: ".novelx/growth/world-drafts/mirror-lake.md",
      status: "committed",
      lease: null,
      taskSessionId: "writer",
      draftSha256: sha("c"),
      committedSha256: sha("c"),
      updatedAt: 2,
      errorCode: null,
    },
  ],
  memoryCheckpoints: [],
  integritySha256: sha("e"),
} as NovelXWorld.WorldMaterialization
const visual = {
  worldMaterializationIntegritySha256: materialization.integritySha256,
  integritySha256: sha("f"),
  tasks: [
    {
      type: "scenery",
      subtype: "wonder",
      ownerEntityId: entity.id,
    },
  ],
} as unknown as NovelXWorldVisual.Manifest

const atlas = `# 镜盐湖

镜盐湖位于三门高原中央的低地。春季融雪沿短河汇入湖盆，水面会越过旧盐线；进入夏末以后，干燥空气和持续蒸发让湖岸向内退去，裸露出一圈又一圈颜色不同的盐壳。

这种季节变化决定了道路。商队只在旱季沿经过探查的浅色盐带穿越湖盆，雨雪稍多的年份则宁愿绕行北岸。盐壳下方仍可能保留软泥和卤水，所以当地向导通常用长杆检查前路，不把旧车辙当成可靠标记。

湖盐让附近聚落能够参与远距离交换，也带来严格的取盐次序。岸边没有永久码头，只有随水位移动的木桩和临时棚屋。对旅人来说，这里最重要的并不是开阔景色，而是季节、风向和一条看似坚硬的白路是否真的能承重。

北岸的聚落因此把历年的水线刻在岩壁上。那些刻痕不是纪念物，而是决定当年应当修哪条坡道、把仓棚移到哪里，以及盐队何时可以启程的日常尺度。
`
const travelogue = `# 镜盐湖纪行

署名：随盐队南下的账房

我们在霜月后的第四天从北岸下到湖盆。领路人不许车轮压着去年的辙走，说那下面可能已经空了。我原以为他只是想多收一天向导钱，直到前车的驮马在一块灰白盐壳上陷到膝盖，才把账本和干粮都挪到自己背上。

午后风从湖心吹来，盐粉钻进衣领，也落在算盘缝里。远处的水面很亮，像就在几十步外，走了半个时辰却没有近多少。队里有人想抄近路，被领路人骂了回去。那天我们只走到旧木桩，在背风面扎营，晚饭的汤甚至不用再放盐。

第二天离开时，我在账上多记了两只破口盐袋和半日工钱。至于这片湖究竟有多大，我没有问明白；在这里，能不能把货和牲口带到对岸，比里数更要紧。

到南岸以后，我花了一个晚上清理算盘里的盐。领路人看了一眼，只说回程若遇上暖风，就不要再走原路。我把这句话记在货损下面，没有另作解释。
`

describe("NovelX player publication", () => {
  test("plans one atlas per entity and one additional travelogue per wonder", () => {
    const manifest = createWorldPublication({ materialization, visual, now: 3 })
    expect(manifest.records.map((record) => record.kind)).toEqual(["atlas", "travelogue"])
    const first = commitWorldPublication({
      manifest,
      entityId: entity.id,
      kind: "atlas",
      sourceSha256: sha("c"),
      markdown: atlas,
      now: 4,
    })
    expect(first.manifest.status).toBe("writing")
    const second = commitWorldPublication({
      manifest: first.manifest,
      entityId: entity.id,
      kind: "travelogue",
      sourceSha256: sha("c"),
      markdown: travelogue,
      now: 5,
    })
    expect(second.manifest.status).toBe("ready")
    expect(verifyWorldPublication(second.manifest)).toEqual(second.manifest)
  })

  test("keeps publication current while registered image tasks advance independently", () => {
    const publication = createWorldPublication({ materialization, visual, now: 3 })
    const progressed = {
      ...visual,
      status: "generating",
      integritySha256: sha("9"),
      tasks: visual.tasks.map((task) => ({
        ...task,
        status: "generating",
        model: "openai-compatible/gpt-image-2",
        startedAt: 4,
      })),
    } as unknown as NovelXWorldVisual.Manifest
    expect(worldVisualRegistrationSha256(progressed)).toBe(worldVisualRegistrationSha256(visual))
    expect(
      verifyWorldPublication(publication, {
        materializationSha256: materialization.integritySha256,
        visualSha256: worldVisualRegistrationSha256(progressed),
      }),
    ).toEqual(publication)
  })

  test("fails closed on internal production vocabulary and missing travelogue byline", () => {
    const manifest = createWorldPublication({ materialization, visual, now: 3 })
    expect(() =>
      commitWorldPublication({
        manifest,
        entityId: entity.id,
        kind: "atlas",
        sourceSha256: sha("c"),
        markdown: `${atlas}\n## 事实依据\n内部字段。`,
        now: 4,
      }),
    ).toThrow("internal production vocabulary")
    expect(() =>
      commitWorldPublication({
        manifest,
        entityId: entity.id,
        kind: "travelogue",
        sourceSha256: sha("c"),
        markdown: travelogue.replace("署名：随盐队南下的账房\n", ""),
        now: 4,
      }),
    ).toThrow("byline")
  })
})
