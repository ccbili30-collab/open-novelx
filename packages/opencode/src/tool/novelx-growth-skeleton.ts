import path from "node:path"
import { Effect, Schema } from "effect"
import { NovelXGrowth } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { GrowthSkeletonError, compileNovelXGrowthSkeleton, verifyNovelXGrowthSkeleton } from "@/novelx/growth-skeleton"
import { Tool } from "@/tool/tool"

export const Parameters = NovelXGrowth.Profile
const TOOL_ID = "novelx_register_growth_skeleton"

type Metadata = {
  path: string
  replayed: boolean
  profileSha256: string
  counts: {
    files: number
    worldLayers: number
    worldSlots: number
    characterGroups: number
    characterSlots: number
    graphViews: number
    chapters: number
  }
}

export const NovelXGrowthSkeletonTool = Tool.define<
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
        "Register the first NovelX Growth skeleton after privately reasoning about genre, scale, layers, and counts.",
        "This is the only terminal tool for the registration stage. It creates planned roads only: no lore, facts, named characters, relations, chapter prose, images, paths, or IDs may be invented by the model.",
        "The Harness validates and compiles the six NovelX surfaces. Call exactly once after the profile is complete.",
      ].join(" "),
      parameters: Parameters,
      execute: (profile, ctx) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const target = path.join(instance.directory, ...NovelXGrowth.MANIFEST_PATH.split("/"))
          const next = compileNovelXGrowthSkeleton({
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
            const manifest = decodeManifest(existing)
            assertNotDuplicateTurn(manifest, ctx)
            if (manifest.source.profileSha256 !== next.source.profileSha256) {
              throw new GrowthSkeletonError(
                "NOVELX_GROWTH_SKELETON_CONFLICT",
                "A different Growth skeleton is already registered. Revision is not implemented in this stage.",
              )
            }
            return result(manifest, true)
          }

          yield* ctx.ask({
            permission: TOOL_ID,
            patterns: [NovelXGrowth.MANIFEST_PATH],
            always: [NovelXGrowth.MANIFEST_PATH],
            metadata: { path: NovelXGrowth.MANIFEST_PATH, profileSha256: next.source.profileSha256 },
          })

          yield* fs.ensureDir(path.dirname(target))
          const created = yield* fs.writeFileString(target, JSON.stringify(next, null, 2) + "\n", { flag: "wx" }).pipe(
            Effect.as(true),
            Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.succeed(false)),
          )
          if (!created) {
            const raced = yield* fs.readFileStringSafe(target)
            if (raced === undefined) {
              throw new GrowthSkeletonError(
                "NOVELX_GROWTH_SKELETON_RACE",
                "Growth skeleton registration raced with another writer and no valid result is available.",
              )
            }
            const manifest = decodeManifest(raced)
            assertNotDuplicateTurn(manifest, ctx)
            if (manifest.source.profileSha256 !== next.source.profileSha256) {
              throw new GrowthSkeletonError(
                "NOVELX_GROWTH_SKELETON_CONFLICT",
                "A different Growth skeleton won the registration race.",
              )
            }
            return result(manifest, true)
          }

          yield* events.publish(FileSystem.Event.Edited, { file: target })
          yield* events.publish(Watcher.Event.Updated, { file: target, event: "add" })
          return result(next, false)
        }).pipe(Effect.orDie),
    }
  }),
)

function decodeManifest(content: string) {
  const manifest = Schema.decodeUnknownSync(NovelXGrowth.Manifest)(JSON.parse(content))
  return verifyNovelXGrowthSkeleton(manifest)
}

function assertNotDuplicateTurn(manifest: NovelXGrowth.Manifest, ctx: Tool.Context) {
  if (manifest.source.sessionId !== ctx.sessionID || manifest.source.messageId !== ctx.messageID) return
  throw new GrowthSkeletonError(
    "NOVELX_GROWTH_DUPLICATE_TURN",
    "The Growth skeleton was already registered by this user turn. Do not call the terminal tool again; summarize the registered result and stop.",
  )
}

function result(manifest: NovelXGrowth.Manifest, replayed: boolean) {
  const counts = {
    files: manifest.surfaces.files.items.length,
    worldLayers: manifest.surfaces.world.layers.length,
    worldSlots: manifest.surfaces.world.layers.reduce((total, layer) => total + layer.slots.length, 0),
    characterGroups: manifest.surfaces.characters.groups.length,
    characterSlots: manifest.surfaces.characters.groups.reduce((total, group) => total + group.slots.length, 0),
    graphViews: manifest.surfaces.graph.views.length,
    chapters: manifest.surfaces.story.chapters.length,
  }
  return {
    title: replayed ? "生长骨架已存在" : "生长骨架已注册",
    metadata: {
      path: NovelXGrowth.MANIFEST_PATH,
      replayed,
      profileSha256: manifest.source.profileSha256,
      counts,
    },
    output: [
      replayed ? "相同的生长骨架已经注册，本次为幂等重放。" : `已注册“${manifest.profile.title}”的生长骨架。`,
      `题材：${manifest.profile.genre.label}；尺度：${manifest.profile.genre.scale}。`,
      `世界 ${counts.worldLayers} 层 / ${counts.worldSlots} 个待填充槽位；角色 ${counts.characterGroups} 组 / ${counts.characterSlots} 个待填充槽位；图谱 ${counts.graphViews} 个空视图；故事 ${counts.chapters} 个标准空章节。`,
      `六个工作面共投影 ${counts.files} 个待物化文件路径；尚未生成任何正式内容。`,
    ].join("\n"),
  }
}
