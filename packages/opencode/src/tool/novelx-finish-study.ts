import { Effect, Schema } from "effect"
import { NovelXStudy } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { finishStudyText } from "@/novelx/study-materialization"
import { Tool } from "./tool"
import {
  assertStudyRoot,
  loadStudyRuntime,
  persistStudyMaterialization,
  withStudyMutation,
} from "./novelx-study-runtime"

const TOOL_ID = "novelx_finish_study"
export const Parameters = Schema.Struct({})
type Metadata = { documentCount: number; pendingVisuals: number }

export const NovelXFinishStudyTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | EventV2Bridge.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Complete the Study text route after every source window and canonical dossier is sealed; visuals may remain pending.",
      parameters: Parameters,
      execute: (_, ctx) =>
        withStudyMutation(
          Effect.gen(function* () {
            assertStudyRoot(ctx)
            const runtime = yield* loadStudyRuntime(fs)
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [NovelXStudy.MATERIALIZATION_PATH],
              always: [NovelXStudy.MATERIALIZATION_PATH],
              metadata: { operation: "finish_text" },
            })
            const manifest = finishStudyText({ manifest: runtime.manifest, studySessionId: ctx.sessionID, now: Date.now() })
            yield* persistStudyMaterialization(fs, events, runtime, manifest)
            return {
              title: "Study 文字整理完成",
              metadata: {
                documentCount: manifest.documents.length,
                pendingVisuals: manifest.visuals.filter((visual) => visual.status === "pending").length,
              },
              output: JSON.stringify({
                status: manifest.status,
                documents: manifest.documents.map((document) => document.targetPath),
                visualStatus: manifest.visuals.map((visual) => ({ id: visual.id, status: visual.status })),
              }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
