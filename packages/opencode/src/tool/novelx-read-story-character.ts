import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { recordStoryCharacterRead } from "@/novelx/story-materialization"
import { Tool } from "@/tool/tool"
import {
  assertStoryEditor,
  loadStoryRuntime,
  persistStoryMaterialization,
  withStoryMutation,
} from "./novelx-story-runtime"

const TOOL_ID = "novelx_read_story_character"
export const Parameters = Schema.Struct({})
type Metadata = { protagonistId: string; path: string; sha256: string; replayed: boolean }

export const NovelXReadStoryCharacterTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Read and record the exact frozen protagonist dossier required by Story v2.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        withStoryMutation(
          Effect.gen(function* () {
            assertStoryEditor(ctx)
            const runtime = yield* loadStoryRuntime(fs)
            if (runtime.manifest.schemaVersion !== 2 || !runtime.manifest.protagonist || !runtime.protagonistMarkdown) {
              throw new Error("NOVELX_STORY_CHARACTER_REQUIRED: This Story has no current protagonist source.")
            }
            const replayed = Boolean(runtime.manifest.protagonistRead)
            const manifest = recordStoryCharacterRead({
              manifest: runtime.manifest,
              editorSessionId: ctx.sessionID,
              protagonistId: runtime.manifest.protagonist.id,
              sourceSha256: runtime.manifest.protagonist.sha256,
              now: Date.now(),
            })
            if (!replayed) yield* persistStoryMaterialization(fs, events, runtime, manifest)
            return {
              title: "唯一主角原文已读取",
              metadata: {
                protagonistId: runtime.manifest.protagonist.id,
                path: runtime.manifest.protagonist.path,
                sha256: runtime.manifest.protagonist.sha256,
                replayed,
              },
              output: JSON.stringify({ source: runtime.manifest.protagonist, markdown: runtime.protagonistMarkdown }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
