import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema, Semaphore } from "effect"
import { NovelXWorld } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { verifyWorldBlueprint } from "@/novelx/world-blueprint"
import { createWorldMaterialization, verifyWorldMaterialization } from "@/novelx/world-materialization"
import type { Tool } from "@/tool/tool"

export type WorldRuntime = {
  directory: string
  blueprintPath: string
  materializationPath: string
  blueprint: NovelXWorld.BlueprintManifest
  materialization: NovelXWorld.WorldMaterialization
  materializationExisted: boolean
}

const mutationLock = Semaphore.makeUnsafe(1)

export function withWorldMutation<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return mutationLock.withPermits(1)(effect)
}

export function loadWorldRuntime(fs: FSUtil.Interface, options: { createForSession?: string } = {}) {
  return Effect.gen(function* () {
    const instance = yield* InstanceState.context
    const blueprintPath = absoluteWorldPath(instance.directory, NovelXWorld.BLUEPRINT_PATH)
    const materializationPath = absoluteWorldPath(instance.directory, NovelXWorld.MATERIALIZATION_PATH)
    const blueprintText = yield* fs.readFileStringSafe(blueprintPath)
    if (blueprintText === undefined) {
      throw new Error("NOVELX_WORLD_BLUEPRINT_REQUIRED: Register the adaptive world blueprint first.")
    }
    const blueprint = verifyWorldBlueprint(
      Schema.decodeUnknownSync(NovelXWorld.BlueprintManifest)(JSON.parse(blueprintText)),
    )
    const stateText = yield* fs.readFileStringSafe(materializationPath)
    const materialization = stateText
      ? verifyWorldMaterialization({
          manifest: Schema.decodeUnknownSync(NovelXWorld.WorldMaterialization)(JSON.parse(stateText)),
          blueprint,
        })
      : options.createForSession
        ? createWorldMaterialization({ blueprint, growthSessionId: options.createForSession, now: Date.now() })
        : undefined
    if (!materialization) {
      throw new Error("NOVELX_WORLD_MATERIALIZATION_REQUIRED: Prepare a world stage first.")
    }
    return {
      directory: instance.directory,
      blueprintPath,
      materializationPath,
      blueprint,
      materialization,
      materializationExisted: stateText !== undefined,
    }
  })
}

export function loadCommittedWorldDocuments(fs: FSUtil.Interface, runtime: WorldRuntime) {
  return Effect.gen(function* () {
    const entries = yield* Effect.all(
      runtime.materialization.documents
        .filter((document) => document.status === "committed")
        .map((document) =>
          Effect.gen(function* () {
            const content = yield* fs.readFileStringSafe(absoluteWorldPath(runtime.directory, document.targetPath))
            if (content === undefined) {
              throw new Error(
                `NOVELX_WORLD_COMMITTED_DOCUMENT_MISSING: ${document.targetPath} is committed but absent on disk.`,
              )
            }
            return [document.entityId, content] as const
          }),
        ),
      { concurrency: 8 },
    )
    return Object.fromEntries(entries)
  })
}

export function persistWorldMaterialization(
  fs: FSUtil.Interface,
  events: EventV2.Interface,
  runtime: WorldRuntime,
  manifest: NovelXWorld.WorldMaterialization,
  event: "add" | "change" = "change",
) {
  return Effect.gen(function* () {
    yield* fs.ensureDir(path.dirname(runtime.materializationPath))
    const temporary = `${runtime.materializationPath}.${process.pid}.${randomUUID()}.tmp`
    yield* fs.writeFileString(temporary, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }).pipe(
      Effect.andThen(fs.rename(temporary, runtime.materializationPath)),
      Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
    )
    yield* events.publish(FileSystem.Event.Edited, { file: runtime.materializationPath })
    yield* events.publish(Watcher.Event.Updated, { file: runtime.materializationPath, event })
  })
}

export function publishWorldFile(events: EventV2.Interface, target: string, event: "add" | "change") {
  return Effect.gen(function* () {
    yield* events.publish(FileSystem.Event.Edited, { file: target })
    yield* events.publish(Watcher.Event.Updated, { file: target, event })
  })
}

export function absoluteWorldPath(directory: string, relative: string) {
  return path.join(directory, ...relative.split("/"))
}

export function assertWorldGrowthEditor(ctx: Tool.Context) {
  if (ctx.agent !== "growth") {
    throw new Error("NOVELX_GROWTH_EDITOR_REQUIRED: This internal tool may only run in the Growth editor session.")
  }
}

export function assertWorldStageEditor(ctx: Tool.Context) {
  if (ctx.agent !== "novelx-stage-editor") {
    throw new Error(
      "NOVELX_STAGE_EDITOR_REQUIRED: This internal tool may only run in a bound NovelX stage editor session.",
    )
  }
}

export function assertWorldVisualEditor(ctx: Tool.Context) {
  if (ctx.agent !== "novelx-visual-editor") {
    throw new Error("NOVELX_VISUAL_EDITOR_REQUIRED: This tool may only run in the NovelX visual editor session.")
  }
}

export function assertWorldPublicationEditor(ctx: Tool.Context) {
  if (ctx.agent !== "novelx-publication-editor") {
    throw new Error(
      "NOVELX_PUBLICATION_EDITOR_REQUIRED: This tool may only run in the NovelX publication editor session.",
    )
  }
}
