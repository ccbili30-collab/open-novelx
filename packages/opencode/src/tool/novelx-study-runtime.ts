import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Option, Schema, Semaphore } from "effect"
import { NovelXStudy } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2 } from "@opencode-ai/core/event"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import {
  classifyStudySourcePath,
  createStudyMaterialization,
  segmentStudySource,
  studySha256,
  verifyStudyMaterialization,
} from "@/novelx/study-materialization"
import { publishWorldFile } from "./novelx-world-runtime"
import type { Tool } from "./tool"

const ignoredSegments = new Set([
  ".git",
  ".novax",
  ".novelx",
  "node_modules",
  "dist",
  "out",
  "build",
  "coverage",
  ".next",
])
const mutationLock = Semaphore.makeUnsafe(1)

export type StudyRuntime = {
  directory: string
  manifestPath: string
  manifest: NovelXStudy.Materialization
  manifestExisted: boolean
}

export function withStudyMutation<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return mutationLock.withPermits(1)(effect)
}

export function scanStudyProject(fs: FSUtil.Interface, directory: string, studySessionId: string) {
  return Effect.gen(function* () {
    const absoluteFiles = (yield* fs.glob("**/*", { cwd: directory, absolute: true, include: "file", dot: true }))
      .map((value) => path.resolve(value))
      .filter((value) => isStudySourcePath(directory, value))
      .toSorted((a, b) => a.localeCompare(b))
    const sourceRows = yield* Effect.all(
      absoluteFiles.map((absolute) =>
        Effect.gen(function* () {
          const relativePath = normalizeRelative(path.relative(directory, absolute))
          const classification = classifyStudySourcePath(relativePath)
          const sourceId = `nx-study-source-${studySha256(relativePath.normalize("NFKC").toLocaleLowerCase()).slice(0, 24)}`
          if (classification.kind !== "text") {
            return {
              source: {
                id: sourceId,
                relativePath,
                ...classification,
                byteSize: 0,
                contentSha256: null,
                adapterStatus: "adapter_required" as const,
              },
              segments: [] as NovelXStudy.SegmentRecord[],
              payloads: [] as Array<{ segmentId: string; content: string }>,
            }
          }
          const content = yield* fs.readFileStringSafe(absolute)
          if (content === undefined) {
            return {
              source: {
                id: sourceId,
                relativePath,
                ...classification,
                byteSize: 0,
                contentSha256: null,
                adapterStatus: "failed" as const,
              },
              segments: [] as NovelXStudy.SegmentRecord[],
              payloads: [] as Array<{ segmentId: string; content: string }>,
            }
          }
          const segments = content.length ? segmentStudySource({ sourceId, text: content, now: Date.now() }) : []
          return {
            source: {
              id: sourceId,
              relativePath,
              ...classification,
              byteSize: Buffer.byteLength(content, "utf8"),
              contentSha256: studySha256(content),
              adapterStatus: "ready" as const,
            },
            segments,
            payloads: segments.map((segment) => ({
              segmentId: segment.id,
              content: content.slice(segment.startOffset, segment.endOffset),
            })),
          }
        }),
      ),
      { concurrency: 8 },
    )
    const sources = sourceRows.map((row) => row.source)
    const segments = sourceRows.flatMap((row) => row.segments)
    const payloads = sourceRows.flatMap((row) => row.payloads)
    const manifest = createStudyMaterialization({ studySessionId, sources, segments, now: Date.now() })
    return { manifest, payloads }
  })
}

export function loadStudyRuntime(fs: FSUtil.Interface) {
  return Effect.gen(function* () {
    const existing = yield* loadStudyRuntimeOptional(fs)
    if (Option.isNone(existing)) {
      return yield* Effect.fail(new Error("NOVELX_STUDY_MATERIALIZATION_REQUIRED: Start Study first."))
    }
    return existing.value
  })
}

export function loadStudyRuntimeOptional(fs: FSUtil.Interface) {
  return Effect.gen(function* () {
    const instance = yield* InstanceState.context
    const manifestPath = absoluteStudyPath(instance.directory, NovelXStudy.MATERIALIZATION_PATH)
    const text = yield* fs.readFileStringSafe(manifestPath)
    if (text === undefined) return Option.none<StudyRuntime>()
    const manifest = yield* Effect.try({
      try: () => verifyStudyMaterialization(Schema.decodeUnknownSync(NovelXStudy.Materialization)(JSON.parse(text))),
      catch: (cause) =>
        cause instanceof Error
          ? cause
          : new Error("NOVELX_STUDY_MATERIALIZATION_INVALID: Study ledger could not be decoded."),
    })
    return Option.some({ directory: instance.directory, manifestPath, manifest, manifestExisted: true })
  })
}

export function persistNewStudy(
  fs: FSUtil.Interface,
  events: EventV2.Interface,
  input: { directory: string; manifest: NovelXStudy.Materialization; payloads: Array<{ segmentId: string; content: string }> },
) {
  return Effect.gen(function* () {
    const manifestPath = absoluteStudyPath(input.directory, NovelXStudy.MATERIALIZATION_PATH)
    if (yield* fs.existsSafe(manifestPath)) {
      throw new Error("NOVELX_STUDY_RUN_EXISTS: This project already has a Study run. Resume it instead of overwriting it.")
    }
    for (const payload of input.payloads) {
      const target = studySegmentPath(input.directory, payload.segmentId)
      yield* writeAtomic(fs, target, payload.content)
      yield* publishWorldFile(events, target, "add")
    }
    yield* writeAtomic(fs, manifestPath, JSON.stringify(input.manifest, null, 2) + "\n")
    yield* publishWorldFile(events, manifestPath, "add")
    return { directory: input.directory, manifestPath, manifest: input.manifest, manifestExisted: false }
  })
}

export function persistStudyMaterialization(
  fs: FSUtil.Interface,
  events: EventV2.Interface,
  runtime: StudyRuntime,
  manifest: NovelXStudy.Materialization,
) {
  return Effect.gen(function* () {
    yield* writeAtomic(fs, runtime.manifestPath, JSON.stringify(manifest, null, 2) + "\n")
    yield* publishWorldFile(events, runtime.manifestPath, "change")
  })
}

export function loadStudySegmentPayload(fs: FSUtil.Interface, runtime: StudyRuntime, segmentId: string) {
  return Effect.gen(function* () {
    const segment = runtime.manifest.segments.find((item) => item.id === segmentId)
    if (!segment) throw new Error("NOVELX_STUDY_SEGMENT_UNKNOWN: Segment is not registered.")
    const text = yield* fs.readFileStringSafe(studySegmentPath(runtime.directory, segment.id))
    if (text === undefined || studySha256(text) !== segment.contentSha256) {
      throw new Error("NOVELX_STUDY_SEGMENT_PAYLOAD_DRIFT: Segment payload is missing or changed.")
    }
    return { segment, text }
  })
}

export function assertStudyRoot(ctx: Tool.Context) {
  if (ctx.agent !== "study") throw new Error("NOVELX_STUDY_ROOT_REQUIRED: This tool requires the Study coordinator.")
}

export function assertStudyWorker(ctx: Tool.Context) {
  if (ctx.agent !== "novelx-study-worker") throw new Error("NOVELX_STUDY_WORKER_REQUIRED: This tool requires a Study segment worker.")
}

export function assertStudyIntegrator(ctx: Tool.Context) {
  if (ctx.agent !== "novelx-study-integrator") throw new Error("NOVELX_STUDY_INTEGRATOR_REQUIRED: This tool requires the Study integrator.")
}

export function absoluteStudyPath(directory: string, relative: string) {
  return path.join(directory, ...relative.split("/"))
}

export function studySegmentPath(directory: string, segmentId: string) {
  return absoluteStudyPath(directory, `${NovelXStudy.SEGMENT_DIRECTORY}/${segmentId}.txt`)
}

export function writeStudyPublicDocument(fs: FSUtil.Interface, events: EventV2.Interface, target: string, content: string) {
  return Effect.gen(function* () {
    const existed = yield* fs.existsSafe(target)
    yield* writeAtomic(fs, target, content)
    yield* publishWorldFile(events, target, existed ? "change" : "add")
  })
}

function isStudySourcePath(directory: string, absolute: string) {
  const relative = path.relative(directory, absolute)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false
  return !normalizeRelative(relative)
    .split("/")
    .some((segment) => ignoredSegments.has(segment.toLocaleLowerCase()))
}

function normalizeRelative(value: string) {
  return value.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "")
}

function writeAtomic(fs: FSUtil.Interface, target: string, content: string) {
  return Effect.gen(function* () {
    yield* fs.ensureDir(path.dirname(target))
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
    yield* fs.writeFileString(temporary, content, { flag: "wx" }).pipe(
      Effect.andThen(fs.rename(temporary, target)),
      Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
    )
  })
}

export { EventV2Bridge }
