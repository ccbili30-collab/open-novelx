import { Effect, Schema } from "effect"
import { NovelXStudy } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { registerStudyDocuments } from "@/novelx/study-materialization"
import { Tool } from "./tool"
import {
  assertStudyIntegrator,
  loadStudyRuntime,
  persistStudyMaterialization,
  withStudyMutation,
} from "./novelx-study-runtime"

const TOOL_ID = "novelx_register_study_documents"
export const Parameters = Schema.Struct({ proposals: Schema.Array(NovelXStudy.DocumentProposal).check(Schema.isMinLength(1), Schema.isMaxLength(512)) })
type Metadata = { documentCount: number; visualCount: number }

export const NovelXRegisterStudyDocumentsTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Register deduplicated Study entities as canonical public dossiers with Harness-owned target paths.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withStudyMutation(
          Effect.gen(function* () {
            assertStudyIntegrator(ctx)
            const runtime = yield* loadStudyRuntime(fs)
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [NovelXStudy.MATERIALIZATION_PATH],
              always: [NovelXStudy.MATERIALIZATION_PATH],
              metadata: { proposals: params.proposals.length },
            })
            const result = registerStudyDocuments({
              manifest: runtime.manifest,
              integratorSessionId: ctx.sessionID,
              proposals: params.proposals,
              now: Date.now(),
            })
            yield* persistStudyMaterialization(fs, events, runtime, result.manifest)
            return {
              title: "Study 正式档案已注册",
              metadata: { documentCount: result.documents.length, visualCount: result.manifest.visuals.length },
              output: JSON.stringify({
                documents: result.documents.map((document) => ({
                  id: document.id,
                  entityKey: document.entityKey,
                  title: document.title,
                  targetPath: document.targetPath,
                  sections: document.sections,
                })),
                visuals: result.manifest.visuals,
                next: "Research registered gaps, then commit every canonical dossier. Visuals remain pending and do not block text.",
              }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
