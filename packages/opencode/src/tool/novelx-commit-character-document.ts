import path from "node:path"
import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { commitCharacterDocument } from "@/novelx/character-materialization"
import { Tool } from "@/tool/tool"
import {
  absoluteCharacterPath,
  assertCharacterEditor,
  loadCharacterRuntime,
  persistCharacterMaterialization,
  withCharacterMutation,
} from "./novelx-character-runtime"
import { publishWorldFile } from "./novelx-world-runtime"

const TOOL_ID = "novelx_commit_character_document"
export const Parameters = Schema.Struct({ leaseId: Schema.String, taskSessionId: Schema.String })
type Metadata = { documentId: string; targetPath: string; sha256: string; replayed: boolean }

export const NovelXCommitCharacterDocumentTool = Tool.define<
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
      description: "Validate one owned character-writer result and atomically publish the protagonist dossier.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          assertCharacterEditor(ctx)
          const child = yield* sessions.get(SessionID.make(params.taskSessionId))
          if (child.parentID !== ctx.sessionID || child.agent !== "novelx-character-writer") {
            throw new Error(
              "NOVELX_CHARACTER_CHILD_SESSION_INVALID: Expected an owned novelx-character-writer child.",
            )
          }
          const messages = yield* sessions.messages({ sessionID: child.id })
          const assistant = messages.findLast((message) => message.info.role === "assistant")
          const markdown = assistant?.parts
            .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
            .map((part) => part.text)
            .join("\n")
            .trim()
          if (!markdown) throw new Error("NOVELX_CHARACTER_CHILD_OUTPUT_MISSING")
          return yield* withCharacterMutation(
            Effect.gen(function* () {
              const runtime = yield* loadCharacterRuntime(fs)
              const committed = commitCharacterDocument({
                manifest: runtime.manifest,
                editorSessionId: ctx.sessionID,
                writerSessionId: params.taskSessionId,
                leaseId: params.leaseId,
                markdown,
                now: Date.now(),
              })
              yield* ctx.ask({
                permission: TOOL_ID,
                patterns: [committed.record.targetPath],
                always: ["Characters/**"],
                metadata: { documentId: committed.record.id, targetPath: committed.record.targetPath },
              })
              const target = absoluteCharacterPath(runtime.world.directory, committed.record.targetPath)
              const existed = yield* fs.existsSafe(target)
              if (!committed.replayed) {
                yield* fs.ensureDir(path.dirname(target))
                yield* fs.writeFileString(target, committed.markdown)
                yield* persistCharacterMaterialization(fs, events, runtime, committed.manifest)
                yield* publishWorldFile(events, target, existed ? "change" : "add")
              }
              return {
                title: committed.replayed ? "主角档案已存在" : "主角档案已提交",
                metadata: {
                  documentId: committed.record.id,
                  targetPath: committed.record.targetPath,
                  sha256: committed.record.committedSha256!,
                  replayed: committed.replayed,
                },
                output: `${committed.record.targetPath} 已提交。立即调用 novelx_finish_character；不得生成第二张角色卡。`,
              }
            }),
          )
        }).pipe(Effect.orDie),
    }
  }),
)
