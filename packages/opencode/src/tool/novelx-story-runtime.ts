import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import * as NovelXStory from "@opencode-ai/schema/novelx-story"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { EventV2Bridge } from "@/event-v2-bridge"
import { createStoryMaterialization, verifyStoryMaterialization } from "@/novelx/story-materialization"
import { worldSha256 } from "@/novelx/world-blueprint"
import type { Tool } from "@/tool/tool"
import { absoluteWorldPath, loadWorldRuntime, publishWorldFile, withWorldMutation, type WorldRuntime } from "./novelx-world-runtime"

export type StoryRuntime = {
  world: WorldRuntime
  manifest: NovelXStory.Materialization
  manifestPath: string
  manifestExisted: boolean
}

export function loadStoryRuntime(fs: FSUtil.Interface, options: { createForSession?: string } = {}) {
  return Effect.gen(function* () {
    const world = yield* loadWorldRuntime(fs)
    if (world.materialization.status !== "completed") {
      throw new Error("NOVELX_STORY_WORLD_INCOMPLETE: Story Growth requires a frozen completed world.")
    }
    const entities = new Map(world.materialization.stages.flatMap((stage) => stage.entities.map((entity) => [entity.id, entity])))
    const sources = world.materialization.documents.map((document) => {
      const entity = entities.get(document.entityId)
      if (!entity || document.status !== "committed" || !document.committedSha256) {
        throw new Error("NOVELX_STORY_WORLD_SOURCE_INVALID: The frozen world contains an unfinished dossier.")
      }
      return { entityId: entity.id, title: entity.name, path: document.targetPath, sha256: document.committedSha256 }
    })
    const manifestPath = absoluteWorldPath(world.directory, NovelXStory.MATERIALIZATION_PATH)
    const text = yield* fs.readFileStringSafe(manifestPath)
    const manifest = text
      ? verifyStoryMaterialization(Schema.decodeUnknownSync(NovelXStory.Materialization)(JSON.parse(text)))
      : options.createForSession
        ? createStoryMaterialization({
            world: {
              title: world.blueprint.profile.title,
              materializationIntegritySha256: world.materialization.integritySha256,
              sources,
            },
            editorSessionId: options.createForSession,
            now: Date.now(),
          })
        : undefined
    if (!manifest) throw new Error("NOVELX_STORY_MATERIALIZATION_REQUIRED: Prepare Story Growth first.")
    if (manifest.world.materializationIntegritySha256 !== world.materialization.integritySha256) {
      throw new Error("NOVELX_STORY_WORLD_DRIFT: Story Growth belongs to a different frozen world.")
    }
    return { world, manifest, manifestPath, manifestExisted: text !== undefined }
  })
}

export function loadStoryWorldContents(fs: FSUtil.Interface, runtime: StoryRuntime) {
  return Effect.gen(function* () {
    const pairs = yield* Effect.all(
      runtime.manifest.world.sources.map((source) =>
        Effect.gen(function* () {
          const content = yield* fs.readFileStringSafe(absoluteWorldPath(runtime.world.directory, source.path))
          if (!content || worldSha256(content) !== source.sha256) {
            throw new Error(`NOVELX_STORY_SOURCE_DRIFT: ${source.path} is absent or changed after world freeze.`)
          }
          return [source.entityId, content] as const
        }),
      ),
      { concurrency: 8 },
    )
    return Object.fromEntries(pairs)
  })
}

export function loadCommittedStoryContents(fs: FSUtil.Interface, runtime: StoryRuntime) {
  return Effect.gen(function* () {
    const pairs = yield* Effect.all(
      runtime.manifest.documents
        .filter((document) => document.status === "committed")
        .map((document) =>
          Effect.gen(function* () {
            const content = yield* fs.readFileStringSafe(absoluteWorldPath(runtime.world.directory, document.targetPath))
            if (!content || worldSha256(content.replaceAll("\r\n", "\n").trim() + "\n") !== document.committedSha256) {
              throw new Error(`NOVELX_STORY_COMMITTED_DOCUMENT_DRIFT: ${document.targetPath} is absent or changed.`)
            }
            return [document.id, content] as const
          }),
        ),
      { concurrency: 8 },
    )
    return Object.fromEntries(pairs)
  })
}

export function persistStoryMaterialization(
  fs: FSUtil.Interface,
  events: EventV2.Interface,
  runtime: StoryRuntime,
  manifest: NovelXStory.Materialization,
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

export function withStoryMutation<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return withWorldMutation(effect)
}

export function assertStoryEditor(ctx: Tool.Context) {
  if (ctx.agent !== "novelx-story-editor") throw new Error("NOVELX_STORY_EDITOR_REQUIRED: This tool requires the Story editor.")
}

export function absoluteStoryPath(directory: string, relative: string) {
  return path.join(directory, ...relative.split("/"))
}
