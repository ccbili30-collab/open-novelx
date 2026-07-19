import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema, Semaphore } from "effect"
import { NovelXGrowth } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { verifyNovelXGrowthSkeleton } from "@/novelx/growth-skeleton"
import { createGeographyMaterialization, verifyGeographyMaterialization } from "@/novelx/geography-materialization"
import type { Tool } from "@/tool/tool"

export type GeographyRuntime = {
  directory: string
  skeletonPath: string
  materializationPath: string
  skeleton: NovelXGrowth.Manifest
  materialization: NovelXGrowth.GeographyMaterialization
  materializationExisted: boolean
}

const mutationLock = Semaphore.makeUnsafe(1)

export function withGeographyMutation<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return mutationLock.withPermits(1)(effect)
}

export function loadGeographyRuntime(fs: FSUtil.Interface, options: { createForSession?: string } = {}) {
  return Effect.gen(function* () {
    const instance = yield* InstanceState.context
    const skeletonPath = absolute(instance.directory, NovelXGrowth.MANIFEST_PATH)
    const materializationPath = absolute(instance.directory, NovelXGrowth.MATERIALIZATION_PATH)
    const skeletonText = yield* fs.readFileStringSafe(skeletonPath)
    if (skeletonText === undefined) {
      throw new Error(
        "NOVELX_GEOGRAPHY_SKELETON_REQUIRED: Register the terrain skeleton before materializing geography.",
      )
    }
    const skeleton = verifyNovelXGrowthSkeleton(
      Schema.decodeUnknownSync(NovelXGrowth.Manifest)(JSON.parse(skeletonText)),
    )
    const stateText = yield* fs.readFileStringSafe(materializationPath)
    const materialization = stateText
      ? verifyGeographyMaterialization({
          manifest: Schema.decodeUnknownSync(NovelXGrowth.GeographyMaterialization)(JSON.parse(stateText)),
          skeleton,
        })
      : options.createForSession
        ? createGeographyMaterialization({
            skeleton,
            growthSessionId: options.createForSession,
            now: Date.now(),
          })
        : undefined
    if (!materialization) {
      throw new Error("NOVELX_GEOGRAPHY_MATERIALIZATION_REQUIRED: Prepare a geography document first.")
    }
    return {
      directory: instance.directory,
      skeletonPath,
      materializationPath,
      skeleton,
      materialization,
      materializationExisted: stateText !== undefined,
    }
  })
}

export function persistGeographyMaterialization(
  fs: FSUtil.Interface,
  events: EventV2.Interface,
  runtime: GeographyRuntime,
  manifest: NovelXGrowth.GeographyMaterialization,
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

export function publishGeographyFile(events: EventV2.Interface, target: string, event: "add" | "change") {
  return Effect.gen(function* () {
    yield* events.publish(FileSystem.Event.Edited, { file: target })
    yield* events.publish(Watcher.Event.Updated, { file: target, event })
  })
}

export function absolute(directory: string, relative: string) {
  return path.join(directory, ...relative.split("/"))
}

export function assertGrowthEditor(ctx: Tool.Context) {
  if (ctx.agent !== "growth") {
    throw new Error("NOVELX_GROWTH_EDITOR_REQUIRED: This internal tool may only run in the Growth editor session.")
  }
}
