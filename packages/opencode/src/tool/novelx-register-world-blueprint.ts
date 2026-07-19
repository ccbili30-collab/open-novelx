import path from "node:path"
import { Effect, Schema } from "effect"
import { NovelXWorld } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { compileWorldBlueprint, verifyWorldBlueprint, WorldBlueprintError } from "@/novelx/world-blueprint"
import { Tool } from "@/tool/tool"
import { assertWorldGrowthEditor, withWorldMutation } from "./novelx-world-runtime"

const TOOL_ID = "novelx_register_world_blueprint"
export const Parameters = NovelXWorld.BlueprintProfile
type Metadata = {
  path: string
  replayed: boolean
  profileSha256: string
  stages: Array<{ id: string; label: string; itemCount: number; dependsOnStageIds: readonly string[] }>
}

export const NovelXRegisterWorldBlueprintTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: [
        "Register one genre-adaptive NovelX world blueprint before creating any world entity.",
        "The model freely chooses layer labels, counts, dependencies, reasoning focus, and domain sections. Do not assume nations, races, religions, geography, or any other fixed taxonomy.",
        "Every layer must have a concrete purpose and bounded entity count. This tool registers roads only; it does not create numbered placeholders or formal documents.",
      ].join(" "),
      parameters: Parameters,
      execute: (profile, ctx) =>
        withWorldMutation(
          Effect.gen(function* () {
            assertWorldGrowthEditor(ctx)
            const instance = yield* InstanceState.context
            const target = path.join(instance.directory, ...NovelXWorld.BLUEPRINT_PATH.split("/"))
            const next = compileWorldBlueprint({
              profile,
              source: {
                sessionId: ctx.sessionID,
                messageId: ctx.messageID,
                toolCallId: ctx.callID ?? null,
                registeredAt: Date.now(),
              },
            })
            const existing = yield* fs.readFileStringSafe(target)
            if (existing !== undefined) {
              const current = verifyWorldBlueprint(
                Schema.decodeUnknownSync(NovelXWorld.BlueprintManifest)(JSON.parse(existing)),
              )
              if (current.source.profileSha256 !== next.source.profileSha256) {
                throw new WorldBlueprintError(
                  "NOVELX_WORLD_BLUEPRINT_CONFLICT",
                  "A different world blueprint is already registered. Revision is not implemented.",
                )
              }
              return result(current, true)
            }
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [NovelXWorld.BLUEPRINT_PATH],
              always: [NovelXWorld.BLUEPRINT_PATH],
              metadata: { path: NovelXWorld.BLUEPRINT_PATH, profileSha256: next.source.profileSha256 },
            })
            yield* fs.ensureDir(path.dirname(target))
            yield* fs.writeFileString(target, JSON.stringify(next, null, 2) + "\n", { flag: "wx" })
            yield* events.publish(FileSystem.Event.Edited, { file: target })
            yield* events.publish(Watcher.Event.Updated, { file: target, event: "add" })
            return result(next, false)
          }),
        ).pipe(Effect.orDie),
    }
  }),
)

function result(manifest: NovelXWorld.BlueprintManifest, replayed: boolean) {
  return {
    title: replayed ? "世界蓝图已存在" : "世界蓝图已注册",
    metadata: {
      path: NovelXWorld.BLUEPRINT_PATH,
      replayed,
      profileSha256: manifest.source.profileSha256,
      stages: manifest.stages.map((stage) => ({
        id: stage.id,
        label: stage.label,
        itemCount: stage.itemCount,
        dependsOnStageIds: stage.dependsOnStageIds,
      })),
    },
    output: [
      replayed ? "相同世界蓝图已存在，本次为幂等重放。" : `已为“${manifest.profile.title}”注册题材自适应世界蓝图。`,
      `题材：${manifest.profile.genre.label}；尺度：${manifest.profile.genre.scale}。`,
      "世界层按以下顺序生长：",
      ...manifest.stages.map(
        (stage) =>
          `- ${stage.id} | ${stage.label} | ${stage.itemCount} 项 | 依赖 ${stage.dependsOnStageIds.length} 个前序层`,
      ),
      `下一步必须从 ${manifest.stages[0]!.id} 调用 novelx_prepare_world_stage；不得自行写正式文件。`,
    ].join("\n"),
  }
}
