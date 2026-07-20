import { createHash } from "node:crypto"
import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Tool } from "@/tool/tool"
import { absoluteWorldPath, assertWorldPublicationEditor } from "./novelx-world-runtime"
import { loadWorldPublicationRuntime } from "./novelx-publication-runtime"

const TOOL_ID = "novelx_read_world_publication_source"
export const Parameters = Schema.Struct({ entityId: Schema.String, kind: Schema.Literals(["atlas", "travelogue"]) })
type Metadata = { entityId: string; kind: "atlas" | "travelogue"; sourcePath: string; sourceSha256: string }

export const NovelXReadWorldPublicationSourceTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description: "Read one exact authoritative source dossier before dispatching player-facing prose.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          assertWorldPublicationEditor(ctx)
          const runtime = yield* loadWorldPublicationRuntime(fs)
          const record = runtime.manifest.records.find(
            (candidate) => candidate.entityId === params.entityId && candidate.kind === params.kind,
          )
          if (!record) throw new Error("NOVELX_PUBLICATION_RECORD_UNKNOWN")
          const content = yield* fs.readFileStringSafe(absoluteWorldPath(runtime.world.directory, record.sourcePath))
          if (!content) throw new Error("NOVELX_PUBLICATION_SOURCE_MISSING")
          if (createHash("sha256").update(content).digest("hex") !== record.sourceSha256) {
            throw new Error("NOVELX_PUBLICATION_SOURCE_DRIFT")
          }
          return {
            title: `已读取${params.kind === "atlas" ? "图志" : "纪行"}来源`,
            metadata: {
              entityId: record.entityId,
              kind: record.kind,
              sourcePath: record.sourcePath,
              sourceSha256: record.sourceSha256,
            },
            output: JSON.stringify({
              entityId: record.entityId,
              kind: record.kind,
              title: record.title,
              sourcePath: record.sourcePath,
              sourceSha256: record.sourceSha256,
              content,
            }),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
