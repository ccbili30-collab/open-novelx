import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { abortGeographyDocument } from "@/novelx/geography-materialization"
import { Tool } from "@/tool/tool"
import {
  assertGrowthEditor,
  loadGeographyRuntime,
  persistGeographyMaterialization,
  withGeographyMutation,
} from "./novelx-geography-runtime"

const TOOL_ID = "novelx_abort_geography"
export const Parameters = Schema.Struct({
  terrainId: Schema.String,
  taskSessionId: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
})

type Metadata = { terrainId: string; taskSessionId: string | null }

export const NovelXAbortGeographyTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Preserve a stopped geography branch and put it into waiting_user without marking it complete.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withGeographyMutation(
          Effect.gen(function* () {
            assertGrowthEditor(ctx)
            const runtime = yield* loadGeographyRuntime(fs)
            const next = abortGeographyDocument({
              manifest: runtime.materialization,
              skeleton: runtime.skeleton,
              terrainId: params.terrainId,
              ownerSessionId: ctx.sessionID,
              taskSessionId: params.taskSessionId,
              errorCode: params.reason ? `NOVELX_GEOGRAPHY_STOPPED: ${params.reason}` : undefined,
              now: Date.now(),
            })
            yield* persistGeographyMaterialization(fs, events, runtime, next)
            return {
              title: "地理任务等待用户",
              metadata: { terrainId: params.terrainId, taskSessionId: params.taskSessionId ?? null },
              output:
                "用户停止了这段编辑。该分支草稿已保留，未提交为正式文件。请询问用户停止原因；其他独立分支可以继续。",
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
