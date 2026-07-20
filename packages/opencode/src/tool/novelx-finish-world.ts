import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { finishWorld } from "@/novelx/world-materialization"
import { Tool } from "@/tool/tool"
import {
  assertWorldGrowthEditor,
  loadWorldRuntime,
  persistWorldMaterialization,
  withWorldMutation,
} from "./novelx-world-runtime"

const TOOL_ID = "novelx_finish_world"
export const Parameters = Schema.Struct({})
type Metadata = { stages: number; documents: number }

export const NovelXFinishWorldTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Finish the World Growth surface only after every model-selected stage and dossier is committed.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldGrowthEditor(ctx)
            const runtime = yield* loadWorldRuntime(fs)
            const next = finishWorld({
              manifest: runtime.materialization,
              blueprint: runtime.blueprint,
              ownerSessionId: ctx.sessionID,
              now: Date.now(),
            })
            yield* persistWorldMaterialization(fs, events, runtime, next)
            return {
              title: "世界生长完成",
              metadata: { stages: next.stages.length, documents: next.documents.length },
              output: `模型注册的 ${next.stages.length} 个世界层、${next.documents.length} 份正式档案已经全部提交。下一步派发 novelx-visual-editor 注册地图与稀疏风貌队列；角色、故事、图谱事实和世界包均未开始。`,
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
