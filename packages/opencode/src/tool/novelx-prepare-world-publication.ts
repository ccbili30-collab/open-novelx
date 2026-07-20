import { Effect, Schema } from "effect"
import { NovelXWorldPublication } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Tool } from "@/tool/tool"
import { assertWorldPublicationEditor, withWorldMutation } from "./novelx-world-runtime"
import { loadWorldPublicationRuntime, persistWorldPublication } from "./novelx-publication-runtime"

const TOOL_ID = "novelx_prepare_world_publication"
export const Parameters = Schema.Struct({})
type Metadata = { records: number; pending: number; manifestPath: string }

export const NovelXPrepareWorldPublicationTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Create or resume the source-anchored player-facing atlas and travelogue publication plan.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldPublicationEditor(ctx)
            const runtime = yield* loadWorldPublicationRuntime(fs, { create: true })
            if (!runtime.manifestExisted) {
              yield* ctx.ask({
                permission: TOOL_ID,
                patterns: [NovelXWorldPublication.MANIFEST_PATH, `${NovelXWorldPublication.PUBLICATION_DIRECTORY}/**`],
                always: [NovelXWorldPublication.MANIFEST_PATH, `${NovelXWorldPublication.PUBLICATION_DIRECTORY}/**`],
                metadata: { records: runtime.manifest.records.length },
              })
              yield* persistWorldPublication(fs, events, runtime.manifestPath, runtime.manifest)
            }
            const records = runtime.manifest.records.map((record) => ({
              entityId: record.entityId,
              kind: record.kind,
              title: record.title,
              status: record.status,
              sourcePath: record.sourcePath,
              sourceSha256: record.sourceSha256,
              targetPath: record.targetPath,
            }))
            return {
              title: "玩家世界文稿已准备",
              metadata: {
                records: records.length,
                pending: records.filter((record) => record.status === "pending").length,
                manifestPath: NovelXWorldPublication.MANIFEST_PATH,
              },
              output: JSON.stringify({ records }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
