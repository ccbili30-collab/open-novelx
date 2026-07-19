import { Effect, Schema } from "effect"
import { NovelXWorld } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { prepareWorldDocument } from "@/novelx/world-materialization"
import { Tool } from "@/tool/tool"
import {
  assertWorldStageEditor,
  loadCommittedWorldDocuments,
  loadWorldRuntime,
  persistWorldMaterialization,
  withWorldMutation,
} from "./novelx-world-runtime"

const TOOL_ID = "novelx_prepare_world_document"
export const Parameters = Schema.Struct({ entityId: Schema.String })
type Metadata = { entityId: string; targetPath: string; draftPath: string; leaseId: string | null; replayed: boolean }

export const NovelXPrepareWorldDocumentTool = Tool.define<
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
        "Lease one registered world entity dossier and return its authoritative Context Pack for novelx-world-writer.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldStageEditor(ctx)
            const runtime = yield* loadWorldRuntime(fs)
            const documents = yield* loadCommittedWorldDocuments(fs, runtime)
            const prepared = prepareWorldDocument({
              manifest: runtime.materialization,
              blueprint: runtime.blueprint,
              entityId: params.entityId,
              ownerSessionId: ctx.sessionID,
              ownerMessageId: ctx.messageID,
              committedDocuments: documents,
              now: Date.now(),
            })
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [NovelXWorld.MATERIALIZATION_PATH, prepared.record.draftPath, prepared.record.targetPath],
              always: [NovelXWorld.MATERIALIZATION_PATH],
              metadata: { entityId: params.entityId, targetPath: prepared.record.targetPath },
            })
            yield* persistWorldMaterialization(fs, events, runtime, prepared.manifest)
            return {
              title: prepared.replayed ? "世界档案已准备" : "世界档案已锁定",
              metadata: {
                entityId: params.entityId,
                targetPath: prepared.record.targetPath,
                draftPath: prepared.record.draftPath,
                leaseId: prepared.record.lease?.id ?? null,
                replayed: prepared.replayed,
              },
              output: [
                `已锁定 ${prepared.record.targetPath}。`,
                "下一步必须调用 task，subagent_type 必须是 novelx-world-writer；把以下 Context Pack 原样交给子 Agent：",
                "```json",
                JSON.stringify(prepared.context, null, 2),
                "```",
              ].join("\n"),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
