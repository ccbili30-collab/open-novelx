import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { prepareWorldStage } from "@/novelx/world-materialization"
import { Tool } from "@/tool/tool"
import {
  assertWorldStageEditor,
  loadWorldRuntime,
  persistWorldMaterialization,
  withWorldMutation,
} from "./novelx-world-runtime"

const TOOL_ID = "novelx_prepare_world_stage"
export const Parameters = Schema.Struct({ stageId: Schema.String })
type Metadata = { stageId: string; contextSha256: string; replayed: boolean }

export const NovelXPrepareWorldStageTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service | Session.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const sessions = yield* Session.Service
    return {
      description:
        "Bind and prepare one blueprint stage for this clean stage-editor session. The Context Pack contains a hashed source index; read required originals explicitly before registration.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldStageEditor(ctx)
            const editor = yield* sessions.get(ctx.sessionID)
            if (!editor.parentID) throw new Error("NOVELX_STAGE_EDITOR_PARENT_REQUIRED: Stage editor has no Growth parent.")
            const runtime = yield* loadWorldRuntime(fs, { createForSession: editor.parentID })
            const prepared = prepareWorldStage({
              manifest: runtime.materialization,
              blueprint: runtime.blueprint,
              stageId: params.stageId,
              ownerSessionId: ctx.sessionID,
              ownerParentSessionId: editor.parentID,
              now: Date.now(),
            })
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [runtime.materializationPath],
              always: [runtime.materializationPath],
              metadata: { stageId: params.stageId, contextSha256: prepared.contextSha256 },
            })
            yield* persistWorldMaterialization(
              fs,
              events,
              runtime,
              prepared.manifest,
              runtime.materializationExisted ? "change" : "add",
            )
            const registered =
              prepared.stage.status === "registered" ||
              prepared.stage.status === "reviewing" ||
              prepared.stage.status === "completed"
            const existing = registered
              ? prepared.stage.entities.map((entity) => ({
                  entityId: entity.id,
                  name: entity.name,
                  status:
                    prepared.manifest.documents.find((document) => document.entityId === entity.id)?.status ??
                    "missing",
                }))
              : []
            const output = registered
              ? [
                  `世界层《${runtime.blueprint.stages.find((stage) => stage.id === params.stageId)?.label ?? params.stageId}》已注册，禁止再次调用 novelx_register_world_stage。`,
                  "现有实体与正式档案状态如下：",
                  "```json",
                  JSON.stringify(existing, null, 2),
                  "```",
                  prepared.stage.status === "completed"
                    ? "本层已封存。向 Growth 总主编返回 stageId 与 handoff SHA-256；本阶段主编不得处理下一层或完成世界。"
                    : prepared.stage.status === "reviewing"
                      ? "所有档案已提交并进入审查。核对注册约束和来源后调用 novelx_finish_world_stage；禁止重新注册。"
                      : "下一步只对尚未 committed 的现有实体依次调用 novelx_prepare_world_document、novelx-world-writer 子 Agent 和 novelx_commit_world_document。不得更名、替换或重新注册实体。",
                ].join("\n")
              : [
                  `Context SHA-256: ${prepared.contextSha256}`,
                  prepared.context.dependencies.length
                    ? "先按来源索引调用 novelx_read_world_sources 读取权威原文，再调用 novelx_register_world_stage；不得只依据摘要注册。"
                    : "本层无前序依赖，可直接调用 novelx_register_world_stage。注册具体具名实体、最小事实、约束和同层关系；不得注册编号空槽。",
                  "以下 Context Pack 是本层注册合同与来源索引：",
                  "```json",
                  JSON.stringify(prepared.context, null, 2),
                  "```",
                ].join("\n")
            return {
              title: "世界层已准备",
              metadata: { stageId: params.stageId, contextSha256: prepared.contextSha256, replayed: prepared.replayed },
              output,
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
