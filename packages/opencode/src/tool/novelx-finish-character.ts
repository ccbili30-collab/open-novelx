import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import {
  finishCharacterText,
  type RegisteredCharacterMaterialization,
} from "@/novelx/character-materialization"
import { Tool } from "@/tool/tool"
import {
  assertCharacterEditor,
  loadCharacterRuntime,
  persistCharacterMaterialization,
  withCharacterMutation,
} from "./novelx-character-runtime"

const TOOL_ID = "novelx_finish_character"
export const Parameters = Schema.Struct({})
type Metadata = { integritySha256: string; protagonistId: string; targetPath: string; documentSha256: string }

export const NovelXFinishCharacterTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Seal the unique protagonist dossier and return its immutable source identity to Growth.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        withCharacterMutation(
          Effect.gen(function* () {
            assertCharacterEditor(ctx)
            const runtime = yield* loadCharacterRuntime(fs)
            if (!runtime.manifest.protagonist || !runtime.manifest.document) {
              throw new Error("NOVELX_CHARACTER_REGISTRATION_INCOMPLETE")
            }
            const manifest = finishCharacterText({
              manifest: runtime.manifest as RegisteredCharacterMaterialization,
              editorSessionId: ctx.sessionID,
              now: Date.now(),
            })
            yield* persistCharacterMaterialization(fs, events, runtime, manifest)
            return {
              title: "唯一主角档案已封存",
              metadata: {
                integritySha256: manifest.integritySha256,
                protagonistId: manifest.protagonist.id,
                targetPath: manifest.document.targetPath,
                documentSha256: manifest.document.committedSha256,
              },
              output: [
                `CHARACTER ${manifest.integritySha256}`,
                `protagonistId=${manifest.protagonist.id}`,
                `path=${manifest.document.targetPath}`,
                `sha256=${manifest.document.committedSha256}`,
                "主角文字阶段已完成。返回 Growth，由 Growth 重新路由；本分身不得发起图片、故事或第二个角色。",
              ].join("\n"),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
