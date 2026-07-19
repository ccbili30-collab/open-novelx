import path from "node:path"
import { Effect, Schema } from "effect"
import { NovelXWorld } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { commitWorldDocument } from "@/novelx/world-materialization"
import { Tool } from "@/tool/tool"
import {
  absoluteWorldPath,
  assertWorldStageEditor,
  loadWorldRuntime,
  persistWorldMaterialization,
  publishWorldFile,
  withWorldMutation,
} from "./novelx-world-runtime"

const TOOL_ID = "novelx_commit_world_document"
export const Parameters = Schema.Struct({ entityId: Schema.String, taskSessionId: Schema.String })
type Metadata = {
  entityId: string
  taskSessionId: string
  targetPath: string
  sha256: string | null
  replayed: boolean
}

export const NovelXCommitWorldDocumentTool = Tool.define<
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
      description: "Review and atomically publish the final Markdown from an owned novelx-world-writer child session.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          assertWorldStageEditor(ctx)
          const taskSessionID = SessionID.make(params.taskSessionId)
          const child = yield* sessions.get(taskSessionID)
          if (child.parentID !== ctx.sessionID || child.agent !== "novelx-world-writer") {
            throw new Error(
              "NOVELX_WORLD_CHILD_SESSION_INVALID: The task is not an owned novelx-world-writer child session.",
            )
          }
          const messages = yield* sessions.messages({ sessionID: taskSessionID })
          const assistant = messages.findLast((message) => message.info.role === "assistant")
          const draft = assistant?.parts
            .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
            .map((part) => part.text)
            .join("\n")
            .trim()
          if (!draft) throw new Error("NOVELX_WORLD_CHILD_OUTPUT_MISSING: The child returned no world dossier.")
          return yield* withWorldMutation(
            Effect.gen(function* () {
              const runtime = yield* loadWorldRuntime(fs)
              const committed = commitWorldDocument({
                manifest: runtime.materialization,
                blueprint: runtime.blueprint,
                entityId: params.entityId,
                ownerSessionId: ctx.sessionID,
                taskSessionId: params.taskSessionId,
                draft,
                now: Date.now(),
              })
              yield* ctx.ask({
                permission: TOOL_ID,
                patterns: [committed.record.draftPath, committed.record.targetPath, NovelXWorld.MATERIALIZATION_PATH],
                always: [NovelXWorld.MATERIALIZATION_PATH],
                metadata: {
                  entityId: params.entityId,
                  targetPath: committed.record.targetPath,
                  taskSessionId: params.taskSessionId,
                },
              })
              const draftTarget = absoluteWorldPath(runtime.directory, committed.record.draftPath)
              const officialTarget = absoluteWorldPath(runtime.directory, committed.record.targetPath)
              const officialExisted = yield* fs.existsSafe(officialTarget)
              yield* fs.ensureDir(path.dirname(draftTarget))
              yield* fs.writeFileString(draftTarget, committed.draft)
              yield* fs.ensureDir(path.dirname(officialTarget))
              yield* fs.writeFileString(officialTarget, committed.draft)
              yield* persistWorldMaterialization(fs, events, runtime, committed.manifest)
              yield* publishWorldFile(events, draftTarget, "change")
              yield* publishWorldFile(events, officialTarget, officialExisted ? "change" : "add")
              return {
                title: committed.replayed ? "世界档案已存在" : "世界档案已提交",
                metadata: {
                  entityId: params.entityId,
                  taskSessionId: params.taskSessionId,
                  targetPath: committed.record.targetPath,
                  sha256: committed.record.committedSha256,
                  replayed: committed.replayed,
                },
                output: `${committed.record.targetPath} 已由主编审核并提交，后续世界层可以引用。`,
              }
            }),
          )
        }).pipe(Effect.orDie),
    }
  }),
)
