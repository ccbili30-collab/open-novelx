import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { SessionCompaction } from "@/session/compaction"
import { MessageID, PartID } from "@/session/schema"
import { checkpointGrowthMemory } from "@/novelx/world-materialization"
import { Tool } from "@/tool/tool"
import {
  assertWorldGrowthEditor,
  loadWorldRuntime,
  persistWorldMaterialization,
  withWorldMutation,
} from "./novelx-world-runtime"

const TOOL_ID = "novelx_checkpoint_growth_memory"
export const Parameters = Schema.Struct({ stageId: Schema.String })
type Metadata = {
  stageId: string
  contextEpoch: number
  compactionMessageId: string
  replayed: boolean
}

export const NovelXCheckpointGrowthMemoryTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service | Session.Service | SessionCompaction.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const sessions = yield* Session.Service
    const compaction = yield* SessionCompaction.Service
    return {
      description:
        "Persist a sealed stage handoff in the deterministic Growth ledger and create a real OpenCode compaction marker for the next Context Epoch.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldGrowthEditor(ctx)
            const runtime = yield* loadWorldRuntime(fs)
            if (runtime.materialization.growthSessionId !== ctx.sessionID) {
              throw new Error("NOVELX_WORLD_EDITOR_SESSION_INVALID: Growth session does not own this world run.")
            }
            const stage = runtime.materialization.stages.find((item) => item.stageId === params.stageId)
            if (stage?.status !== "completed" || !stage.handoff) {
              throw new Error("NOVELX_WORLD_STAGE_HANDOFF_REQUIRED: Seal the stage before checkpointing Growth memory.")
            }
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [runtime.materializationPath],
              always: [runtime.materializationPath],
              metadata: {
                stageId: params.stageId,
                contextEpoch: runtime.materialization.memoryCheckpoints.length + 1,
              },
            })
            const marker = `<novelx-growth-checkpoint stage="${params.stageId}" handoff="${stage.handoff.integritySha256}"/>`
            const history = yield* sessions.messages({ sessionID: ctx.sessionID })
            const existingCheckpoint = runtime.materialization.memoryCheckpoints.find(
              (checkpoint) => checkpoint.stageId === params.stageId,
            )
            const recoveredMarker = history.findLast(
              (message) =>
                message.info.role === "user" &&
                message.parts.some((part) => part.type === "compaction") &&
                message.parts.some((part) => part.type === "text" && part.text === marker),
            )
            const assistant = history.findLast(
              (message) => message.info.id === ctx.messageID && message.info.role === "assistant",
            )
            if (!assistant || assistant.info.role !== "assistant") {
              throw new Error("NOVELX_GROWTH_MODEL_REQUIRED: Cannot determine the active Growth Provider model.")
            }
            const compactionMessageId = MessageID.make(
              existingCheckpoint?.compactionMessageId ??
              recoveredMarker?.info.id ??
              (yield* compaction.create({
                sessionID: ctx.sessionID,
                agent: "growth",
                model: { providerID: assistant.info.providerID, modelID: assistant.info.modelID },
                auto: false,
              })),
            )
            if (!existingCheckpoint && !recoveredMarker) {
              yield* sessions.updatePart({
                id: PartID.ascending(),
                messageID: compactionMessageId,
                sessionID: ctx.sessionID,
                type: "text",
                text: marker,
                synthetic: true,
              })
            }
            const checkpointed = checkpointGrowthMemory({
              manifest: runtime.materialization,
              blueprint: runtime.blueprint,
              stageId: params.stageId,
              ownerSessionId: ctx.sessionID,
              compactionMessageId,
              now: Date.now(),
            })
            yield* persistWorldMaterialization(fs, events, runtime, checkpointed.manifest)
            return {
              title: checkpointed.replayed ? "Growth 记忆检查点已存在" : "Growth 记忆检查点已创建",
              metadata: {
                stageId: params.stageId,
                contextEpoch: checkpointed.checkpoint.contextEpoch,
                compactionMessageId,
                replayed: checkpointed.replayed,
              },
              output: [
                `阶段 ${params.stageId} 已写入第 ${checkpointed.checkpoint.contextEpoch} 个权威记忆检查点。`,
                `OpenCode compaction message: ${compactionMessageId}`,
                "新的 Context Epoch 必须从蓝图、运行账本、封存交接和原文索引恢复；模型摘要不是世界事实。",
              ].join("\n"),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
