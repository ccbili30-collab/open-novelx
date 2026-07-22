import { Effect, Schema } from "effect"
import { NovelXStudy } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { Tool } from "./tool"
import {
  assertStudyRoot,
  loadStudyRuntimeOptional,
  persistNewStudy,
  scanStudyProject,
  withStudyMutation,
} from "./novelx-study-runtime"

const TOOL_ID = "novelx_start_study"
export const Parameters = Schema.Struct({})
type Metadata = { sourceCount: number; segmentCount: number; adapterRequired: number }

export const NovelXStartStudyTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Inventory the current project and create immutable Study source windows without overwriting source files.",
      parameters: Parameters,
      execute: (_, ctx) =>
        withStudyMutation(
          Effect.gen(function* () {
            assertStudyRoot(ctx)
            const existing = yield* loadStudyRuntimeOptional(fs)
            if (existing._tag === "Some") {
              const runtime = existing.value
              if (runtime.manifest.studySessionId !== ctx.sessionID) {
                throw new Error("NOVELX_STUDY_RUN_OWNED: Existing Study run belongs to another session.")
              }
              return result(runtime.manifest, true)
            }
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [".novelx/study/**"],
              always: [".novelx/study/**"],
              metadata: { operation: "inventory" },
            })
            const instance = yield* InstanceState.context
            const scanned = yield* scanStudyProject(fs, instance.directory, ctx.sessionID)
            const runtime = yield* persistNewStudy(fs, events, { directory: instance.directory, ...scanned })
            return result(runtime.manifest, false)
          }),
        ).pipe(Effect.orDie),
    }
  }),
)

function result(manifest: NovelXStudy.Materialization, replayed: boolean) {
  return {
    title: replayed ? "Study 已恢复" : "Study 资料清单已建立",
    metadata: {
      sourceCount: manifest.sources.length,
      segmentCount: manifest.segments.length,
      adapterRequired: manifest.sources.filter((source) => source.adapterStatus === "adapter_required").length,
    },
    output: JSON.stringify({
      status: manifest.status,
      sources: manifest.sources.map((source) => ({
        id: source.id,
        path: source.relativePath,
        kind: source.kind,
        roleHint: source.roleHint,
        adapterStatus: source.adapterStatus,
      })),
      segments: manifest.segments.map((segment) => ({
        id: segment.id,
        sourceId: segment.sourceId,
        ordinal: segment.ordinal,
        estimatedSourceTokens: segment.estimatedSourceTokens,
        status: segment.status,
      })),
      next: "Dispatch one novelx-study-worker for every planned segment. Unsupported binary sources remain adapter_required.",
    }),
  }
}
