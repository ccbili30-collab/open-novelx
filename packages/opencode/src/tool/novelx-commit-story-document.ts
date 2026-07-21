import path from "node:path"
import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { commitStoryDocument } from "@/novelx/story-materialization"
import { Tool } from "@/tool/tool"
import {
  absoluteStoryPath,
  assertStoryEditor,
  loadStoryRuntime,
  persistStoryMaterialization,
  withStoryMutation,
} from "./novelx-story-runtime"
import { publishWorldFile } from "./novelx-world-runtime"

const TOOL_ID = "novelx_commit_story_document"
export const Parameters = Schema.Struct({
  documentId: Schema.String,
  leaseId: Schema.String,
  taskSessionId: Schema.String,
})
type Metadata = { documentId: string; targetPath: string; replayed: boolean }

export const NovelXCommitStoryDocumentTool = Tool.define<
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
        "Validate one owned story-writer result, atomically publish it and unlock the next causal Story document.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          assertStoryEditor(ctx)
          const child = yield* sessions.get(SessionID.make(params.taskSessionId))
          if (child.parentID !== ctx.sessionID || child.agent !== "novelx-story-writer") {
            throw new Error("NOVELX_STORY_CHILD_SESSION_INVALID: Expected an owned novelx-story-writer child.")
          }
          const messages = yield* sessions.messages({ sessionID: child.id })
          const assistant = messages.findLast((message) => message.info.role === "assistant")
          const markdown = assistant?.parts
            .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
            .map((part) => part.text)
            .join("\n")
            .trim()
          if (!markdown) throw new Error("NOVELX_STORY_CHILD_OUTPUT_MISSING")
          return yield* withStoryMutation(
            Effect.gen(function* () {
              const runtime = yield* loadStoryRuntime(fs)
              const committed = commitStoryDocument({
                manifest: runtime.manifest,
                documentId: params.documentId,
                editorSessionId: ctx.sessionID,
                taskSessionId: params.taskSessionId,
                leaseId: params.leaseId,
                markdown,
                protagonistContinuity: runtime.protagonistContinuity ?? undefined,
                now: Date.now(),
              })
              yield* ctx.ask({
                permission: TOOL_ID,
                patterns: [committed.record.targetPath],
                always: ["Stories/**"],
                metadata: { documentId: committed.record.id, targetPath: committed.record.targetPath },
              })
              const target = absoluteStoryPath(runtime.world.directory, committed.record.targetPath)
              const existed = yield* fs.existsSafe(target)
              if (!committed.replayed) {
                yield* fs.ensureDir(path.dirname(target))
                yield* fs.writeFileString(target, committed.markdown)
                yield* persistStoryMaterialization(fs, events, runtime, committed.manifest)
                yield* publishWorldFile(events, target, existed ? "change" : "add")
              }
              return {
                title: committed.replayed ? "故事文稿已存在" : "故事文稿已提交",
                metadata: {
                  documentId: committed.record.id,
                  targetPath: committed.record.targetPath,
                  replayed: committed.replayed,
                },
                output: `${committed.record.targetPath} 已提交。继续 documents 中下一条 registered 文稿；不得返回改写世界、历史或既有文献。`,
              }
            }),
          )
        }).pipe(Effect.orDie),
    }
  }),
)
