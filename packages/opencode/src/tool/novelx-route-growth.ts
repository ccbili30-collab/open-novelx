import { Effect, Schema } from "effect"
import * as NovelXStory from "@opencode-ai/schema/novelx-story"
import { NovelXCharacter } from "@opencode-ai/schema/novelx-character"
import { NovelXWorld } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { Tool } from "@/tool/tool"
import { verifyStoryMaterialization } from "@/novelx/story-materialization"
import { verifyCharacterMaterialization } from "@/novelx/character-materialization"
import { assertWorldGrowthEditor, loadWorldRuntime } from "./novelx-world-runtime"
import { loadStoryRuntime } from "./novelx-story-runtime"

const TOOL_ID = "novelx_route_growth"
export const Parameters = Schema.Struct({})
type Route =
  | "world_required"
  | "world_resume"
  | "character_required"
  | "character_resume"
  | "story_required"
  | "story_resume"
  | "complete"
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
          if (storyText) {
            const story = verifyStoryMaterialization(
              Schema.decodeUnknownSync(NovelXStory.Materialization)(JSON.parse(storyText)),
            )
            if (story.schemaVersion === 2) yield* loadStoryRuntime(fs)
            if (story.status !== "text_completed") {
              return result("story_resume", "novelx-story-editor", "Story Growth 已注册但正文未全部提交。")
            }
            return result("complete", null, "世界、既有角色来源与故事文字链已经封存；本轮不等待图片。")
          }
          const characterText = yield* fs.readFileStringSafe(
            pathOf(instance.directory, NovelXCharacter.MATERIALIZATION_PATH),
          )
          if (!characterText) {
            return result(
              "character_required",
              "novelx-character-editor",
              "世界已冻结；下一步从全部世界原文生成唯一主角档案。",
            )
          }
          const character = verifyCharacterMaterialization(
            Schema.decodeUnknownSync(NovelXCharacter.Materialization)(JSON.parse(characterText)),
          )
          if (character.world.materializationIntegritySha256 !== world.materialization.integritySha256) {
            throw new Error("NOVELX_CHARACTER_WORLD_DRIFT: Character Growth belongs to a different frozen world.")
          }
          if (character.status !== "text_completed") {
            return result(
              "character_resume",
              "novelx-character-editor",
              "唯一主角已经注册但档案尚未封存；恢复原角色主编。",
            )
          }
          return result(
            "story_required",
            "novelx-story-editor",
            "冻结世界与唯一主角均已封存；下一步直接生成一部三章小说。",
          )
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
