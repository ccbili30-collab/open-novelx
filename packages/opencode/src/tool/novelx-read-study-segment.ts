import { Effect, Schema } from "effect"
import { NovelXStudy } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { recordStudySegmentRead, sliceStudyReadWindow } from "@/novelx/study-materialization"
import { Tool } from "./tool"
import {
  assertStudyWorker,
  loadStudyRuntime,
  loadStudySegmentPayload,
  persistStudyMaterialization,
  withStudyMutation,
} from "./novelx-study-runtime"

const TOOL_ID = "novelx_read_study_segment"
export const Parameters = Schema.Struct({ segmentId: Schema.String })
type Metadata = { segmentId: string; done: boolean; estimatedSourceTokens: number }

export const NovelXReadStudySegmentTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Read the next contiguous page from this worker's Study source window.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withStudyMutation(
          Effect.gen(function* () {
            assertStudyWorker(ctx)
            const runtime = yield* loadStudyRuntime(fs)
            const payload = yield* loadStudySegmentPayload(fs, runtime, params.segmentId)
            if (payload.segment.workerSessionId !== ctx.sessionID || payload.segment.status !== "reading") {
              throw new Error("NOVELX_STUDY_SEGMENT_WORKER_REQUIRED: Prepare this segment before reading it.")
            }
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [NovelXStudy.MATERIALIZATION_PATH],
              always: [NovelXStudy.MATERIALIZATION_PATH],
              metadata: { segmentId: params.segmentId },
            })
            const localStart = payload.segment.readOffset - payload.segment.startOffset
            const page = sliceStudyReadWindow({ text: payload.text, startOffset: localStart })
            const absoluteEnd = payload.segment.startOffset + page.endOffset
            const manifest = recordStudySegmentRead({
              manifest: runtime.manifest,
              segmentId: payload.segment.id,
              workerSessionId: ctx.sessionID,
              fromOffset: payload.segment.readOffset,
              toOffset: absoluteEnd,
              now: Date.now(),
            })
            yield* persistStudyMaterialization(fs, events, runtime, manifest)
            return {
              title: "Study 原文分片",
              metadata: { segmentId: payload.segment.id, done: page.done, estimatedSourceTokens: page.estimatedSourceTokens },
              output: JSON.stringify({
                segmentId: payload.segment.id,
                sourceId: payload.segment.sourceId,
                startOffset: payload.segment.readOffset,
                endOffset: absoluteEnd,
                done: page.done,
                content: page.content,
              }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
