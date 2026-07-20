import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Tool } from "@/tool/tool"
import { assertWorldVisualEditor, loadWorldRuntime } from "./novelx-world-runtime"

const TOOL_ID = "novelx_prepare_world_visuals"
export const Parameters = Schema.Struct({})
type Metadata = { entities: number; documents: number }

export const NovelXPrepareWorldVisualsTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description:
        "Prepare the completed World surface for a clean visual editor and return an authoritative source index.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          assertWorldVisualEditor(ctx)
          const runtime = yield* loadWorldRuntime(fs)
          if (runtime.materialization.status !== "completed") {
            throw new Error("NOVELX_VISUAL_WORLD_INCOMPLETE: Finish all world stages before visual registration.")
          }
          const documents = new Map(runtime.materialization.documents.map((document) => [document.entityId, document]))
          const sources = runtime.materialization.stages.flatMap((stage) => {
            const blueprintStage = runtime.blueprint.stages.find((item) => item.id === stage.stageId)!
            return stage.entities.map((entity) => {
              const document = documents.get(entity.id)!
              return {
                entityId: entity.id,
                stageId: stage.stageId,
                stageLabel: blueprintStage.label,
                name: entity.name,
                typeLabel: entity.typeLabel,
                summary: entity.summary,
                path: document.targetPath,
                sha256: document.committedSha256!,
              }
            })
          })
          return {
            title: "世界视觉来源已准备",
            metadata: { entities: sources.length, documents: runtime.materialization.documents.length },
            output: JSON.stringify({
              world: {
                title: runtime.blueprint.profile.title,
                genre: runtime.blueprint.profile.genre,
                designSummary: runtime.blueprint.profile.designSummary,
                materializationIntegritySha256: runtime.materialization.integritySha256,
              },
              sources,
            }),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
