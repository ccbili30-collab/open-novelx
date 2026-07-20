import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Tool } from "@/tool/tool"
import { assertWorldPublicationEditor } from "./novelx-world-runtime"
import { loadWorldPublicationRuntime } from "./novelx-publication-runtime"

const TOOL_ID = "novelx_finish_world_publication"
export const Parameters = Schema.Struct({})
type Metadata = { records: number; atlas: number; travelogues: number }

export const NovelXFinishWorldPublicationTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description: "Finish player publication only after every required atlas and wonder travelogue is committed.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          assertWorldPublicationEditor(ctx)
          const runtime = yield* loadWorldPublicationRuntime(fs)
          if (runtime.manifest.status !== "ready") throw new Error("NOVELX_PUBLICATION_INCOMPLETE")
          return {
            title: "玩家世界文稿已完成",
            metadata: {
              records: runtime.manifest.records.length,
              atlas: runtime.manifest.records.filter((record) => record.kind === "atlas").length,
              travelogues: runtime.manifest.records.filter((record) => record.kind === "travelogue").length,
            },
            output: JSON.stringify({
              manifestPath: ".novelx/publication/world-publication.json",
              status: runtime.manifest.status,
              records: runtime.manifest.records.length,
            }),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
