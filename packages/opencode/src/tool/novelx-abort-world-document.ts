import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { abortWorldDocument } from "@/novelx/world-materialization"
import { Tool } from "@/tool/tool"
import {
  assertWorldStageEditor,
  loadWorldRuntime,
  persistWorldMaterialization,
  withWorldMutation,
} from "./novelx-world-runtime"

const TOOL_ID = "novelx_abort_world_document"
export const Parameters = Schema.Struct({
  entityId: Schema.String,
  taskSessionId: Schema.optional(Schema.String),
  errorCode: Schema.optional(Schema.String),
})
type Metadata = { entityId: string; status: "waiting_user" }

export const NovelXAbortWorldDocumentTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Stop one world dossier branch, release its lease, and preserve its child session for user review.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldStageEditor(ctx)
            const runtime = yield* loadWorldRuntime(fs)
            const next = abortWorldDocument({
              manifest: runtime.materialization,
              blueprint: runtime.blueprint,
              entityId: params.entityId,
              ownerSessionId: ctx.sessionID,
              taskSessionId: params.taskSessionId,
              errorCode: params.errorCode,
              now: Date.now(),
            })
            yield* persistWorldMaterialization(fs, events, runtime, next)
            return {
              title: "世界档案已停止",
              metadata: { entityId: params.entityId, status: "waiting_user" as const },
              output: "用户停止了这段编辑。该分支已保存并等待用户说明原因；依赖它的后续世界层不会开始。",
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
