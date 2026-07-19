import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { readWorldSources } from "@/novelx/world-materialization"
import { Tool } from "@/tool/tool"
import {
  assertWorldStageEditor,
  loadCommittedWorldDocuments,
  loadWorldRuntime,
  persistWorldMaterialization,
  withWorldMutation,
} from "./novelx-world-runtime"

const TOOL_ID = "novelx_read_world_sources"
export const Parameters = Schema.Struct({
  stageId: Schema.String,
  entityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(24)),
})
type Metadata = { stageId: string; sources: Array<{ entityId: string; sha256: string }> }

export const NovelXReadWorldSourcesTool = Tool.define<
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
        "Read exact committed upstream dossiers for the bound world stage and record their hashes before entity registration.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldStageEditor(ctx)
            const runtime = yield* loadWorldRuntime(fs)
            const documents = yield* loadCommittedWorldDocuments(fs, runtime)
            const read = readWorldSources({
              manifest: runtime.materialization,
              blueprint: runtime.blueprint,
              stageId: params.stageId,
              ownerSessionId: ctx.sessionID,
              entityIds: params.entityIds,
              committedDocuments: documents,
              now: Date.now(),
            })
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [runtime.materializationPath],
              always: [runtime.materializationPath],
              metadata: { stageId: params.stageId, entityIds: params.entityIds },
            })
            yield* persistWorldMaterialization(fs, events, runtime, read.manifest)
            return {
              title: "世界上游原文已读取",
              metadata: {
                stageId: params.stageId,
                sources: read.sources.map((source) => ({
                  entityId: source.entity.id,
                  sha256: source.sourceSha256,
                })),
              },
              output: [
                "以下内容是本阶段已记录哈希的权威上游原文；摘要不能替代它们：",
                ...read.sources.flatMap((source) => [
                  `\n## ${source.entity.name} | ${source.entity.id} | ${source.sourceSha256}`,
                  source.dossier,
                ]),
              ].join("\n"),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
