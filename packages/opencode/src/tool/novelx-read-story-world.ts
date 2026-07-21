import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { recordStorySourceReads } from "@/novelx/story-materialization"
import { Tool } from "@/tool/tool"
import { assertStoryEditor, loadStoryRuntime, persistStoryMaterialization, withStoryMutation } from "./novelx-story-runtime"
import { absoluteWorldPath } from "./novelx-world-runtime"
import { worldSha256 } from "@/novelx/world-blueprint"

const TOOL_ID = "novelx_read_story_world"
export const Parameters = Schema.Struct({ entityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(16)) })
type Metadata = { read: number; totalRead: number }

export const NovelXReadStoryWorldTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Read an exact batch of frozen world originals and record their source hashes before Story registration.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withStoryMutation(
          Effect.gen(function* () {
            assertStoryEditor(ctx)
            const runtime = yield* loadStoryRuntime(fs)
            const selected = params.entityIds.map((id) => {
              const source = runtime.manifest.world.sources.find((candidate) => candidate.entityId === id)
              if (!source) throw new Error(`NOVELX_STORY_SOURCE_UNKNOWN: ${id}`)
              return source
            })
            const originals = yield* Effect.all(
              selected.map((source) =>
                Effect.gen(function* () {
                  const markdown = yield* fs.readFileStringSafe(absoluteWorldPath(runtime.world.directory, source.path))
                  if (!markdown || worldSha256(markdown) !== source.sha256) throw new Error(`NOVELX_STORY_SOURCE_DRIFT: ${source.path}`)
                  return { source, markdown }
                }),
              ),
              { concurrency: 8 },
            )
            const manifest = recordStorySourceReads({
              manifest: runtime.manifest,
              editorSessionId: ctx.sessionID,
              sourceEntityIds: params.entityIds,
              now: Date.now(),
            })
            yield* persistStoryMaterialization(fs, events, runtime, manifest)
            return {
              title: "世界原文已读取",
              metadata: { read: originals.length, totalRead: manifest.sourceReads.length },
              output: JSON.stringify({ originals, totalRead: manifest.sourceReads.length, totalSources: manifest.world.sources.length }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
