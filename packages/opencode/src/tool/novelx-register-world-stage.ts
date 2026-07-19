import { Effect } from "effect"
import { NovelXWorld } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { registerWorldStage } from "@/novelx/world-materialization"
import { Tool } from "@/tool/tool"
import {
  assertWorldStageEditor,
  loadWorldRuntime,
  persistWorldMaterialization,
  withWorldMutation,
} from "./novelx-world-runtime"

const TOOL_ID = "novelx_register_world_stage"
export const Parameters = NovelXWorld.StageRegistrationProfile
type Metadata = {
  stageId: string
  replayed: boolean
  entities: Array<{ id: string; name: string; typeLabel: string }>
}

export const NovelXRegisterWorldStageTool = Tool.define<
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
        "Register all concrete named entities for one prepared world stage. Facts must use the returned stage Context Pack and dependencies must name committed prior entity IDs.",
      parameters: Parameters,
      execute: (profile, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldStageEditor(ctx)
            const runtime = yield* loadWorldRuntime(fs)
            const registered = registerWorldStage({
              manifest: runtime.materialization,
              blueprint: runtime.blueprint,
              profile,
              ownerSessionId: ctx.sessionID,
              now: Date.now(),
            })
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [runtime.materializationPath],
              always: [runtime.materializationPath],
              metadata: { stageId: profile.stageId },
            })
            yield* persistWorldMaterialization(fs, events, runtime, registered.manifest)
            const entities = registered.stage.entities.map((entity) => ({
              id: entity.id,
              name: entity.name,
              typeLabel: entity.typeLabel,
            }))
            return {
              title: registered.replayed ? "世界层实体已存在" : "世界层实体已注册",
              metadata: { stageId: profile.stageId, replayed: registered.replayed, entities },
              output: [
                `已注册 ${entities.length} 个具体世界实体。`,
                ...entities.map((entity) => `- ${entity.id} | ${entity.name} | ${entity.typeLabel}`),
                "现在按顺序对每个实体调用 novelx_prepare_world_document、novelx-world-writer 子 Agent 和 novelx_commit_world_document。",
              ].join("\n"),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
