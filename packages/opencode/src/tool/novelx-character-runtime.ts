import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import { NovelXCharacter } from "@opencode-ai/schema/novelx-character"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import { EventV2Bridge } from "@/event-v2-bridge"
import {
  createCharacterMaterialization,
  verifyCharacterMaterialization,
} from "@/novelx/character-materialization"
import { worldSha256 } from "@/novelx/world-blueprint"
import type { Tool } from "@/tool/tool"
import {
  absoluteWorldPath,
  loadWorldRuntime,
  publishWorldFile,
  withWorldMutation,
  type WorldRuntime,
} from "./novelx-world-runtime"

export type CharacterRuntime = {
  world: WorldRuntime
  manifest: NovelXCharacter.Materialization
  manifestPath: string
  manifestExisted: boolean
}

export function loadCharacterRuntime(fs: FSUtil.Interface, options: { createForSession?: string } = {}) {
  return Effect.gen(function* () {
    const world = yield* loadWorldRuntime(fs)
    if (world.materialization.status !== "completed") {
      throw new Error("NOVELX_CHARACTER_WORLD_INCOMPLETE: Character Growth requires a frozen completed world.")
    }
    const entities = new Map(
      world.materialization.stages.flatMap((stage) => stage.entities.map((entity) => [entity.id, entity])),
    )
    const sources = world.materialization.documents.map((document) => {
      const entity = entities.get(document.entityId)
      if (!entity || document.status !== "committed" || !document.committedSha256) {
        throw new Error("NOVELX_CHARACTER_WORLD_SOURCE_INVALID: The frozen world contains an unfinished dossier.")
      }
      return { entityId: entity.id, title: entity.name, path: document.targetPath, sha256: document.committedSha256 }
    })
    const manifestPath = absoluteWorldPath(world.directory, NovelXCharacter.MATERIALIZATION_PATH)
    const text = yield* fs.readFileStringSafe(manifestPath)
    const manifest = text
      ? verifyCharacterMaterialization(
          Schema.decodeUnknownSync(NovelXCharacter.Materialization)(JSON.parse(text)),
        )
      : options.createForSession
        ? createCharacterMaterialization({
            world: {
              title: world.blueprint.profile.title,
              materializationIntegritySha256: world.materialization.integritySha256,
              sources,
            },
            editorSessionId: options.createForSession,
            now: Date.now(),
          })
        : undefined
    if (!manifest) {
      throw new Error("NOVELX_CHARACTER_MATERIALIZATION_REQUIRED: Prepare Character Growth first.")
    }
    if (manifest.world.materializationIntegritySha256 !== world.materialization.integritySha256) {
      throw new Error("NOVELX_CHARACTER_WORLD_DRIFT: Character Growth belongs to a different frozen world.")
    }
    return { world, manifest, manifestPath, manifestExisted: text !== undefined }
  })
}

export function loadCharacterWorldContents(fs: FSUtil.Interface, runtime: CharacterRuntime) {
  return Effect.gen(function* () {
    const pairs = yield* Effect.all(
      runtime.manifest.world.sources.map((source) =>
        Effect.gen(function* () {
          const content = yield* fs.readFileStringSafe(absoluteWorldPath(runtime.world.directory, source.path))
          if (!content || worldSha256(content) !== source.sha256) {
            throw new Error(`NOVELX_CHARACTER_SOURCE_DRIFT: ${source.path} is absent or changed after world freeze.`)
          }
          return [source.entityId, content] as const
        }),
      ),
      { concurrency: 8 },
    )
    return Object.fromEntries(pairs)
  })
}

export function persistCharacterMaterialization(
  fs: FSUtil.Interface,
  events: EventV2.Interface,
  runtime: CharacterRuntime,
  manifest: NovelXCharacter.Materialization,
) {
  return Effect.gen(function* () {
    const temporary = `${runtime.manifestPath}.${process.pid}.${randomUUID()}.tmp`
    yield* fs.ensureDir(path.dirname(runtime.manifestPath))
    yield* fs.writeFileString(temporary, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }).pipe(
      Effect.andThen(fs.rename(temporary, runtime.manifestPath)),
      Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
    )
    yield* publishWorldFile(events, runtime.manifestPath, runtime.manifestExisted ? "change" : "add")
  })
}

export function withCharacterMutation<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return withWorldMutation(effect)
}

export function assertCharacterEditor(ctx: Tool.Context) {
  if (ctx.agent !== "novelx-character-editor") {
    throw new Error("NOVELX_CHARACTER_EDITOR_REQUIRED: This tool requires the Character editor.")
  }
}

export function absoluteCharacterPath(directory: string, relative: string) {
  return path.join(directory, ...relative.split("/"))
}
