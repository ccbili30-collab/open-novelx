import { afterEach, describe, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { NovelXGrowth } from "@opencode-ai/schema"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Truncate } from "@/tool/truncate"
import { Agent } from "@/agent/agent"
import { NovelXGrowthSkeletonTool } from "@/tool/novelx-growth-skeleton"
import { MessageID, SessionID } from "@/session/schema"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { fantasyTerrain as profile } from "../novelx/growth-skeleton.fixture"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, EventV2Bridge.node, Truncate.node, Agent.node])))

const context = {
  sessionID: SessionID.make("ses_growth"),
  messageID: MessageID.make("msg_growth"),
  callID: "call-growth",
  agent: "growth",
  abort: new AbortController().signal,
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}
const replayContext = {
  ...context,
  messageID: MessageID.make("msg_growth_retry"),
  callID: "call-growth-retry",
}

afterEach(async () => {
  await disposeAllInstances()
})

describe("tool.novelx_register_growth_skeleton", () => {
  it.instance("creates one hidden authoritative manifest and replays the same profile", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const info = yield* NovelXGrowthSkeletonTool
      const tool = yield* info.init()
      const first = yield* tool.execute(profile, context)
      const second = yield* tool.execute(profile, replayContext)
      const target = path.join(test.directory, ...NovelXGrowth.MANIFEST_PATH.split("/"))
      const manifest = JSON.parse(yield* Effect.promise(() => fs.readFile(target, "utf8"))) as NovelXGrowth.Manifest

      expect(first.metadata.replayed).toBe(false)
      expect(second.metadata.replayed).toBe(true)
      expect(manifest.profile.title).toBe("埃兰世界")
      expect(manifest.terrain.nodes.some((node) => node.name === "北境冠脉")).toBe(true)
      expect((yield* Effect.promise(() => fs.readdir(test.directory))).includes(".novelx")).toBe(true)
      expect(first.output).toContain("具名地形")
      expect(first.output).toContain(manifest.terrain.nodes[0].id)
      expect(first.metadata.terrain).toHaveLength(manifest.terrain.nodes.length)
      expect(first.output).toContain("没有注册国家、文明、角色、故事或图片")
    }),
  )

  it.instance("replays the same call ID but rejects a distinct second registration call from the same user turn", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const info = yield* NovelXGrowthSkeletonTool
      const tool = yield* info.init()
      yield* tool.execute(profile, context)
      const target = path.join(test.directory, ...NovelXGrowth.MANIFEST_PATH.split("/"))
      const before = yield* Effect.promise(() => fs.readFile(target, "utf8"))
      const replay = yield* tool.execute(profile, context)
      const duplicate = yield* tool.execute(profile, { ...context, callID: "call-growth-duplicate" }).pipe(Effect.exit)

      expect(replay.metadata.replayed).toBe(true)
      expect(duplicate._tag).toBe("Failure")
      expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe(before)
    }),
  )

  it.instance("fails closed for a different profile and preserves the first manifest", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const info = yield* NovelXGrowthSkeletonTool
      const tool = yield* info.init()
      yield* tool.execute(profile, context)
      const target = path.join(test.directory, ...NovelXGrowth.MANIFEST_PATH.split("/"))
      const before = yield* Effect.promise(() => fs.readFile(target, "utf8"))
      const exit = yield* tool.execute({ ...profile, title: "另一世界" }, context).pipe(Effect.exit)
      const after = yield* Effect.promise(() => fs.readFile(target, "utf8"))

      expect(exit._tag).toBe("Failure")
      expect(after).toBe(before)
    }),
  )

  it.instance("fails closed for a corrupt existing manifest", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const target = path.join(test.directory, ...NovelXGrowth.MANIFEST_PATH.split("/"))
      yield* Effect.promise(() => fs.mkdir(path.dirname(target), { recursive: true }))
      yield* Effect.promise(() => fs.writeFile(target, "{broken", "utf8"))
      const info = yield* NovelXGrowthSkeletonTool
      const tool = yield* info.init()
      const exit = yield* tool.execute(profile, context).pipe(Effect.exit)

      expect(exit._tag).toBe("Failure")
      expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("{broken")
    }),
  )
})
