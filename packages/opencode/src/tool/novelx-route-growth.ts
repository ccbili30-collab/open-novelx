import { Effect, Schema } from "effect"
import * as NovelXStory from "@opencode-ai/schema/novelx-story"
import * as NovelXStoryVisual from "@opencode-ai/schema/novelx-story-visual"
import { NovelXWorld } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { Tool } from "@/tool/tool"
import { verifyStoryMaterialization } from "@/novelx/story-materialization"
import { verifyStoryVisual } from "@/novelx/story-visual"
import { assertWorldGrowthEditor, loadWorldRuntime } from "./novelx-world-runtime"

const TOOL_ID = "novelx_route_growth"
export const Parameters = Schema.Struct({})
type Route = "world_required" | "world_resume" | "story_required" | "story_resume" | "complete"
type Metadata = { route: Route; nextAgent: string | null }

export const NovelXRouteGrowthTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description: "Inspect authoritative NovelX artifacts and select exactly one next Growth phase without mutating or guessing completion.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          assertWorldGrowthEditor(ctx)
          const instance = yield* InstanceState.context
          const blueprint = yield* fs.readFileStringSafe(pathOf(instance.directory, NovelXWorld.BLUEPRINT_PATH))
          if (!blueprint) return result("world_required", null, "当前项目没有世界蓝图；从世界注册开始。")
          const materializationText = yield* fs.readFileStringSafe(pathOf(instance.directory, NovelXWorld.MATERIALIZATION_PATH))
          if (!materializationText) return result("world_resume", "novelx-stage-editor", "世界蓝图存在，但世界正文尚未完成。")
          const world = yield* loadWorldRuntime(fs)
          if (world.materialization.status !== "completed") {
            return result("world_resume", "novelx-stage-editor", "世界仍在生长；只恢复依赖就绪的世界阶段。")
          }
          const storyText = yield* fs.readFileStringSafe(pathOf(instance.directory, NovelXStory.MATERIALIZATION_PATH))
          if (!storyText) return result("story_required", "novelx-story-editor", "世界已冻结；下一步单向生成历史、文献与一部小说。")
          const story = verifyStoryMaterialization(Schema.decodeUnknownSync(NovelXStory.Materialization)(JSON.parse(storyText)))
          if (story.status !== "text_completed") return result("story_resume", "novelx-story-editor", "Story Growth 已注册但正文未全部提交。")
          const coverText = yield* fs.readFileStringSafe(pathOf(instance.directory, NovelXStoryVisual.MANIFEST_PATH))
          if (!coverText) return result("story_resume", "novelx-story-editor", "故事正文已封存；恢复故事主编，由它分裂视觉工具分身提交封面。")
          const covers = verifyStoryVisual(
            Schema.decodeUnknownSync(NovelXStoryVisual.Manifest)(JSON.parse(coverText)),
            story,
          )
          if (covers.status === "ready" || covers.status === "partial" || covers.status === "failed") {
            return result("complete", null, `世界到故事的单向链已结束；封面状态：${covers.status}。`)
          }
          return result("story_resume", "novelx-story-editor", "封面队列尚未进入终态；恢复故事主编及其视觉工具分身。")
        }).pipe(Effect.orDie),
    }
  }),
)

function pathOf(directory: string, relative: string) {
  return `${directory}\\${relative.replaceAll("/", "\\")}`
}

function result(route: Route, nextAgent: string | null, output: string) {
  return { title: "Growth 路由已确认", metadata: { route, nextAgent }, output }
}
