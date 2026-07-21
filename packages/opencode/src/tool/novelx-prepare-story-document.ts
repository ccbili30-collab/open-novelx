import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { prepareStoryDocument } from "@/novelx/story-materialization"
import { Tool } from "@/tool/tool"
import {
  assertStoryEditor,
  loadCommittedStoryContents,
  loadStoryRuntime,
  loadStoryWorldContents,
  persistStoryMaterialization,
  withStoryMutation,
} from "./novelx-story-runtime"

const TOOL_ID = "novelx_prepare_story_document"
export const Parameters = Schema.Struct({ documentId: Schema.String })
type Metadata = {
  documentId: string
  targetPath: string
  leaseId: string
  contextPackPath: string
  kind: string
  replayed: boolean
}

export const NovelXPrepareStoryDocumentTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Lease the next causal Story document and return exact frozen-world and committed-upstream originals for one writer leaf.",
      parameters: Parameters,
      execute: (params, ctx) =>
        withStoryMutation(
          Effect.gen(function* () {
            assertStoryEditor(ctx)
            const runtime = yield* loadStoryRuntime(fs)
            const committedContents = yield* loadCommittedStoryContents(fs, runtime)
            const worldContents = yield* loadStoryWorldContents(fs, runtime)
            const prepared = prepareStoryDocument({
              manifest: runtime.manifest,
              documentId: params.documentId,
              editorSessionId: ctx.sessionID,
              editorMessageId: ctx.messageID,
              committedContents,
              worldContents,
              now: Date.now(),
            })
            if (!prepared.replayed) yield* persistStoryMaterialization(fs, events, runtime, prepared.manifest)
            const leaseId = prepared.record.lease?.id ?? "committed"
            const contextPackPath = `.novelx/growth/story-context/${prepared.record.id}-${leaseId}.json`
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
              throw new Error("NOVELX_STORY_CONTEXT_PACK_CONFLICT: Existing context pack differs from the authoritative lease.")
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
              title: prepared.replayed ? "故事文稿已准备" : "故事文稿已锁定",
              metadata: {
                documentId: prepared.record.id,
                targetPath: prepared.record.targetPath,
                leaseId,
                contextPackPath,
                kind: prepared.record.kind,
                replayed: prepared.replayed,
              },
              output: [
                `CONTROL documentId=${prepared.record.id} leaseId=${leaseId} contextPackPath=${contextPackPath}`,
                "下一步必须调用 task，subagent_type 必须是 novelx-story-writer。只把上面的 CONTROL 行和 contextPackPath 交给叶 Agent。叶 Agent 必须用 read 分页读完整个 Context Pack 后再写正文；不得查询其他规则或创造世界事实。",
              ].join("\n"),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
