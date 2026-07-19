import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { finishGeographyMaterialization } from "@/novelx/geography-materialization"
import { Tool } from "@/tool/tool"
import {
  assertGrowthEditor,
  loadGeographyRuntime,
  persistGeographyMaterialization,
  withGeographyMutation,
} from "./novelx-geography-runtime"

const TOOL_ID = "novelx_finish_geography"
export const Parameters = Schema.Struct({})
type Metadata = { documents: number }

export const NovelXFinishGeographyTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Finish the geography Growth stage only after every registered terrain document is committed.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        withGeographyMutation(
          Effect.gen(function* () {
            assertGrowthEditor(ctx)
            const runtime = yield* loadGeographyRuntime(fs)
            const next = finishGeographyMaterialization({
              manifest: runtime.materialization,
              skeleton: runtime.skeleton,
              ownerSessionId: ctx.sessionID,
              now: Date.now(),
            })
            yield* persistGeographyMaterialization(fs, events, runtime, next)
            return {
              title: "世界地理生长完成",
              metadata: { documents: next.records.length },
              output: `已完成 ${next.records.length} 个注册地形的详细档案。地图仍为空；没有进入国家、文明、角色、故事或图片阶段。`,
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
