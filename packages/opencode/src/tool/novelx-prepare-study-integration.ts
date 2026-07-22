import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { studyIntegrationPage } from "@/novelx/study-materialization"
import { Tool } from "./tool"
import { assertStudyIntegrator, loadStudyRuntime } from "./novelx-study-runtime"

const TOOL_ID = "novelx_prepare_study_integration"
export const Parameters = Schema.Struct({
  offset: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(8))),
})
type Metadata = { segmentCount: number; offset: number; nextOffset: number | null; done: boolean }

export const NovelXPrepareStudyIntegrationTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description: "Return all sealed Study extraction indexes for alias merging and canonical document planning.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          assertStudyIntegrator(ctx)
          const runtime = yield* loadStudyRuntime(fs)
          const page = studyIntegrationPage({ manifest: runtime.manifest, offset: params.offset, limit: params.limit })
          return {
            title: "Study 整合上下文已准备",
            metadata: {
              segmentCount: runtime.manifest.segments.length,
              offset: page.offset,
              nextOffset: page.nextOffset,
              done: page.done,
            },
            output: JSON.stringify({
              sources: runtime.manifest.sources,
              extractions: page.segments.map((segment) => ({
                segmentId: segment.id,
                sourceId: segment.sourceId,
                extraction: segment.extraction,
              })),
              page: { offset: page.offset, nextOffset: page.nextOffset, done: page.done },
              rules: {
                sourcePriority: ["local", "web", "inferred", "generated"],
                preserveOriginals: true,
                noReviewStage: true,
              },
            }),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
