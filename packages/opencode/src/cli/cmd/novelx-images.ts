import { Cause, Effect, Schema } from "effect"
import { NovelXWorldVisual } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { runWorldImageQueue } from "@/novelx/world-image-queue"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import path from "node:path"

export const NovelXImagesCommand = effectCmd({
  command: "novelx-images",
  describe: "resume the NovelX world map and scenery image queue",
  handler: Effect.fn("Cli.novelxImages")(function* () {
    return yield* Effect.gen(function* () {
      const instance = yield* InstanceState.context
      yield* runWorldImageQueue({ directory: instance.directory })
      const fs = yield* FSUtil.Service
      const content = yield* fs.readFileStringSafe(
        path.join(instance.directory, ...NovelXWorldVisual.MANIFEST_PATH.split("/")),
      )
      if (!content) throw new Error("NovelX 世界视觉清单不存在。")
      const manifest = Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(JSON.parse(content))
      const attached = manifest.tasks.filter((task) => task.status === "attached").length
      UI.println(`NovelX 图片队列已处理：${attached}/${manifest.tasks.length} 张图片已挂载，状态 ${manifest.status}。`)
    }).pipe(Effect.catchCause((cause) => fail(`NovelX 图片队列失败：${Cause.pretty(cause)}`)))
  }),
})
