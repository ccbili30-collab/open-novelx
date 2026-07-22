import { Effect } from "effect"
import * as NovelXStory from "@opencode-ai/schema/novelx-story"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { registerStory } from "@/novelx/story-materialization"
import { Tool } from "@/tool/tool"
import {
  assertStoryEditor,
  loadStoryRuntime,
  persistStoryMaterialization,
  withStoryMutation,
} from "./novelx-story-runtime"

const TOOL_ID = "novelx_register_story"
export const Parameters = NovelXStory.RegistrationProfile
type Metadata = { documents: number; historyBooks: number; references: number; novelChapters: number }

export const NovelXRegisterStoryTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description:
        "Register exactly one 3-chapter novel from the frozen World and protagonist; histories and references may be empty.",
      parameters: Parameters,
      execute: (profile, ctx) =>
        withStoryMutation(
          Effect.gen(function* () {
            assertStoryEditor(ctx)
            const runtime = yield* loadStoryRuntime(fs)
            if (runtime.manifest.sourceReads.length !== runtime.manifest.world.sources.length) {
              throw new Error(
                "NOVELX_STORY_SOURCE_UNREAD: Read every frozen world original before registering Story Growth.",
              )
            }
            if (runtime.manifest.schemaVersion === 2 && !runtime.manifest.protagonistRead) {
              throw new Error(
                "NOVELX_STORY_CHARACTER_SOURCE_UNREAD: Read the exact protagonist dossier before registering Story Growth.",
              )
            }
            const result = registerStory({
              manifest: runtime.manifest,
              editorSessionId: ctx.sessionID,
              profile,
              protagonistContinuity: runtime.protagonistContinuity ?? undefined,
              now: Date.now(),
            })
            yield* persistStoryMaterialization(fs, events, runtime, result.manifest)
            return {
              title: "故事骨架已注册",
              metadata: {
                documents: result.manifest.documents.length,
                historyBooks: result.manifest.historyBooks.length,
                references: result.manifest.references.length,
                novelChapters: result.manifest.novel.chapters.length,
              },
              output: JSON.stringify({
                historyBooks: result.manifest.historyBooks,
                references: result.manifest.references,
                novel: result.manifest.novel,
                documents: result.manifest.documents.map(({ lease: _, ...document }) => document),
                next: "严格按三个小说章节顺序，用同一个 novelx-story-writer 逐份 prepare → commit；禁止审稿、并发和回写世界。",
              }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
