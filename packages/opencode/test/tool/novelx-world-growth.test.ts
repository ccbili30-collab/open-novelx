import { afterEach, describe, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { SessionCompaction } from "@/session/compaction"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { Truncate } from "@/tool/truncate"
import { NovelXRegisterWorldBlueprintTool } from "@/tool/novelx-register-world-blueprint"
import { NovelXPrepareWorldStageTool } from "@/tool/novelx-prepare-world-stage"
import { NovelXRegisterWorldStageTool } from "@/tool/novelx-register-world-stage"
import { NovelXPrepareWorldDocumentTool } from "@/tool/novelx-prepare-world-document"
import { NovelXCommitWorldDocumentTool } from "@/tool/novelx-commit-world-document"
import { NovelXFinishWorldStageTool } from "@/tool/novelx-finish-world-stage"
import { NovelXCheckpointGrowthMemoryTool } from "@/tool/novelx-checkpoint-growth-memory"
import { NovelXRecoverGrowthContextTool } from "@/tool/novelx-recover-growth-context"
import { NovelXFinishWorldTool } from "@/tool/novelx-finish-world"
import { ToolRegistry } from "@/tool/registry"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const layer = LayerNode.compile(
  LayerNode.group([
    Agent.node,
    BackgroundJob.node,
    Config.node,
    CrossSpawnSpawner.node,
    Database.node,
    EventV2Bridge.node,
    FSUtil.node,
    Ripgrep.node,
    RuntimeFlags.node,
    Session.node,
    SessionCompaction.node,
    SessionProjector.node,
    SessionRunState.node,
    SessionStatus.node,
    ToolRegistry.node,
    Truncate.node,
  ]),
)
const it = testEffect(layer)
const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

afterEach(async () => {
  await disposeAllInstances()
})

describe("NovelX editorial world tools", () => {
  it.instance(
    "runs root to stage-editor to leaf, seals the stage, and creates a real compaction checkpoint",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const sessions = yield* Session.Service
        const root = yield* sessions.create({ title: "Growth", agent: "growth" })
        const rootAssistant = yield* assistantMessage(sessions, root.id, "growth")
        const rootContext = context(root.id, rootAssistant.id, "growth", "call-growth")
        const blueprintTool = yield* (yield* NovelXRegisterWorldBlueprintTool).init()
        const blueprintResult = yield* blueprintTool.execute(
          {
            title: "日环档案",
            genre: { family: "science fiction", label: "轨道殖民科技题材", scale: "单恒星系" },
            designSummary: "从恒星辐射、轨道窗口和能源约束出发建立一个可继续推演的科技世界。",
            stages: [
              {
                label: "恒星与轨道环境",
                purpose: "建立后续设施与组织必须遵守的能源、辐射、通信和通行边界。",
                itemCount: 1,
                dependsOnStageIndices: [],
                reasoningFocus: ["辐射怎样限制长期活动", "轨道窗口怎样限制交通和维护"],
                documentSections: ["空间结构", "物理环境", "资源与通行", "风险与边界"],
              },
            ],
          },
          rootContext,
        )
        const stageId = blueprintResult.metadata.stages[0]!.id
        const stageSession = yield* sessions.create({
          parentID: root.id,
          title: "阶段：恒星与轨道环境",
          agent: "novelx-stage-editor",
        })
        const stageAssistant = yield* assistantMessage(sessions, stageSession.id, "novelx-stage-editor")
        const stageContext = context(stageSession.id, stageAssistant.id, "novelx-stage-editor", "call-stage")
        const prepareStage = yield* (yield* NovelXPrepareWorldStageTool).init()
        const prepared = yield* prepareStage.execute({ stageId }, stageContext)
        const registerStage = yield* (yield* NovelXRegisterWorldStageTool).init()
        const registered = yield* registerStage.execute(
          {
            stageId,
            contextSha256: prepared.metadata.contextSha256,
            entities: [
              {
                name: "赫利俄斯同步环",
                typeLabel: "采能与通信轨道带",
                summary: "围绕恒星多组共振轨道运行的采能和通信设施集合，为系统提供能源与时间基准。",
                facts: [
                  { label: "轨道", detail: "主要节点通过共振轨道轮换避开周期性高粒子流。" },
                  { label: "能源", detail: "近星阵列提供高密度能源，输出受散热和材料疲劳限制。" },
                  { label: "通信", detail: "中继形成统一时标，恒星遮挡仍造成周期性断联窗口。" },
                ],
                constraints: ["强辐射与散热上限使载人维护只能在有限窗口进行。"],
                upstreamBindings: [],
              },
            ],
            relations: [],
          },
          { ...stageContext, callID: "call-stage-register" },
        )
        const entity = registered.metadata.entities[0]!
        const prepareDocument = yield* (yield* NovelXPrepareWorldDocumentTool).init()
        const preparedDocument = yield* prepareDocument.execute(
          { entityId: entity.id },
          { ...stageContext, callID: "call-document-prepare" },
        )
        expect(preparedDocument.output).toContain("Context Pack")
        const leaf = yield* sessions.create({
          parentID: stageSession.id,
          title: "世界：赫利俄斯同步环",
          agent: "novelx-world-writer",
        })
        yield* assistantMessage(sessions, leaf.id, "novelx-world-writer", dossier("赫利俄斯同步环"))
        const commit = yield* (yield* NovelXCommitWorldDocumentTool).init()
        const committed = yield* commit.execute(
          { entityId: entity.id, taskSessionId: leaf.id },
          { ...stageContext, callID: "call-document-commit" },
        )
        expect(committed.metadata.sha256).toHaveLength(64)
        const finishStage = yield* (yield* NovelXFinishWorldStageTool).init()
        const sealed = yield* finishStage.execute(
          {
            stageId,
            navigationSummary: "赫利俄斯同步环封存了能源、辐射、通信与维护窗口的自然底座。",
          },
          { ...stageContext, callID: "call-stage-finish" },
        )
        expect(sealed.metadata.handoffSha256).toHaveLength(64)
        const checkpoint = yield* (yield* NovelXCheckpointGrowthMemoryTool).init()
        const checkpointed = yield* checkpoint.execute(
          { stageId },
          { ...rootContext, callID: "call-checkpoint" },
        )
        expect(checkpointed.metadata.contextEpoch).toBe(1)
        const messages = yield* sessions.messages({ sessionID: root.id })
        const compactionPart = messages
          .flatMap((message) => message.parts)
          .find((part) => part.type === "compaction")
        expect(compactionPart).toMatchObject({ type: "compaction", auto: true })
        const recover = yield* (yield* NovelXRecoverGrowthContextTool).init()
        const recovered = yield* recover.execute({}, { ...rootContext, callID: "call-recover" })
        expect(recovered.metadata).toMatchObject({ completedStages: 1, nextStageId: null, contextEpoch: 1 })
        expect(recovered.output).toContain(sealed.metadata.handoffSha256)
        const finish = yield* (yield* NovelXFinishWorldTool).init()
        const finished = yield* finish.execute({}, { ...rootContext, callID: "call-finish" })
        expect(finished.metadata).toMatchObject({ stages: 1, documents: 1 })
        const state = JSON.parse(
          yield* Effect.promise(() =>
            fs.readFile(path.join(test.directory, ".novelx", "growth", "world-materialization.json"), "utf8"),
          ),
        )
        expect(state).toMatchObject({ schemaVersion: 2, status: "completed" })
        expect(state.stages[0]).toMatchObject({ editorSessionId: stageSession.id, status: "completed" })
        expect(state.documents[0]).toMatchObject({ taskSessionId: leaf.id, status: "committed" })
        expect(state.memoryCheckpoints[0].compactionMessageId).toBe(checkpointed.metadata.compactionMessageId)
      }),
    { timeout: 30_000 },
  )
})

function context(sessionID: SessionID, messageID: MessageID, agent: string, callID: string) {
  return {
    sessionID,
    messageID,
    callID,
    agent,
    abort: new AbortController().signal,
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
}

function assistantMessage(sessions: Session.Interface, sessionID: SessionID, agent: string, text?: string) {
  return Effect.gen(function* () {
    const assistant: SessionV1.Assistant = {
      id: MessageID.ascending(),
      role: "assistant",
      parentID: MessageID.ascending(),
      sessionID,
      mode: agent,
      agent,
      cost: 0,
      path: { cwd: "/tmp", root: "/tmp" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: ref.modelID,
      providerID: ref.providerID,
      time: { created: Date.now() },
      finish: "stop",
    }
    yield* sessions.updateMessage(assistant)
    if (text) {
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: assistant.id,
        sessionID,
        type: "text",
        text,
      })
    }
    return assistant
  })
}

function dossier(name: string) {
  const paragraph =
    "这里依据已经注册的轨道、能源、通信和维护约束给出具体结论。高粒子流要求节点轮换，散热上限限制连续输出，恒星遮挡形成通信窗口，因此任何长期活动都必须保留冗余和离线处置能力。结论不假设无限能源、即时通信或无成本材料。"
  return `# ${name}

## 事实依据

${paragraph}${paragraph}

## 因果推演

${paragraph}${paragraph}

## 空间结构

${paragraph}${paragraph}

## 物理环境

${paragraph}${paragraph}

## 资源与通行

${paragraph}${paragraph}

## 风险与边界

${paragraph}${paragraph}
`
}
