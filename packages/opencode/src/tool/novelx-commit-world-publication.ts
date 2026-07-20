import { createHash } from "node:crypto"
import path from "node:path"
import { Effect, Schema } from "effect"
import { NovelXWorldPublication } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { commitWorldPublication } from "@/novelx/world-publication"
import { Tool } from "@/tool/tool"
import {
  absoluteWorldPath,
  assertWorldPublicationEditor,
  publishWorldFile,
  withWorldMutation,
} from "./novelx-world-runtime"
import { loadWorldPublicationRuntime, persistWorldPublication } from "./novelx-publication-runtime"

const TOOL_ID = "novelx_commit_world_publication"
export const Parameters = Schema.Struct({
  entityId: Schema.String,
  kind: Schema.Literals(["atlas", "travelogue"]),
  taskSessionId: Schema.String,
})
type Metadata = { entityId: string; kind: "atlas" | "travelogue"; targetPath: string; replayed: boolean }

export const NovelXCommitWorldPublicationTool = Tool.define<
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
        "Validate and atomically publish one owned prose-writer result without exposing internal work records.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          assertWorldPublicationEditor(ctx)
          const taskSessionID = SessionID.make(params.taskSessionId)
          const child = yield* sessions.get(taskSessionID)
          if (child.parentID !== ctx.sessionID || child.agent !== "novelx-world-prose-writer") {
            throw new Error("NOVELX_PUBLICATION_CHILD_SESSION_INVALID")
          }
          const messages = yield* sessions.messages({ sessionID: taskSessionID })
          const assistant = messages.findLast((message) => message.info.role === "assistant")
          const markdown = assistant?.parts
            .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
            .map((part) => part.text)
            .join("\n")
            .trim()
          if (!markdown) throw new Error("NOVELX_PUBLICATION_CHILD_OUTPUT_MISSING")
          return yield* withWorldMutation(
            Effect.gen(function* () {
              const runtime = yield* loadWorldPublicationRuntime(fs)
              const source = runtime.manifest.records.find(
                (record) => record.entityId === params.entityId && record.kind === params.kind,
              )
              if (!source) throw new Error("NOVELX_PUBLICATION_RECORD_UNKNOWN")
              const sourceContent = yield* fs.readFileStringSafe(
                absoluteWorldPath(runtime.world.directory, source.sourcePath),
              )
              if (!sourceContent || createHash("sha256").update(sourceContent).digest("hex") !== source.sourceSha256) {
                throw new Error("NOVELX_PUBLICATION_SOURCE_DRIFT")
              }
              const committed = commitWorldPublication({
                manifest: runtime.manifest,
                entityId: params.entityId,
                kind: params.kind,
                sourceSha256: source.sourceSha256,
                markdown,
                now: Date.now(),
              })
              yield* ctx.ask({
                permission: TOOL_ID,
                patterns: [committed.record.targetPath, NovelXWorldPublication.MANIFEST_PATH],
                always: [NovelXWorldPublication.MANIFEST_PATH, `${NovelXWorldPublication.PUBLICATION_DIRECTORY}/**`],
                metadata: { entityId: params.entityId, kind: params.kind, targetPath: committed.record.targetPath },
              })
              const target = absoluteWorldPath(runtime.world.directory, committed.record.targetPath)
              const existed = yield* fs.existsSafe(target)
              yield* fs.ensureDir(path.dirname(target))
              yield* fs.writeFileString(target, committed.markdown)
              yield* persistWorldPublication(fs, events, runtime.manifestPath, committed.manifest)
              yield* publishWorldFile(events, target, existed ? "change" : "add")
              return {
                title: committed.replayed ? "玩家文稿已存在" : "玩家文稿已提交",
                metadata: {
                  entityId: params.entityId,
                  kind: params.kind,
                  targetPath: committed.record.targetPath,
                  replayed: committed.replayed,
                },
                output: `${committed.record.targetPath} 已提交；内部来源与生产字段未写入玩家文稿。`,
              }
            }),
          )
        }).pipe(Effect.orDie),
    }
  }),
)
