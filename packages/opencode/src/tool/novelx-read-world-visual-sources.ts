import path from "node:path"
import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Tool } from "@/tool/tool"
import { assertWorldVisualEditor, loadWorldRuntime } from "./novelx-world-runtime"

const TOOL_ID = "novelx_read_world_visual_sources"
export const Parameters = Schema.Struct({
  entityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
})
type Metadata = { sources: Array<{ entityId: string; path: string; sha256: string }> }

export const NovelXReadWorldVisualSourcesTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description:
        "Read bounded committed world dossiers for spatial and scenery planning. Summaries are not a substitute for these originals.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          assertWorldVisualEditor(ctx)
          const runtime = yield* loadWorldRuntime(fs)
          if (runtime.materialization.status !== "completed") throw new Error("NOVELX_VISUAL_WORLD_INCOMPLETE")
          const requested = new Set(params.entityIds)
          if (requested.size !== params.entityIds.length) throw new Error("NOVELX_VISUAL_SOURCE_DUPLICATE")
          const records = params.entityIds.map((entityId) => {
            const record = runtime.materialization.documents.find((item) => item.entityId === entityId)
            if (record?.status !== "committed" || !record.committedSha256) {
              throw new Error(`NOVELX_VISUAL_SOURCE_UNKNOWN: ${entityId}`)
            }
            return record
          })
          const sources = yield* Effect.all(
            records.map((record) =>
              Effect.gen(function* () {
                const target = path.join(runtime.directory, ...record.targetPath.split("/"))
                const content = yield* fs.readFileStringSafe(target)
                if (content === undefined) throw new Error(`NOVELX_VISUAL_SOURCE_MISSING: ${record.targetPath}`)
                return { entityId: record.entityId, path: record.targetPath, sha256: record.committedSha256!, content }
              }),
            ),
            { concurrency: 6 },
          )
          return {
            title: `已读取 ${sources.length} 份视觉来源`,
            metadata: { sources: sources.map(({ content: _content, ...source }) => source) },
            output: sources
              .map(
                (source) =>
                  `## ${source.entityId}\n路径：${source.path}\nSHA-256：${source.sha256}\n\n${source.content}`,
              )
              .join("\n\n---\n\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
