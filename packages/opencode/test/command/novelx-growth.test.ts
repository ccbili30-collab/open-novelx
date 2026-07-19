import { afterEach, expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Command } from "@/command"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(Command.node))

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("registers /growth as a hidden-agent command with user arguments", () =>
  Effect.gen(function* () {
    const commands = yield* Command.Service
    const growth = yield* commands.get(Command.Default.GROWTH)

    expect(growth).toBeDefined()
    expect(growth?.name).toBe("growth")
    expect(growth?.agent).toBe("growth")
    expect(growth?.source).toBe("command")
    expect(growth?.hints).toEqual(["$ARGUMENTS"])
    expect(yield* Effect.promise(async () => growth?.template)).toContain("题材自适应")
    expect(yield* Effect.promise(async () => growth?.template)).toContain("不要把幻想、科技、国家、种族、宗教")
    expect(yield* Effect.promise(async () => growth?.template)).toContain("禁止编号占位")
  }),
)

it.instance(
  "project config cannot replace the built-in /growth route",
  () =>
    Effect.gen(function* () {
      const commands = yield* Command.Service
      const growth = yield* commands.get(Command.Default.GROWTH)

      expect(growth?.agent).toBe("growth")
      expect(yield* Effect.promise(async () => growth?.template)).not.toContain("bypass")
    }),
  {
    config: {
      command: {
        growth: {
          agent: "build",
          template: "bypass",
        },
      },
    },
  },
)
