import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import * as NovelXCharacterVisual from "@opencode-ai/schema/novelx-character-visual"
import * as NovelXWorldVisual from "@opencode-ai/schema/novelx-world-visual"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import type { Tool } from "@/tool/tool"
import { verifyCharacterVisual } from "@/novelx/character-visual"
import { verifyWorldVisuals } from "@/novelx/world-visual"
import { loadCharacterRuntime, type CharacterRuntime } from "./novelx-character-runtime"
import { publishWorldFile, withWorldMutation } from "./novelx-world-runtime"

export type CharacterVisualRuntime = {
  character: CharacterRuntime
  manifest: NovelXCharacterVisual.Manifest
  manifestPath: string
  manifestExisted: boolean
}

export function loadCharacterVisualRuntime(fs: FSUtil.Interface) {
  return Effect.gen(function* () {
    const character = yield* loadCharacterRuntime(fs)
    if (character.manifest.status !== "text_completed") throw new Error("NOVELX_CHARACTER_TEXT_INCOMPLETE")
    const manifestPath = path.join(character.world.directory, ...NovelXCharacterVisual.MANIFEST_PATH.split("/"))
    const text = yield* fs.readFileStringSafe(manifestPath)
    if (!text) throw new Error("NOVELX_CHARACTER_PORTRAIT_MANIFEST_REQUIRED")
    const manifest = verifyCharacterVisual(
      Schema.decodeUnknownSync(NovelXCharacterVisual.Manifest)(JSON.parse(text)),
      character.manifest,
    )
    return { character, manifest, manifestPath, manifestExisted: true }
  })
}

export function persistCharacterVisual(
  fs: FSUtil.Interface,
  events: EventV2.Interface,
  runtime: Pick<CharacterVisualRuntime, "character" | "manifestPath" | "manifestExisted">,
  manifest: NovelXCharacterVisual.Manifest,
) {
  return withWorldMutation(
    Effect.gen(function* () {
      const temporary = `${runtime.manifestPath}.${process.pid}.${randomUUID()}.tmp`
      yield* fs.ensureDir(path.dirname(runtime.manifestPath))
      yield* fs.writeFileString(temporary, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }).pipe(
        Effect.andThen(fs.rename(temporary, runtime.manifestPath)),
        Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
      )
      yield* publishWorldFile(events, runtime.manifestPath, runtime.manifestExisted ? "change" : "add")
    }),
  )
}

export function loadCharacterVisualLanguage(fs: FSUtil.Interface, character: CharacterRuntime) {
  return Effect.gen(function* () {
    const manifestPath = path.join(character.world.directory, ...NovelXWorldVisual.MANIFEST_PATH.split("/"))
    const text = yield* fs.readFileStringSafe(manifestPath)
    if (!text) throw new Error("NOVELX_WORLD_VISUAL_MANIFEST_REQUIRED")
    return verifyWorldVisuals({
      manifest: Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(JSON.parse(text)),
      materialization: character.world.materialization,
    }).visualLanguage
  })
}

export function assertCharacterPortraitBranch(ctx: Tool.Context) {
  if (ctx.agent !== "novelx-visual-editor") throw new Error("NOVELX_VISUAL_TOOL_REQUIRED")
}

