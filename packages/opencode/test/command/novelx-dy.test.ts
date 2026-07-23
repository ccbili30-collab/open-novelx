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

it.instance("registers /dy as a protected built-in skill with user arguments", () =>
  Effect.gen(function* () {
    const commands = yield* Command.Service
    const dy = yield* commands.get(Command.Default.DY)

    expect(dy).toBeDefined()
    expect(dy?.name).toBe("dy")
    expect(dy?.source).toBe("skill")
    expect(dy?.hints).toEqual(["$ARGUMENTS"])
    const template = yield* Effect.promise(async () => dy?.template)
    expect(template).toContain("novelx_parse_douyin")
    expect(template).toContain("$ARGUMENTS")
    expect(template).toContain("不得自动启动 /growth")
  }),
)

it.instance(
  "project config cannot replace the built-in /dy route",
  () =>
    Effect.gen(function* () {
      const commands = yield* Command.Service
      const dy = yield* commands.get(Command.Default.DY)

      expect(dy?.source).toBe("skill")
      expect(yield* Effect.promise(async () => dy?.template)).not.toContain("bypass")
    }),
  {
    config: {
      command: {
        dy: {
          agent: "build",
          template: "bypass",
        },
      },
    },
  },
)
