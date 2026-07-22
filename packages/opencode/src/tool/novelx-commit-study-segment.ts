import { Effect, Schema } from "effect"
import { NovelXStudy } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { commitStudySegmentExtraction } from "@/novelx/study-materialization"
import { Tool } from "./tool"
import {
  assertStudyWorker,
  loadStudyRuntime,
  persistStudyMaterialization,
  withStudyMutation,
} from "./novelx-study-runtime"

const TOOL_ID = "novelx_commit_study_segment"
export const Parameters = Schema.Struct({ segmentId: Schema.String, extraction: NovelXStudy.SegmentExtraction })
type Metadata = { segmentId: string; entityCount: number }

export const NovelXCommitStudySegmentTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Seal one complete, source-bound Study extraction after this worker read the entire source window.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withStudyMutation(
          Effect.gen(function* () {
            assertStudyWorker(ctx)
            const runtime = yield* loadStudyRuntime(fs)
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [NovelXStudy.MATERIALIZATION_PATH],
              always: [NovelXStudy.MATERIALIZATION_PATH],
              metadata: { segmentId: params.segmentId },
            })
            const manifest = commitStudySegmentExtraction({
              manifest: runtime.manifest,
              segmentId: params.segmentId,
              workerSessionId: ctx.sessionID,
              extraction: params.extraction,
              now: Date.now(),
            })
            yield* persistStudyMaterialization(fs, events, runtime, manifest)
            return {
              title: "Study 分片提取已封存",
              metadata: { segmentId: params.segmentId, entityCount: params.extraction.entities.length },
              output: JSON.stringify({ segmentId: params.segmentId, status: "extracted" }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
