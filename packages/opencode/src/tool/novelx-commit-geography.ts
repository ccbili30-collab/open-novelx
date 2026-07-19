import path from "node:path"
import { Effect, Schema } from "effect"
import { NovelXGrowth } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Session } from "@/session/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionID } from "@/session/schema"
import { commitGeographyDocument } from "@/novelx/geography-materialization"
import { Tool } from "@/tool/tool"
import {
  absolute,
  assertGrowthEditor,
  loadGeographyRuntime,
  persistGeographyMaterialization,
  publishGeographyFile,
  withGeographyMutation,
} from "./novelx-geography-runtime"

const TOOL_ID = "novelx_commit_geography"
export const Parameters = Schema.Struct({
  terrainId: Schema.String,
  taskSessionId: Schema.String.annotate({ description: "The native task session ID returned by novelx-geography." }),
})

type Metadata = {
  terrainId: string
  taskSessionId: string
  targetPath: string
  sha256: string | null
  replayed: boolean
}

export const NovelXCommitGeographyTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service | Session.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const sessions = yield* Session.Service
    return {
      description:
        "Review and atomically publish the final Markdown returned by the bound novelx-geography child session.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          assertGrowthEditor(ctx)
          const taskSessionID = SessionID.make(params.taskSessionId)
          const child = yield* sessions.get(taskSessionID)
          if (child.parentID !== ctx.sessionID || child.agent !== "novelx-geography") {
            throw new Error(
              "NOVELX_GEOGRAPHY_CHILD_SESSION_INVALID: The task is not an owned novelx-geography child session.",
            )
          }
          const messages = yield* sessions.messages({ sessionID: taskSessionID })
          const assistant = messages.findLast((message) => message.info.role === "assistant")
          const draft = assistant?.parts
            .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
            .map((part) => part.text)
            .join("\n")
            .trim()
          if (!draft)
            throw new Error("NOVELX_GEOGRAPHY_CHILD_OUTPUT_MISSING: The child session returned no geography document.")
          return yield* withGeographyMutation(
            Effect.gen(function* () {
              const runtime = yield* loadGeographyRuntime(fs)
              const committed = commitGeographyDocument({
                manifest: runtime.materialization,
                skeleton: runtime.skeleton,
                terrainId: params.terrainId,
                ownerSessionId: ctx.sessionID,
                taskSessionId: params.taskSessionId,
                draft,
                now: Date.now(),
              })
              yield* ctx.ask({
                permission: TOOL_ID,
                patterns: [committed.record.draftPath, committed.record.targetPath, NovelXGrowth.MATERIALIZATION_PATH],
                always: [NovelXGrowth.MATERIALIZATION_PATH],
                metadata: {
                  terrainId: params.terrainId,
                  targetPath: committed.record.targetPath,
                  taskSessionId: params.taskSessionId,
                },
              })
              const draftTarget = absolute(runtime.directory, committed.record.draftPath)
              const officialTarget = absolute(runtime.directory, committed.record.targetPath)
              const officialExisted = yield* fs.existsSafe(officialTarget)
              yield* fs.ensureDir(path.dirname(draftTarget))
              yield* fs.writeFileString(draftTarget, committed.draft)
              yield* fs.ensureDir(path.dirname(officialTarget))
              yield* fs.writeFileString(officialTarget, committed.draft)
              yield* persistGeographyMaterialization(fs, events, runtime, committed.manifest)
              yield* publishGeographyFile(events, draftTarget, "change")
              yield* publishGeographyFile(events, officialTarget, officialExisted ? "change" : "add")
              return {
                title: committed.replayed ? "地理档案已存在" : "地理档案已提交",
                metadata: {
                  terrainId: params.terrainId,
                  taskSessionId: params.taskSessionId,
                  targetPath: committed.record.targetPath,
                  sha256: committed.record.committedSha256,
                  replayed: committed.replayed,
                },
                output: `${committed.record.targetPath} 已由主编审核并提交。该文件现在可供后续阶段引用。`,
              }
            }),
          )
        }).pipe(Effect.orDie),
    }
  }),
)
