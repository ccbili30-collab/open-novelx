import { Effect, Schema } from "effect"
import { NovelXGrowth } from "@opencode-ai/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { prepareGeographyDocument } from "@/novelx/geography-materialization"
import { Tool } from "@/tool/tool"
import {
  assertGrowthEditor,
  loadGeographyRuntime,
  persistGeographyMaterialization,
  withGeographyMutation,
} from "./novelx-geography-runtime"

const TOOL_ID = "novelx_prepare_geography"
export const Parameters = Schema.Struct({
  terrainId: Schema.String.annotate({ description: "The registered terrain ID to assign to a geography child Agent." }),
})

type Metadata = { terrainId: string; targetPath: string; draftPath: string; leaseId: string | null; replayed: boolean }

export const NovelXPrepareGeographyTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: [
        "Lease one registered terrain document and return its authoritative Context Pack.",
        "Call this before task(subagent_type=novelx-geography). Pass the returned Context Pack unchanged to that child Agent.",
      ].join(" "),
      parameters: Parameters,
      execute: (params, ctx) =>
        withGeographyMutation(
          Effect.gen(function* () {
            assertGrowthEditor(ctx)
            const runtime = yield* loadGeographyRuntime(fs, { createForSession: ctx.sessionID })
            const prepared = prepareGeographyDocument({
              manifest: runtime.materialization,
              skeleton: runtime.skeleton,
              terrainId: params.terrainId,
              ownerSessionId: ctx.sessionID,
              ownerMessageId: ctx.messageID,
              now: Date.now(),
            })
            yield* ctx.ask({
              permission: TOOL_ID,
              patterns: [NovelXGrowth.MATERIALIZATION_PATH, prepared.record.draftPath, prepared.record.targetPath],
              always: [NovelXGrowth.MATERIALIZATION_PATH],
              metadata: { terrainId: params.terrainId, targetPath: prepared.record.targetPath },
            })
            yield* persistGeographyMaterialization(
              fs,
              events,
              runtime,
              prepared.manifest,
              runtime.materializationExisted ? "change" : "add",
            )
            return {
              title: prepared.replayed ? "地理任务已准备" : "地理任务已租用",
              metadata: {
                terrainId: params.terrainId,
                targetPath: prepared.record.targetPath,
                draftPath: prepared.record.draftPath,
                leaseId: prepared.record.lease?.id ?? null,
                replayed: prepared.replayed,
              },
              output: [
                `已锁定 ${prepared.record.targetPath}。`,
                "下一步必须调用 task，subagent_type 必须是 novelx-geography；不得自行撰写或写文件。",
                "把以下 Context Pack 原样交给子 Agent：",
                "```json",
                JSON.stringify(prepared.context, null, 2),
                "```",
              ].join("\n"),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
