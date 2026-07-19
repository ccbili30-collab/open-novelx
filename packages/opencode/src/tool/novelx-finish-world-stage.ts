import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { finishWorldStage } from "@/novelx/world-materialization"
import { Tool } from "@/tool/tool"
import {
  assertWorldStageEditor,
  loadWorldRuntime,
  persistWorldMaterialization,
  withWorldMutation,
} from "./novelx-world-runtime"

const TOOL_ID = "novelx_finish_world_stage"
export const Parameters = Schema.Struct({ stageId: Schema.String, navigationSummary: Schema.String })
type Metadata = { stageId: string; handoffSha256: string; replayed: boolean }

export const NovelXFinishWorldStageTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description:
        "Seal the bound world stage after reviewing all committed dossiers. The Harness creates the authoritative handoff ledger; the summary is navigation only.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldStageEditor(ctx)
            const runtime = yield* loadWorldRuntime(fs)
            const finished = finishWorldStage({
              manifest: runtime.materialization,
              blueprint: runtime.blueprint,
              stageId: params.stageId,
              ownerSessionId: ctx.sessionID,
              navigationSummary: params.navigationSummary,
              now: Date.now(),
            })
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [runtime.materializationPath],
              always: [runtime.materializationPath],
              metadata: { stageId: params.stageId },
            })
            yield* persistWorldMaterialization(fs, events, runtime, finished.manifest)
            return {
              title: finished.replayed ? "世界阶段已封存" : "世界阶段审查完成",
              metadata: {
                stageId: params.stageId,
                handoffSha256: finished.stage.handoff!.integritySha256,
                replayed: finished.replayed,
              },
              output: [
                `阶段 ${params.stageId} 已封存。`,
                `Handoff SHA-256: ${finished.stage.handoff!.integritySha256}`,
                "返回 Growth 总主编；总主编必须调用 novelx_checkpoint_growth_memory 后才能开始下一阶段。",
              ].join("\n"),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
