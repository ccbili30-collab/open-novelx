import { Effect, Schema } from "effect"
import * as NovelXStory from "@opencode-ai/schema/novelx-story"
import * as NovelXStoryVisual from "@opencode-ai/schema/novelx-story-visual"
import { NovelXCharacter } from "@opencode-ai/schema/novelx-character"
import * as NovelXCharacterVisual from "@opencode-ai/schema/novelx-character-visual"
import { NovelXWorld, NovelXWorldPublication, NovelXWorldVisual } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { Tool } from "@/tool/tool"
import { verifyStoryMaterialization } from "@/novelx/story-materialization"
import { verifyStoryVisual } from "@/novelx/story-visual"
import { verifyCharacterMaterialization } from "@/novelx/character-materialization"
import { verifyCharacterVisual } from "@/novelx/character-visual"
import { verifyWorldVisuals, worldVisualRegistrationSha256 } from "@/novelx/world-visual"
import { verifyWorldPublication } from "@/novelx/world-publication"
import { assertWorldGrowthEditor, loadWorldRuntime } from "./novelx-world-runtime"
import { loadStoryRuntime } from "./novelx-story-runtime"

const TOOL_ID = "novelx_route_growth"
export const Parameters = Schema.Struct({})
type Route =
  | "world_required"
  | "world_resume"
  | "world_visual_required"
  | "world_publication_required"
  | "world_publication_resume"
  | "character_required"
  | "character_resume"
  | "character_portrait_required"
  | "story_required"
  | "story_resume"
  | "story_covers_required"
  | "complete"
type Metadata = { route: Route; nextAgent: string | null }

export const NovelXRouteGrowthTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description:
        "Inspect authoritative NovelX text and visual artifacts, then select exactly one next Growth phase without waiting for images.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          assertWorldGrowthEditor(ctx)
          const instance = yield* InstanceState.context
          const blueprint = yield* fs.readFileStringSafe(pathOf(instance.directory, NovelXWorld.BLUEPRINT_PATH))
          if (!blueprint) return result("world_required", null, "当前项目没有世界蓝图；从世界注册开始。")

          const materializationText = yield* fs.readFileStringSafe(
            pathOf(instance.directory, NovelXWorld.MATERIALIZATION_PATH),
          )
          if (!materializationText) {
            return result("world_resume", "novelx-stage-editor", "世界蓝图存在，但世界正文尚未完成。")
          }
          const world = yield* loadWorldRuntime(fs)
          if (world.materialization.status !== "completed") {
            return result("world_resume", "novelx-stage-editor", "世界仍在生长；只恢复依赖就绪的世界阶段。")
          }

          const storyText = yield* fs.readFileStringSafe(pathOf(instance.directory, NovelXStory.MATERIALIZATION_PATH))
          const persistedStory = storyText
            ? verifyStoryMaterialization(Schema.decodeUnknownSync(NovelXStory.Materialization)(JSON.parse(storyText)))
            : undefined
          if (persistedStory?.schemaVersion === 1) {
            if (persistedStory.status === "text_completed") {
              return result("complete", null, "旧版故事文字链已经封存；保持终态，不追溯创建角色或新版视觉任务。")
            }
            throw new Error("NOVELX_STORY_V1_RESUME_UNSUPPORTED: Incomplete Story V1 requires a separate migration design.")
          }

          const visualPath = pathOf(instance.directory, NovelXWorldVisual.MANIFEST_PATH)
          const visualText = yield* fs.readFileStringSafe(visualPath)
          if (!visualText) {
            return result("world_visual_required", "novelx-visual-editor", "世界事实已封存；登记地图与稀疏风貌任务。")
          }
          const visual = verifyWorldVisuals({
            manifest: Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(JSON.parse(visualText)),
            materialization: world.materialization,
          })

          const publicationText = yield* fs.readFileStringSafe(
            pathOf(instance.directory, NovelXWorldPublication.MANIFEST_PATH),
          )
          if (!publicationText) {
            return result(
              "world_publication_required",
              "novelx-publication-editor",
              "地图与风貌已经登记；依据冻结世界事实生成图志与奇观纪行。",
            )
          }
          const publication = verifyWorldPublication(
            Schema.decodeUnknownSync(NovelXWorldPublication.Manifest)(JSON.parse(publicationText)),
            {
              materializationSha256: world.materialization.integritySha256,
              visualSha256: worldVisualRegistrationSha256(visual),
            },
          )
          if (publication.status !== "ready") {
            return result(
              "world_publication_resume",
              "novelx-publication-editor",
              "图志与纪行尚未全部提交；恢复原出版编辑。",
            )
          }

          const characterText = yield* fs.readFileStringSafe(
            pathOf(instance.directory, NovelXCharacter.MATERIALIZATION_PATH),
          )
          if (!characterText) {
            return result(
              "character_required",
              "novelx-character-editor",
              "世界与公开图志已经封存；下一步从冻结原文生成唯一主角档案。",
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

          const portraitText = yield* fs.readFileStringSafe(
            pathOf(instance.directory, NovelXCharacterVisual.MANIFEST_PATH),
          )
          if (!portraitText) {
            return result(
              "character_portrait_required",
              "novelx-visual-editor",
              "主角档案已经封存；登记唯一标准立绘任务。",
            )
          }
          const portrait = verifyCharacterVisual(
            Schema.decodeUnknownSync(NovelXCharacterVisual.Manifest)(JSON.parse(portraitText)),
            character,
          )

          if (!persistedStory) {
            return result(
              "story_required",
              "novelx-story-editor",
              "冻结世界与唯一主角均已封存；下一步生成一部三章小说。",
            )
          }
          yield* loadStoryRuntime(fs)
          if (persistedStory.status !== "text_completed") {
            return result("story_resume", "novelx-story-editor", "Story Growth 已注册但正文未全部提交。")
          }

          const coversText = yield* fs.readFileStringSafe(pathOf(instance.directory, NovelXStoryVisual.MANIFEST_PATH))
          if (!coversText) {
            return result(
              "story_covers_required",
              "novelx-visual-editor",
              "三章小说已经封存；登记小说与主题封面任务。",
            )
          }
          const covers = verifyStoryVisual(
            Schema.decodeUnknownSync(NovelXStoryVisual.Manifest)(JSON.parse(coversText)),
            persistedStory,
          )
          return result(
            "complete",
            null,
            "世界事实、图志与纪行、唯一主角及三章小说均已封存；所有视觉任务已登记，图片继续在后台生成。",
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
