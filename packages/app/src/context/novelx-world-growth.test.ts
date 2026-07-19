import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { NovelXWorld } from "@opencode-ai/schema"
import {
  novelXWorldNavigationItems,
  parseNovelXWorldBlueprint,
  parseNovelXWorldMaterialization,
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
    dependencyEntityIds: [],
    status: "registered" as const,
  }
  const materializationDraft = {
    schemaVersion: 1 as const,
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
        preparedContextSha256: "a".repeat(64),
        preparedAt: 2,
        registeredAt: 3,
        entities: [entity],
        relations: [],
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
  }
  const materialization = { ...materializationDraft, integritySha256: sha256(materializationDraft) }
  expect(await parseNovelXWorldMaterialization(JSON.stringify(materialization), blueprint.integritySha256)).toEqual(
    materialization,
  )
  expect(novelXWorldNavigationItems(blueprint, materialization).map((item) => [item.kind, item.label])).toEqual([
    ["stage", "轨道环境"],
    ["entity", "赫利俄斯同步环"],
  ])
})
