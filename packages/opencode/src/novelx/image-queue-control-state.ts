import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"

export const IMAGE_QUEUE_CONTROL_PATH = ".novelx/visuals/queue-control.json"

type ControlFile = {
  version: 1
  paused: boolean
  updatedAt: number
}

const absolute = (directory: string) => path.join(directory, ...IMAGE_QUEUE_CONTROL_PATH.split("/"))

export function readGrowthImageQueueControl(fs: FSUtil.Interface, directory: string) {
  return Effect.gen(function* () {
    const text = yield* fs.readFileStringSafe(absolute(directory))
    if (!text) return { version: 1, paused: false, updatedAt: 0 } satisfies ControlFile
    return yield* Effect.try({
      try: () => {
        const value = JSON.parse(text) as Partial<ControlFile>
        if (value.version !== 1 || typeof value.paused !== "boolean" || !Number.isFinite(value.updatedAt)) {
          throw new Error("NOVELX_IMAGE_QUEUE_CONTROL_INVALID")
        }
        return value as ControlFile
      },
      catch: () => new Error("NOVELX_IMAGE_QUEUE_CONTROL_INVALID"),
    })
  })
}

export function setGrowthImageQueuePaused(fs: FSUtil.Interface, directory: string, paused: boolean) {
  return Effect.gen(function* () {
    const target = absolute(directory)
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
    const value: ControlFile = { version: 1, paused, updatedAt: Date.now() }
    yield* fs.ensureDir(path.dirname(target))
    yield* fs.writeFileString(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" }).pipe(
      Effect.andThen(fs.rename(temporary, target)),
      Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
    )
    return value
  })
}

export function growthImageQueuePaused(fs: FSUtil.Interface, directory: string) {
  return readGrowthImageQueueControl(fs, directory).pipe(Effect.map((control) => control.paused))
}
