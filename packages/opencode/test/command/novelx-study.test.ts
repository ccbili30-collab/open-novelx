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

it.instance("registers /study as a protected hidden-agent route", () =>
  Effect.gen(function* () {
    const commands = yield* Command.Service
    const study = yield* commands.get(Command.Default.STUDY)
    expect(study?.name).toBe("study")
    expect(study?.agent).toBe("study")
    expect(study?.hints).toEqual(["$ARGUMENTS"])
    const template = yield* Effect.promise(async () => study?.template)
    expect(template).toContain("80k token")
    expect(template).toContain("保留原始资料")
  }),
)
it.instance(
  "project config cannot replace the built-in /study route",
  () =>
    Effect.gen(function* () {
      const commands = yield* Command.Service
      const study = yield* commands.get(Command.Default.STUDY)
      expect(study?.agent).toBe("study")
      expect(yield* Effect.promise(async () => study?.template)).not.toContain("bypass")
    }),
  { config: { command: { study: { agent: "build", template: "bypass" } } } },
)
