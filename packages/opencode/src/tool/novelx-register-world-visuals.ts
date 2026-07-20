import path from "node:path"
import { Effect, Schema } from "effect"
import { NovelXWorldVisual } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Provider } from "@/provider/provider"
import { compileWorldVisuals, verifyWorldVisuals } from "@/novelx/world-visual"
import { runWorldImageQueue } from "@/novelx/world-image-queue"
import { Tool } from "@/tool/tool"
import { assertWorldVisualEditor, loadWorldRuntime, withWorldMutation } from "./novelx-world-runtime"

const TOOL_ID = "novelx_register_world_visuals"
export const Parameters = NovelXWorldVisual.VisualRegistrationProfile
type Metadata = {
  manifestPath: string
  maskPath: string
  integritySha256: string
  cells: number
  features: number
  tasks: number
  replayed: boolean
}

export const NovelXRegisterWorldVisualsTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service | Provider.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const provider = yield* Provider.Service
    return {
      description:
        "Register one authoritative world Atlas mesh, semantic mask, geography/human projections, and a sparse asynchronous map/scenery image queue. This does not generate portraits or covers.",
      parameters: Parameters,
      execute: (profile, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldVisualEditor(ctx)
            const runtime = yield* loadWorldRuntime(fs)
            const manifestPath = path.join(runtime.directory, ...NovelXWorldVisual.MANIFEST_PATH.split("/"))
            const maskPath = path.join(runtime.directory, ...NovelXWorldVisual.SEMANTIC_MASK_PATH.split("/"))
            const existing = yield* fs.readFileStringSafe(manifestPath)
            if (existing) {
              const current = verifyWorldVisuals({
                manifest: Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(JSON.parse(existing)),
                materialization: runtime.materialization,
              })
              return worldVisualRegistrationResult(current, true)
            }
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [NovelXWorldVisual.MANIFEST_PATH, NovelXWorldVisual.SEMANTIC_MASK_PATH, "World/Media/**"],
              always: [NovelXWorldVisual.MANIFEST_PATH, NovelXWorldVisual.SEMANTIC_MASK_PATH, "World/Media/**"],
              metadata: { claims: profile.claims.length, scenery: profile.scenery.length },
            })
            const compiled = yield* Effect.promise(() =>
              compileWorldVisuals({
                blueprint: runtime.blueprint,
                materialization: runtime.materialization,
                profile,
                now: Date.now(),
              }),
            )
            yield* fs.writeWithDirs(maskPath, compiled.maskBytes)
            yield* fs.writeWithDirs(manifestPath, JSON.stringify(compiled.manifest, null, 2) + "\n")
            yield* events.publish(FileSystem.Event.Edited, { file: manifestPath })
            yield* events.publish(Watcher.Event.Updated, { file: manifestPath, event: "add" })
            yield* events.publish(Watcher.Event.Updated, { file: maskPath, event: "add" })
            yield* Effect.forkDetach(
              runWorldImageQueue({ directory: runtime.directory }).pipe(
                Effect.catchCause((cause) => Effect.logError("NovelX image queue failed to start", { cause })),
                Effect.provideService(FSUtil.Service, fs),
                Effect.provideService(EventV2Bridge.Service, events),
                Effect.provideService(Provider.Service, provider),
              ),
            )
            return worldVisualRegistrationResult(compiled.manifest, false)
          }),
        ).pipe(Effect.orDie),
    }
  }),
)

export function worldVisualRegistrationResult(manifest: NovelXWorldVisual.Manifest, replayed: boolean) {
  return {
    title: replayed ? "世界视觉任务已存在" : "世界视觉任务已入队",
    metadata: {
      manifestPath: NovelXWorldVisual.MANIFEST_PATH,
      maskPath: NovelXWorldVisual.SEMANTIC_MASK_PATH,
      integritySha256: manifest.integritySha256,
      cells: manifest.atlas.cells.length,
      features: manifest.atlas.features.length,
      tasks: manifest.tasks.length,
      replayed,
    },
    output: [
      replayed ? "同一世界视觉账本已经存在，本次为幂等读取。" : "权威泰森网格、语义蒙版和异步图片队列已经建立。",
      `${manifest.atlas.cells.length} 个地块；${manifest.atlas.features.length} 个地理/人文投影；${manifest.tasks.length} 个地图/风貌任务。`,
      `视觉清单：${NovelXWorldVisual.MANIFEST_PATH}；完整性 SHA-256：${manifest.integritySha256}。`,
      "图片 Worker 已独立启动，Growth 不等待图片完成。正式 UI 必须读取真实 queued/generating/attached/failed 状态。",
    ].join("\n"),
  }
}
