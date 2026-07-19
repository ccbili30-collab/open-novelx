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
import { assertGrowthEditor } from "./novelx-geography-runtime"

export const Parameters = NovelXGrowth.Profile
const TOOL_ID = "novelx_register_growth_skeleton"

type Metadata = {
  path: string
  replayed: boolean
  profileSha256: string
  counts: {
    terrainNodes: number
    terrainRelations: number
    coreTerrain: number
    surroundingWaters: number
  }
  terrain: Array<{ id: string; name: string; kind: NovelXGrowth.TerrainKind }>
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
        "Register the first NovelX Growth terrain after privately planning one main continent and its surrounding waters.",
        "Submit specific named terrain, concrete summaries, formation logic, normalized map placement, and explicit spatial relations. Numbered placeholders and empty-content markers are forbidden.",
        "This stage registers terrain only. Do not create nations, civilizations, organizations, characters, story prose, images, paths, IDs, hashes, or completion claims. Call exactly once after the terrain is coherent.",
      ].join(" "),
      parameters: Parameters,
      execute: (profile, ctx) =>
        Effect.gen(function* () {
          assertGrowthEditor(ctx)
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
            if (manifest.source.profileSha256 !== next.source.profileSha256) {
              throw new GrowthSkeletonError(
                "NOVELX_GROWTH_SKELETON_CONFLICT",
                "A different Growth skeleton is already registered. Revision is not implemented in this stage.",
              )
            }
            if (manifest.source.toolCallId === ctx.callID) return result(manifest, true)
            assertNotDuplicateTurn(manifest, ctx)
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
            if (manifest.source.profileSha256 !== next.source.profileSha256) {
              throw new GrowthSkeletonError(
                "NOVELX_GROWTH_SKELETON_CONFLICT",
                "A different Growth skeleton won the registration race.",
              )
            }
            if (manifest.source.toolCallId === ctx.callID) return result(manifest, true)
            assertNotDuplicateTurn(manifest, ctx)
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
    terrainNodes: manifest.terrain.nodes.length,
    terrainRelations: manifest.terrain.relations.length,
    coreTerrain: manifest.terrain.nodes.filter((node) => node.prominence === "core").length,
    surroundingWaters: manifest.terrain.nodes.filter(
      (node) => node.parentId === null && (node.kind === "ocean" || node.kind === "sea"),
    ).length,
  }
  return {
    title: replayed ? "世界地形已存在" : "世界地形已注册",
    metadata: {
      path: NovelXGrowth.MANIFEST_PATH,
      replayed,
      profileSha256: manifest.source.profileSha256,
      counts,
      terrain: manifest.terrain.nodes.map((node) => ({ id: node.id, name: node.name, kind: node.kind })),
    },
    output: [
      replayed ? "相同的世界地形已经注册，本次为幂等重放。" : `已注册“${manifest.profile.title}”的世界地形。`,
      `题材：${manifest.profile.genre.label}；尺度：${manifest.profile.genre.scale}。`,
      `已注册 ${counts.terrainNodes} 个具名地形与 ${counts.terrainRelations} 条空间关系，其中 ${counts.coreTerrain} 个核心地形、${counts.surroundingWaters} 片周边海域。`,
      "地理物化清单（按此顺序逐项准备、派发、审核和提交）：",
      ...manifest.terrain.nodes.map((node) => `- ${node.id} | ${node.name} | ${node.kind}`),
      "本阶段没有注册国家、文明、角色、故事或图片。",
    ].join("\n"),
  }
}
