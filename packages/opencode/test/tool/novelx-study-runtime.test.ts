import { afterEach, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Exit, Option } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { loadStudyRuntimeOptional, scanStudyProject } from "@/tool/novelx-study-runtime"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(FSUtil.node))

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("inventories project sources without reading generated, dependency or unsupported binary data as text", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* Effect.promise(async () => {
      await fs.mkdir(path.join(test.directory, "Stories"), { recursive: true })
      await fs.mkdir(path.join(test.directory, "Characters"), { recursive: true })
      await fs.mkdir(path.join(test.directory, ".novelx", "study"), { recursive: true })
      await fs.mkdir(path.join(test.directory, ".novax"), { recursive: true })
      await fs.mkdir(path.join(test.directory, "node_modules", "ignored"), { recursive: true })
      await fs.writeFile(path.join(test.directory, "Stories", "长篇.md"), "# 第一章\n\n雾中的来客。", "utf8")
      await fs.writeFile(path.join(test.directory, "Characters", "来客.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      await fs.writeFile(path.join(test.directory, ".novelx", "study", "stale.txt"), "内部产物", "utf8")
      await fs.writeFile(path.join(test.directory, ".novax", "workspace.db"), Buffer.from([0x00, 0x01]))
      await fs.writeFile(path.join(test.directory, "node_modules", "ignored", "index.md"), "依赖内容", "utf8")
    })

    const fsService = yield* FSUtil.Service
    const scanned = yield* scanStudyProject(fsService, test.directory, "ses-study-runtime")
    expect(scanned.manifest.sources.map((source) => source.relativePath)).toEqual([
      "Characters/来客.png",
      "Stories/长篇.md",
    ])
    expect(scanned.manifest.sources[0]).toMatchObject({ kind: "image", adapterStatus: "adapter_required" })
    expect(scanned.manifest.sources[1]).toMatchObject({ kind: "text", adapterStatus: "ready" })
    expect(scanned.payloads).toHaveLength(1)
    expect(scanned.payloads[0]?.content).toContain("雾中的来客")
  }),
)

it.instance("treats a missing Study ledger as first-run state but fails closed on a corrupt ledger", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    const fsService = yield* FSUtil.Service
    const missing = yield* loadStudyRuntimeOptional(fsService)
    expect(Option.isNone(missing)).toBe(true)

    yield* Effect.promise(async () => {
      const target = path.join(test.directory, ".novelx", "study", "materialization.json")
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, "{not-json", "utf8")
    })
    const corrupt = yield* loadStudyRuntimeOptional(fsService).pipe(Effect.exit)
    expect(Exit.isFailure(corrupt)).toBe(true)
  }),
)
