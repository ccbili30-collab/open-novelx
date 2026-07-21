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
      description: "Seal the complete one-way history → documents → one novel text chain so cover generation may start.",
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
              output: `历史书、关键文献与小说共 ${manifest.documents.length} 份文稿已按单向因果链封存。当前故事主编必须立即分裂 novelx-visual-editor 工具分身，由它读取原文、形成最终封面 Prompt 并提交图片队列；不得先返回 Growth，不得回写世界。`,
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
