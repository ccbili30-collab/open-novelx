import { Effect } from "effect"
import { NovelXCharacter } from "@opencode-ai/schema/novelx-character"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { registerCharacter } from "@/novelx/character-materialization"
import { Tool } from "@/tool/tool"
import {
  assertCharacterEditor,
  loadCharacterRuntime,
  persistCharacterMaterialization,
  withCharacterMutation,
} from "./novelx-character-runtime"

const TOOL_ID = "novelx_register_character"
export const Parameters = NovelXCharacter.RegistrationProfile
type Metadata = { protagonistId: string; documentId: string; targetPath: string }

export const NovelXRegisterCharacterTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Register exactly one source-bound protagonist without predetermining a completed arc or ending.",
      parameters: Parameters,
      execute: (profile, ctx) =>
        withCharacterMutation(
          Effect.gen(function* () {
            assertCharacterEditor(ctx)
            const runtime = yield* loadCharacterRuntime(fs)
            if (runtime.manifest.sourceReads.length !== runtime.manifest.world.sources.length) {
              throw new Error(
                "NOVELX_CHARACTER_SOURCE_UNREAD: Read every frozen world original before registering the protagonist.",
              )
            }
            const result = registerCharacter({
              manifest: runtime.manifest,
              editorSessionId: ctx.sessionID,
              profile,
              now: Date.now(),
            })
            yield* persistCharacterMaterialization(fs, events, runtime, result.manifest)
            return {
              title: "唯一主角已注册",
              metadata: {
                protagonistId: result.manifest.protagonist.id,
                documentId: result.manifest.document.id,
                targetPath: result.manifest.document.targetPath,
              },
              output: JSON.stringify({
                protagonist: result.manifest.protagonist,
                document: result.manifest.document,
                next: "prepare 唯一档案 → novelx-character-writer → commit → finish；不得分裂第二个角色。",
              }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
