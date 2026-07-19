import { afterEach, describe, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { Truncate } from "@/tool/truncate"
import { NovelXGrowthSkeletonTool } from "@/tool/novelx-growth-skeleton"
import { NovelXPrepareGeographyTool } from "@/tool/novelx-prepare-geography"
import { NovelXCommitGeographyTool } from "@/tool/novelx-commit-geography"
import { NovelXFinishGeographyTool } from "@/tool/novelx-finish-geography"
import { ToolRegistry } from "@/tool/registry"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { fantasyTerrain } from "../novelx/growth-skeleton.fixture"

const layer = LayerNode.compile(
  LayerNode.group([
    Agent.node,
    BackgroundJob.node,
    Config.node,
    CrossSpawnSpawner.node,
    Database.node,
    EventV2Bridge.node,
    FSUtil.node,
    Ripgrep.node,
    RuntimeFlags.node,
    Session.node,
    SessionProjector.node,
    SessionRunState.node,
    SessionStatus.node,
    ToolRegistry.node,
    Truncate.node,
  ]),
)
const it = testEffect(layer)
const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

afterEach(async () => {
  await disposeAllInstances()
})

describe("NovelX geography tools", () => {
  it.instance("binds a real child session, commits its final output, and blocks early finish", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const sessions = yield* Session.Service
      const parent = yield* sessions.create({ title: "Growth", agent: "growth" })
      const messageID = MessageID.ascending()
      const context = {
        sessionID: parent.id,
        messageID,
        callID: "call-growth",
        agent: "growth",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }
      const skeleton = yield* (yield* NovelXGrowthSkeletonTool).init()
      yield* skeleton.execute(fantasyTerrain, context)
      const manifest = JSON.parse(
        yield* Effect.promise(() =>
          fs.readFile(path.join(test.directory, ".novelx", "growth", "skeleton.json"), "utf8"),
        ),
      )
      const terrain = manifest.terrain.nodes[0]
      const secondTerrain = manifest.terrain.nodes[1]
      const prepare = yield* (yield* NovelXPrepareGeographyTool).init()
      const [prepared] = yield* Effect.all(
        [
          prepare.execute({ terrainId: terrain.id }, { ...context, callID: "call-prepare-1" }),
          prepare.execute({ terrainId: secondTerrain.id }, { ...context, callID: "call-prepare-2" }),
        ],
        { concurrency: "unbounded" },
      )
      const concurrentState = JSON.parse(
        yield* Effect.promise(() =>
          fs.readFile(path.join(test.directory, ".novelx", "growth", "geography-materialization.json"), "utf8"),
        ),
      )
      expect(prepared.output).toContain("Context Pack")
      expect(prepared.metadata.targetPath).toBe("World/地理/埃兰大陆.md")
      expect(
        concurrentState.records.find((record: { terrainId: string }) => record.terrainId === terrain.id).status,
      ).toBe("leased")
      expect(
        concurrentState.records.find((record: { terrainId: string }) => record.terrainId === secondTerrain.id).status,
      ).toBe("leased")

      const finish = yield* (yield* NovelXFinishGeographyTool).init()
      expect((yield* finish.execute({}, { ...context, callID: "call-finish-early" }).pipe(Effect.exit))._tag).toBe(
        "Failure",
      )

      const child = yield* sessions.create({ parentID: parent.id, title: "地理：埃兰大陆", agent: "novelx-geography" })
      const assistant: SessionV1.Assistant = {
        id: MessageID.ascending(),
        role: "assistant",
        parentID: MessageID.ascending(),
        sessionID: child.id,
        mode: "novelx-geography",
        agent: "novelx-geography",
        cost: 0,
        path: { cwd: test.directory, root: test.directory },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ref.modelID,
        providerID: ref.providerID,
        time: { created: Date.now() },
        finish: "stop",
      }
      yield* sessions.updateMessage(assistant)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: assistant.id,
        sessionID: child.id,
        type: "text",
        text: dossier("埃兰大陆"),
      })
      const commit = yield* (yield* NovelXCommitGeographyTool).init()
      const result = yield* commit.execute(
        { terrainId: terrain.id, taskSessionId: child.id },
        { ...context, callID: "call-commit" },
      )
      const official = yield* Effect.promise(() =>
        fs.readFile(path.join(test.directory, "World", "地理", "埃兰大陆.md"), "utf8"),
      )
      expect(result.metadata.taskSessionId).toBe(child.id)
      expect(official).toStartWith("# 埃兰大陆\n")
      expect(official).toContain("## 因果推演")
    }),
  )
})

function dossier(name: string) {
  const detail =
    "北部抬升的古老陆块控制坡向与径流，中央缓坡承接侵蚀物，南缘陆架连接暖海。高差让冷湿空气在迎风坡凝结，背风侧相对干燥；河流沿构造低地汇集，季节洪水持续改造冲积平原。"
  return [
    `# ${name}`,
    "",
    "## 事实依据",
    detail.repeat(2),
    "",
    "## 因果推演",
    detail.repeat(2),
    "",
    "## 地貌与空间",
    detail.repeat(2),
    "",
    "## 气候与生态",
    detail.repeat(2),
    "",
    "## 资源与通行",
    detail.repeat(2),
    "",
    "## 风险与限制",
    detail.repeat(2),
    "",
    "## 关系",
    detail.repeat(2),
  ].join("\n")
}
