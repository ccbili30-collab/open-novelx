import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Tool } from "@/tool/tool"
import { assertWorldGrowthEditor, loadWorldRuntime } from "./novelx-world-runtime"

const TOOL_ID = "novelx_recover_growth_context"
export const Parameters = Schema.Struct({})
type Metadata = { completedStages: number; nextStageId: string | null; contextEpoch: number }

export const NovelXRecoverGrowthContextTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description:
        "Recover the authoritative Growth dispatch context after compaction from the blueprint, deterministic ledger, sealed handoffs, checkpoints, and source hashes.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          assertWorldGrowthEditor(ctx)
          const runtime = yield* loadWorldRuntime(fs)
          if (runtime.materialization.growthSessionId !== ctx.sessionID) {
            throw new Error("NOVELX_WORLD_EDITOR_SESSION_INVALID: Growth session does not own this world run.")
          }
          const completed = new Set(
            runtime.materialization.stages
              .filter((stage) => stage.status === "completed")
              .map((stage) => stage.stageId),
          )
          const nextStage = runtime.blueprint.stages.find((stage) => {
            const state = runtime.materialization.stages.find((item) => item.stageId === stage.id)
            return state?.status !== "completed" && stage.dependsOnStageIds.every((dependency) => completed.has(dependency))
          })
          const recovery = {
            blueprint: runtime.blueprint,
            run: {
              schemaVersion: runtime.materialization.schemaVersion,
              status: runtime.materialization.status,
              growthSessionId: runtime.materialization.growthSessionId,
              integritySha256: runtime.materialization.integritySha256,
            },
            stages: runtime.blueprint.stages.map((stage) => {
              const state = runtime.materialization.stages.find((item) => item.stageId === stage.id)!
              return {
                blueprint: stage,
                status: state.status,
                editorSessionId: state.editorSessionId,
                handoff: state.handoff,
                checkpoint: runtime.materialization.memoryCheckpoints.find((item) => item.stageId === stage.id) ?? null,
                sources: state.entities.map((entity) => {
                  const document = runtime.materialization.documents.find((item) => item.entityId === entity.id)!
                  return {
                    entityId: entity.id,
                    name: entity.name,
                    typeLabel: entity.typeLabel,
                    targetPath: document.targetPath,
                    committedSha256: document.committedSha256,
                  }
                }),
              }
            }),
            nextStageId: nextStage?.id ?? null,
          }
          return {
            title: "Growth 权威上下文已恢复",
            metadata: {
              completedStages: completed.size,
              nextStageId: nextStage?.id ?? null,
              contextEpoch: runtime.materialization.memoryCheckpoints.length,
            },
            output: [
              "Recovery Pack（权威恢复包）：",
              "```json",
              JSON.stringify(recovery, null, 2),
              "```",
              nextStage
                ? `下一步只派发阶段主编处理 ${nextStage.id} | ${nextStage.label}。`
                : "当前没有依赖就绪的未完成阶段；若全部完成则调用 novelx_finish_world，否则失败关闭。",
            ].join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
