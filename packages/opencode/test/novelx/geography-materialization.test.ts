import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { NovelXGrowth } from "@opencode-ai/schema"
import { compileNovelXGrowthSkeleton } from "../../src/novelx/growth-skeleton"
import {
  abortGeographyDocument,
  commitGeographyDocument,
  createGeographyMaterialization,
  finishGeographyMaterialization,
  geographyContextPacket,
  prepareGeographyDocument,
  verifyGeographyMaterialization,
} from "../../src/novelx/geography-materialization"
import { fantasyTerrain } from "./growth-skeleton.fixture"

const skeleton = compileNovelXGrowthSkeleton({
  profile: fantasyTerrain,
  source: { sessionId: "ses-growth", messageId: "msg-growth", toolCallId: "call-growth", registeredAt: 100 },
})

const document = (name: string) => `# ${name}

## 事实依据

这里依据地形在大陆中的方位、海拔、相邻水域、父级区域与已经注册的空间关系进行说明，所有结论都引用已知事实而不是凭空添加国家。

## 因果推演

方位和地势共同影响温度、降水与水流方向；若结论偏离通常自然规律，必须由已经注册的奇幻规则或相邻地形关系解释。

## 地貌与空间

地貌轮廓、内部高差、边缘过渡和主要通道形成连续空间，不使用互相冲突的方位，也不把尚未注册的聚落当成事实。

## 气候与生态

气温、风向、降水、季节变化和植被依据纬度、海拔、临海程度与屏障关系推算，并说明局部环境与整体气候之间的区别。

## 资源与通行

水源、土壤、岩石、林地、通行难度和天然通道均由地貌条件推导，只描述可能性，不提前创造具体国家、组织或角色。

## 风险与限制

极端天气、山洪、崩塌、干旱、风暴或航行风险与地形形成逻辑保持一致，同时明确当前资料无法支持的细节边界。

## 关系

本区域与父级地形、相邻区域和水系端点保持已注册关系；后续世界内容只能读取正式提交版本，不能依赖当前草稿。

推演还会交叉检查方向、距离、高差、河流上下游和海陆边界。任何看似反常的气候或生态都必须指出具体原因，例如异常洋流、山口狭管效应或已注册的奇幻自然规则；如果没有这些证据，就采用符合现有地形事实的保守结论。文档只给后续国家和文明阶段提供可引用的自然条件，不在当前阶段替主编决定居民、政权、历史事件或故事结果。
`

describe("NovelX geography materialization", () => {
  test("creates deterministic document records and a grounded context packet", () => {
    const first = createGeographyMaterialization({ skeleton, growthSessionId: "ses-growth", now: 200 })
    const second = createGeographyMaterialization({ skeleton, growthSessionId: "ses-growth", now: 200 })
    expect(second).toEqual(first)
    expect(Schema.decodeUnknownSync(NovelXGrowth.GeographyMaterialization)(first)).toEqual(first)
    expect(first.records).toHaveLength(skeleton.terrain.nodes.length)
    expect(first.records[0]?.targetPath).toBe("World/地理/埃兰大陆.md")
    expect(geographyContextPacket(skeleton, skeleton.terrain.nodes[3]!.id)).toMatchObject({
      terrain: { name: "北境冠脉" },
      parent: { name: "埃兰大陆" },
    })
  })

  test("leases, commits and replays exactly one geography document", () => {
    const initial = createGeographyMaterialization({ skeleton, growthSessionId: "ses-growth", now: 200 })
    const terrain = skeleton.terrain.nodes[0]!
    const prepared = prepareGeographyDocument({
      manifest: initial,
      skeleton,
      terrainId: terrain.id,
      ownerSessionId: "ses-growth",
      ownerMessageId: "msg-prepare",
      now: 201,
    })
    expect(prepared.record.status).toBe("leased")
    const committed = commitGeographyDocument({
      manifest: prepared.manifest,
      skeleton,
      terrainId: terrain.id,
      ownerSessionId: "ses-growth",
      taskSessionId: "ses-child",
      draft: document(terrain.name),
      now: 202,
    })
    expect(committed.record.status).toBe("committed")
    expect(committed.manifest.records[0]?.lease).toBeNull()
    expect(
      commitGeographyDocument({
        manifest: committed.manifest,
        skeleton,
        terrainId: terrain.id,
        ownerSessionId: "ses-growth",
        taskSessionId: "ses-child",
        draft: document(terrain.name),
        now: 203,
      }).replayed,
    ).toBe(true)
  })

  test("fails closed for another editor, invalid drafts and tampering", () => {
    const initial = createGeographyMaterialization({ skeleton, growthSessionId: "ses-growth", now: 200 })
    const terrain = skeleton.terrain.nodes[0]!
    expect(() =>
      prepareGeographyDocument({
        manifest: initial,
        skeleton,
        terrainId: terrain.id,
        ownerSessionId: "ses-other",
        ownerMessageId: "msg-other",
        now: 201,
      }),
    ).toThrow("Only the Growth editor")
    const prepared = prepareGeographyDocument({
      manifest: initial,
      skeleton,
      terrainId: terrain.id,
      ownerSessionId: "ses-growth",
      ownerMessageId: "msg-prepare",
      now: 201,
    })
    expect(() =>
      commitGeographyDocument({
        manifest: prepared.manifest,
        skeleton,
        terrainId: terrain.id,
        ownerSessionId: "ses-growth",
        taskSessionId: "ses-child",
        draft: `# ${terrain.name}\n\n待填充`,
        now: 202,
      }),
    ).toThrow()
    expect(() =>
      verifyGeographyMaterialization({
        manifest: { ...initial, growthSessionId: "tampered" },
        skeleton,
      }),
    ).toThrow("integrity check failed")
  })

  test("preserves a stopped branch and only finishes after every document commits", () => {
    const initial = createGeographyMaterialization({ skeleton, growthSessionId: "ses-growth", now: 200 })
    const terrain = skeleton.terrain.nodes[0]!
    const prepared = prepareGeographyDocument({
      manifest: initial,
      skeleton,
      terrainId: terrain.id,
      ownerSessionId: "ses-growth",
      ownerMessageId: "msg-prepare",
      now: 201,
    })
    const stopped = abortGeographyDocument({
      manifest: prepared.manifest,
      skeleton,
      terrainId: terrain.id,
      ownerSessionId: "ses-growth",
      taskSessionId: "ses-child",
      now: 202,
    })
    expect(stopped.records[0]).toMatchObject({ status: "waiting_user", lease: null, taskSessionId: "ses-child" })
    expect(stopped.records.slice(1).every((record) => record.status === "registered")).toBe(true)
    expect(() =>
      finishGeographyMaterialization({ manifest: stopped, skeleton, ownerSessionId: "ses-growth", now: 203 }),
    ).toThrow("not committed")
  })
})
