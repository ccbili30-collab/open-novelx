import { Effect, Schema } from "effect"
import { NovelXStudy } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { prepareStudySegment } from "@/novelx/study-materialization"
import { Tool } from "./tool"
import {
  assertStudyWorker,
  loadStudyRuntime,
  persistStudyMaterialization,
  withStudyMutation,
} from "./novelx-study-runtime"

const TOOL_ID = "novelx_prepare_study_segment"
export const Parameters = Schema.Struct({ segmentId: Schema.String })
type Metadata = { segmentId: string; estimatedSourceTokens: number }

export const NovelXPrepareStudySegmentTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Bind one Study source window to this worker and return its bounded read contract.",
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
            const prepared = prepareStudySegment({
              manifest: runtime.manifest,
              segmentId: params.segmentId,
              workerSessionId: ctx.sessionID,
              now: Date.now(),
            })
            yield* persistStudyMaterialization(fs, events, runtime, prepared.manifest)
            return {
              title: "Study 分片已准备",
              metadata: { segmentId: prepared.segment.id, estimatedSourceTokens: prepared.segment.estimatedSourceTokens },
              output: JSON.stringify({
                segmentId: prepared.segment.id,
                sourceId: prepared.segment.sourceId,
                readOffset: prepared.segment.readOffset,
                endOffset: prepared.segment.endOffset,
                next: "Call novelx_read_study_segment repeatedly until done=true, then commit one structured extraction.",
              }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
