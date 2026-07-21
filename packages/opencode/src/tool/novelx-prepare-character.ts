import { Effect, Schema } from "effect"
import { NovelXCharacter } from "@opencode-ai/schema/novelx-character"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Tool } from "@/tool/tool"
import {
  assertCharacterEditor,
  loadCharacterRuntime,
  persistCharacterMaterialization,
  withCharacterMutation,
} from "./novelx-character-runtime"

const TOOL_ID = "novelx_prepare_character"
export const Parameters = Schema.Struct({})
type Metadata = {
  path: string
  status: NovelXCharacter.Materialization["status"]
  sourceCount: number
  contextSha256: string
}

export const NovelXPrepareCharacterTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | EventV2Bridge.Service
>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    return {
      description: "Create or resume one protagonist dossier from the current frozen world.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        withCharacterMutation(
          Effect.gen(function* () {
            assertCharacterEditor(ctx)
            const runtime = yield* loadCharacterRuntime(fs, { createForSession: ctx.sessionID })
            if (!runtime.manifestExisted) {
              yield* ctx.ask({
                permission: TOOL_ID,
                patterns: [NovelXCharacter.MATERIALIZATION_PATH, `${NovelXCharacter.CHARACTER_DIRECTORY}/**`],
                always: [NovelXCharacter.MATERIALIZATION_PATH, `${NovelXCharacter.CHARACTER_DIRECTORY}/**`],
                metadata: { sources: runtime.manifest.world.sources.length },
              })
              yield* persistCharacterMaterialization(fs, events, runtime, runtime.manifest)
            }
            return {
              title: runtime.manifestExisted ? "主角生长已恢复" : "主角生长已准备",
              metadata: {
                path: NovelXCharacter.MATERIALIZATION_PATH,
                status: runtime.manifest.status,
                sourceCount: runtime.manifest.world.sources.length,
                contextSha256: runtime.manifest.preparedContextSha256,
              },
              output: JSON.stringify({
                status: runtime.manifest.status,
                contextSha256: runtime.manifest.preparedContextSha256,
                sources: runtime.manifest.world.sources,
                next:
                  runtime.manifest.status === "planning"
                    ? "分批读取全部冻结世界原文，再注册唯一主角。"
                    : runtime.manifest.status === "text_completed"
                      ? "主角档案已经封存；向 Growth 返回角色完整性哈希，不得重写或发起生图。"
                      : "继续现有主角档案。",
              }),
            }
          }),
        ).pipe(Effect.orDie),
    }
  }),
)
