import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import { NovelXWorldPublication, NovelXWorldVisual } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import { createWorldPublication, verifyWorldPublication } from "@/novelx/world-publication"
import { verifyWorldVisuals, worldVisualRegistrationSha256 } from "@/novelx/world-visual"
import { absoluteWorldPath, loadWorldRuntime, publishWorldFile } from "./novelx-world-runtime"

export function loadWorldPublicationRuntime(fs: FSUtil.Interface, options: { create?: boolean } = {}) {
  return Effect.gen(function* () {
    const world = yield* loadWorldRuntime(fs)
    const visualPath = absoluteWorldPath(world.directory, NovelXWorldVisual.MANIFEST_PATH)
    const visualText = yield* fs.readFileStringSafe(visualPath)
    if (!visualText) throw new Error("NOVELX_PUBLICATION_VISUAL_REQUIRED: Register current world visuals first.")
    const visual = verifyWorldVisuals({
      manifest: Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(JSON.parse(visualText)),
      materialization: world.materialization,
    })
    const manifestPath = absoluteWorldPath(world.directory, NovelXWorldPublication.MANIFEST_PATH)
    const manifestText = yield* fs.readFileStringSafe(manifestPath)
    const manifest = manifestText
      ? verifyWorldPublication(Schema.decodeUnknownSync(NovelXWorldPublication.Manifest)(JSON.parse(manifestText)), {
          materializationSha256: world.materialization.integritySha256,
          visualSha256: worldVisualRegistrationSha256(visual),
        })
      : options.create
        ? createWorldPublication({ materialization: world.materialization, visual, now: Date.now() })
        : undefined
    if (!manifest) throw new Error("NOVELX_PUBLICATION_MANIFEST_REQUIRED: Prepare world publication first.")
    return { world, visual, manifest, manifestPath, manifestExisted: manifestText !== undefined }
  })
}

export function persistWorldPublication(
  fs: FSUtil.Interface,
  events: EventV2.Interface,
  target: string,
  manifest: NovelXWorldPublication.Manifest,
) {
  return Effect.gen(function* () {
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
    yield* fs.ensureDir(path.dirname(target))
    yield* fs.writeFileString(temporary, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }).pipe(
      Effect.andThen(fs.rename(temporary, target)),
      Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
    )
    yield* publishWorldFile(events, target, "change")
  })
}
