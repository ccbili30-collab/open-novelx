import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { prepareCharacterDocument } from "@/novelx/character-materialization"
import { Tool } from "@/tool/tool"
import {
  assertCharacterEditor,
  loadCharacterRuntime,
  loadCharacterWorldContents,
  persistCharacterMaterialization,
  withCharacterMutation,
} from "./novelx-character-runtime"

const TOOL_ID = "novelx_prepare_character_document"
export const Parameters = Schema.Struct({})
type Metadata = { documentId: string; targetPath: string; leaseId: string; contextPackPath: string; replayed: boolean }

export const NovelXPrepareCharacterDocumentTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Lease the unique protagonist dossier and freeze its exact world-source Context Pack.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        withCharacterMutation(
          Effect.gen(function* () {
            assertCharacterEditor(ctx)
            const runtime = yield* loadCharacterRuntime(fs)
            const worldContents = yield* loadCharacterWorldContents(fs, runtime)
            const prepared = prepareCharacterDocument({
              manifest: runtime.manifest,
              editorSessionId: ctx.sessionID,
              editorMessageId: ctx.messageID,
              worldContents,
              now: Date.now(),
            })
            if (!prepared.replayed) {
              yield* persistCharacterMaterialization(fs, events, runtime, prepared.manifest)
            }
            const leaseId = prepared.record.lease?.id ?? "committed"
            const contextPackPath = `.novelx/growth/character-context/${prepared.record.id}-${leaseId}.json`
            const contextPackAbsolutePath = path.join(runtime.world.directory, ...contextPackPath.split("/"))
            const contextPack =
              JSON.stringify(
                {
                  schemaVersion: 1,
                  documentId: prepared.record.id,
                  leaseId: prepared.record.lease?.id ?? null,
                  context: prepared.context,
                },
                null,
                2,
              ) + "\n"
            const existing = yield* fs.readFileStringSafe(contextPackAbsolutePath)
            if (existing !== undefined && existing !== contextPack) {
              throw new Error(
                "NOVELX_CHARACTER_CONTEXT_PACK_CONFLICT: Existing Context Pack differs from the authoritative lease.",
              )
            }
            if (existing === undefined) {
              const temporary = `${contextPackAbsolutePath}.${process.pid}.${randomUUID()}.tmp`
              yield* fs.ensureDir(path.dirname(contextPackAbsolutePath))
              yield* fs.writeFileString(temporary, contextPack, { flag: "wx" }).pipe(
                Effect.andThen(fs.rename(temporary, contextPackAbsolutePath)),
                Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
              )
            }
            return {
              title: prepared.replayed ? "主角档案已准备" : "主角档案已锁定",
              metadata: {
                documentId: prepared.record.id,
                targetPath: prepared.record.targetPath,
                leaseId,
                contextPackPath,
                replayed: prepared.replayed,
              },
              output: [
                `CONTROL documentId=${prepared.record.id} leaseId=${leaseId} contextPackPath=${contextPackPath}`,
                "下一步必须调用 task，subagent_type 必须是 novelx-character-writer。只交付 CONTROL 行与 contextPackPath；叶 Agent 分页读完整个 Context Pack 后只返回 Markdown。",
              ].join("\n"),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
