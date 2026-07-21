import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { recordCharacterSourceReads } from "@/novelx/character-materialization"
import { worldSha256 } from "@/novelx/world-blueprint"
import { Tool } from "@/tool/tool"
import {
  assertCharacterEditor,
  loadCharacterRuntime,
  persistCharacterMaterialization,
  withCharacterMutation,
} from "./novelx-character-runtime"
import { absoluteWorldPath } from "./novelx-world-runtime"

const TOOL_ID = "novelx_read_character_world"
export const Parameters = Schema.Struct({
  entityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
})
type Metadata = { read: number; totalRead: number }

export const NovelXReadCharacterWorldTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Read an exact batch of frozen world originals before registering the protagonist.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withCharacterMutation(
          Effect.gen(function* () {
            assertCharacterEditor(ctx)
            const runtime = yield* loadCharacterRuntime(fs)
            const selected = params.entityIds.map((entityId) => {
              const source = runtime.manifest.world.sources.find((candidate) => candidate.entityId === entityId)
              if (!source) throw new Error(`NOVELX_CHARACTER_SOURCE_UNKNOWN: ${entityId}`)
              return source
            })
            const originals = yield* Effect.all(
              selected.map((source) =>
                Effect.gen(function* () {
                  const markdown = yield* fs.readFileStringSafe(
                    absoluteWorldPath(runtime.world.directory, source.path),
                  )
                  if (!markdown || worldSha256(markdown) !== source.sha256) {
                    throw new Error(`NOVELX_CHARACTER_SOURCE_DRIFT: ${source.path}`)
                  }
                  return { source, markdown }
                }),
              ),
              { concurrency: 8 },
            )
            const manifest = recordCharacterSourceReads({
              manifest: runtime.manifest,
              editorSessionId: ctx.sessionID,
              sourceEntityIds: params.entityIds,
              now: Date.now(),
            })
            yield* persistCharacterMaterialization(fs, events, runtime, manifest)
            return {
              title: "角色世界原文已读取",
              metadata: { read: originals.length, totalRead: manifest.sourceReads.length },
              output: JSON.stringify({
                originals,
                totalRead: manifest.sourceReads.length,
                totalSources: manifest.world.sources.length,
              }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
