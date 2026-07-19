import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { prepareWorldStage } from "@/novelx/world-materialization"
import { Tool } from "@/tool/tool"
import {
  assertWorldGrowthEditor,
  loadCommittedWorldDocuments,
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
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description:
        "Prepare one blueprint stage from current committed dependency dossiers. For an unregistered stage, use the returned Context Pack and contextSha256 to register concrete entities. For an already registered stage, follow the returned recovery instructions and continue its unfinished documents without registering it again.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldGrowthEditor(ctx)
            const runtime = yield* loadWorldRuntime(fs, { createForSession: ctx.sessionID })
            const documents = yield* loadCommittedWorldDocuments(fs, runtime)
            const prepared = prepareWorldStage({
              manifest: runtime.materialization,
              blueprint: runtime.blueprint,
              stageId: params.stageId,
              ownerSessionId: ctx.sessionID,
              committedDocuments: documents,
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
            const registered = prepared.stage.status === "registered" || prepared.stage.status === "completed"
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
                    ? "本层已完成。准备下一未完成层；若所有层均完成，则调用 novelx_finish_world。"
                    : "下一步只对尚未 committed 的现有实体依次调用 novelx_prepare_world_document、novelx-world-writer 子 Agent 和 novelx_commit_world_document。不得更名、替换或重新注册实体。",
                ].join("\n")
              : [
                  `Context SHA-256: ${prepared.contextSha256}`,
                  "下一步调用 novelx_register_world_stage。注册具体具名实体、最小事实、约束、前序实体依赖和同层关系；不得注册编号空槽。",
                  "以下 Context Pack 是本层注册的权威输入：",
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
