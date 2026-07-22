import { Effect, Schema } from "effect"
import * as NovelXStory from "@opencode-ai/schema/novelx-story"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Tool } from "@/tool/tool"
import { assertStoryEditor, loadStoryRuntime, persistStoryMaterialization, withStoryMutation } from "./novelx-story-runtime"

const TOOL_ID = "novelx_prepare_story"
export const Parameters = Schema.Struct({})
type Metadata = { path: string; status: NovelXStory.Materialization["status"]; sourceCount: number; contextSha256: string }

export const NovelXPrepareStoryTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Create or resume the one-way Story Growth plan from the current frozen world.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        withStoryMutation(
          Effect.gen(function* () {
            assertStoryEditor(ctx)
            const runtime = yield* loadStoryRuntime(fs, { createForSession: ctx.sessionID })
            if (!runtime.manifestExisted) {
              yield* ctx.ask({
                permission: TOOL_ID,
                patterns: [NovelXStory.MATERIALIZATION_PATH, `${NovelXStory.STORY_DIRECTORY}/**`],
                always: [NovelXStory.MATERIALIZATION_PATH, `${NovelXStory.STORY_DIRECTORY}/**`],
                metadata: { sources: runtime.manifest.world.sources.length },
              })
              yield* persistStoryMaterialization(fs, events, runtime, runtime.manifest)
            }
            return {
              title: runtime.manifestExisted ? "故事生长已恢复" : "故事生长已准备",
              metadata: {
                path: NovelXStory.MATERIALIZATION_PATH,
                status: runtime.manifest.status,
                sourceCount: runtime.manifest.world.sources.length,
                contextSha256: runtime.manifest.preparedContextSha256,
              },
              output: JSON.stringify({
                status: runtime.manifest.status,
                contextSha256: runtime.manifest.preparedContextSha256,
                sources: runtime.manifest.world.sources,
                protagonist: runtime.manifest.schemaVersion === 2 ? runtime.manifest.protagonist : null,
                next:
                  runtime.manifest.status === "planning"
                    ? "读取全部世界原文和唯一主角原文，再注册一部三章小说；历史书与文献保持为空。"
                    : runtime.manifest.status === "text_completed"
                      ? "正文已经封存；返回 Growth，不要重写正文或启动图片。"
                      : "继续现有未提交文档。",
              }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
