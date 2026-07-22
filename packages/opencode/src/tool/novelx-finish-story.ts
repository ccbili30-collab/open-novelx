import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { finishStoryText, type RegisteredStoryMaterialization } from "@/novelx/story-materialization"
import { Tool } from "@/tool/tool"
import { assertStoryEditor, loadStoryRuntime, persistStoryMaterialization, withStoryMutation } from "./novelx-story-runtime"

const TOOL_ID = "novelx_finish_story"
export const Parameters = Schema.Struct({})
type Metadata = { integritySha256: string; documents: number; novel: string }

export const NovelXFinishStoryTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Seal the complete three-chapter protagonist-bound novel text chain.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        withStoryMutation(
          Effect.gen(function* () {
            assertStoryEditor(ctx)
            const runtime = yield* loadStoryRuntime(fs)
            if (!runtime.manifest.novel) throw new Error("NOVELX_STORY_REGISTRATION_INCOMPLETE")
            const manifest = finishStoryText({
              manifest: runtime.manifest as RegisteredStoryMaterialization,
              editorSessionId: ctx.sessionID,
              now: Date.now(),
            })
            yield* persistStoryMaterialization(fs, events, runtime, manifest)
            return {
              title: "故事正文已封存",
              metadata: { integritySha256: manifest.integritySha256, documents: manifest.documents.length, novel: manifest.novel.title },
              output: `三章小说共 ${manifest.documents.length} 份文稿已封存。返回 Growth；本轮不启动封面图片，不得回写世界或角色。`,
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
