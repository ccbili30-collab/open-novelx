import { Effect, Schema } from "effect"
import { NovelXStudy } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { commitStudyDocument } from "@/novelx/study-materialization"
import { Tool } from "./tool"
import {
  absoluteStudyPath,
  assertStudyIntegrator,
  loadStudyRuntime,
  persistStudyMaterialization,
  withStudyMutation,
  writeStudyPublicDocument,
} from "./novelx-study-runtime"

const TOOL_ID = "novelx_commit_study_document"
export const Parameters = Schema.Struct({
  documentId: Schema.String,
  content: Schema.String.check(Schema.isMinLength(80), Schema.isMaxLength(200_000)),
  resolvedGaps: Schema.Array(NovelXStudy.GapResolution).check(Schema.isMaxLength(128)),
})
type Metadata = { documentId: string; targetPath: string }

export const NovelXCommitStudyDocumentTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Atomically publish one evidence-bound Study dossier and seal its gap origins.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withStudyMutation(
          Effect.gen(function* () {
            assertStudyIntegrator(ctx)
            const runtime = yield* loadStudyRuntime(fs)
            const document = runtime.manifest.documents.find((item) => item.id === params.documentId)
            if (!document) throw new Error("NOVELX_STUDY_DOCUMENT_UNKNOWN: Document is not registered.")
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [NovelXStudy.MATERIALIZATION_PATH, document.targetPath],
              always: [NovelXStudy.MATERIALIZATION_PATH, document.targetPath],
              metadata: { documentId: params.documentId, targetPath: document.targetPath },
            })
            const manifest = commitStudyDocument({
              manifest: runtime.manifest,
              documentId: params.documentId,
              integratorSessionId: ctx.sessionID,
              content: params.content,
              resolvedGaps: params.resolvedGaps,
              now: Date.now(),
            })
            yield* writeStudyPublicDocument(
              fs,
              events,
              absoluteStudyPath(runtime.directory, document.targetPath),
              params.content,
            )
            yield* persistStudyMaterialization(fs, events, runtime, manifest)
            return {
              title: document.title,
              metadata: { documentId: document.id, targetPath: document.targetPath },
              output: JSON.stringify({ documentId: document.id, targetPath: document.targetPath, status: "committed" }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
