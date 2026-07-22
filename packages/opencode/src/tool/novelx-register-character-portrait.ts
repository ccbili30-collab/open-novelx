import path from "node:path"
import { Effect, Schema } from "effect"
import * as NovelXCharacterVisual from "@opencode-ai/schema/novelx-character-visual"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Provider } from "@/provider/provider"
import { BackgroundJob } from "@/background/job"
import { compileCharacterVisual, verifyCharacterVisual } from "@/novelx/character-visual"
import { launchCharacterPortraitQueue } from "@/novelx/character-portrait-queue"
import { Tool } from "@/tool/tool"
import { loadCharacterRuntime } from "./novelx-character-runtime"
import {
  assertCharacterPortraitBranch,
  loadCharacterVisualLanguage,
  persistCharacterVisual,
} from "./novelx-character-visual-runtime"

const TOOL_ID = "novelx_register_character_portrait"
export const Parameters = Schema.Struct({
  ownerId: Schema.String,
  prompt: Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(2400)),
})
type Metadata = { manifestPath: string; integritySha256: string; taskId: string; replayed: boolean }

export const NovelXRegisterCharacterPortraitTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service | Provider.Service | BackgroundJob.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const provider = yield* Provider.Service
    const background = yield* BackgroundJob.Service
    return {
      description:
        "Register the canonical protagonist portrait and launch its real asynchronous image Provider worker.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          assertCharacterPortraitBranch(ctx)
          const character = yield* loadCharacterRuntime(fs)
          if (character.manifest.status !== "text_completed" || !character.manifest.protagonist) {
            throw new Error("NOVELX_CHARACTER_TEXT_INCOMPLETE")
          }
          if (params.ownerId !== character.manifest.protagonist.id) {
            throw new Error("NOVELX_CHARACTER_PORTRAIT_OWNER_INVALID")
          }
          const visualLanguage = yield* loadCharacterVisualLanguage(fs, character)
          const manifestPath = path.join(character.world.directory, ...NovelXCharacterVisual.MANIFEST_PATH.split("/"))
          const existing = yield* fs.readFileStringSafe(manifestPath)
          if (existing) {
            const manifest = verifyCharacterVisual(
              Schema.decodeUnknownSync(NovelXCharacterVisual.Manifest)(JSON.parse(existing)),
              character.manifest,
            )
            if (manifest.task.prompt !== params.prompt.trim().replace(/\s+/gu, " ")) {
              throw new Error("NOVELX_CHARACTER_PORTRAIT_REPLAY_CONFLICT")
            }
            if (manifest.status !== "ready" && manifest.status !== "failed") {
              yield* launchCharacterPortraitQueue({
                directory: character.world.directory,
                fs,
                events,
                provider,
                background,
              })
            }
            return result(manifest, true)
          }
          const manifest = compileCharacterVisual({
            character: character.manifest,
            editorSessionId: ctx.sessionID,
            visualLanguage,
            prompt: params.prompt,
            now: Date.now(),
          })
          yield* ctx.ask({
            permission: TOOL_ID,
            patterns: [NovelXCharacterVisual.MANIFEST_PATH, `${NovelXCharacterVisual.PORTRAIT_DIRECTORY}/**`],
            always: [NovelXCharacterVisual.MANIFEST_PATH, `${NovelXCharacterVisual.PORTRAIT_DIRECTORY}/**`],
            metadata: { ownerId: manifest.task.ownerId, taskId: manifest.task.id },
          })
          yield* persistCharacterVisual(fs, events, { character, manifestPath, manifestExisted: false }, manifest)
          yield* launchCharacterPortraitQueue({
            directory: character.world.directory,
            fs,
            events,
            provider,
            background,
          })
          return result(manifest, false)
        }).pipe(Effect.orDie),
    }
  }),
)

function result(manifest: NovelXCharacterVisual.Manifest, replayed: boolean) {
  return {
    title: replayed ? "角色立绘队列已存在" : "角色立绘已入队",
    metadata: {
      manifestPath: NovelXCharacterVisual.MANIFEST_PATH,
      integritySha256: manifest.integritySha256,
      taskId: manifest.task.id,
      replayed,
    },
    output: "唯一主角立绘已经进入真实图片队列；Worker 只会原样重试同一条冻结 Prompt。",
  }
}

