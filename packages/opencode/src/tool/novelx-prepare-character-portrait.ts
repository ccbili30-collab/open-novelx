import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Tool } from "@/tool/tool"
import { CHARACTER_PORTRAIT_COMPOSITION } from "@/novelx/character-visual"
import { worldSha256 } from "@/novelx/world-blueprint"
import { absoluteCharacterPath, loadCharacterRuntime, loadCharacterWorldContents } from "./novelx-character-runtime"
import { assertCharacterPortraitBranch, loadCharacterVisualLanguage } from "./novelx-character-visual-runtime"

const TOOL_ID = "novelx_prepare_character_portrait"
export const Parameters = Schema.Struct({})
type Metadata = { ownerId: string; title: string; contextPackPath: string; characterIntegritySha256: string }

export const NovelXPrepareCharacterPortraitTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description:
        "Read the sealed protagonist dossier and its cited world originals for one canonical portrait prompt.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          assertCharacterPortraitBranch(ctx)
          const runtime = yield* loadCharacterRuntime(fs)
          const manifest = runtime.manifest
          if (manifest.status !== "text_completed" || !manifest.protagonist || !manifest.document?.committedSha256) {
            throw new Error("NOVELX_CHARACTER_TEXT_INCOMPLETE")
          }
          const dossier = yield* fs.readFileStringSafe(
            absoluteCharacterPath(runtime.world.directory, manifest.document.targetPath),
          )
          if (!dossier || worldSha256(dossier) !== manifest.document.committedSha256) {
            throw new Error("NOVELX_CHARACTER_DOCUMENT_DRIFT")
          }
          const worldContents = yield* loadCharacterWorldContents(fs, runtime)
          const cited = new Set([
            ...manifest.protagonist.originSourceEntityIds,
            ...manifest.protagonist.affiliationSourceEntityIds,
          ])
          const sources = manifest.world.sources
            .filter((source) => cited.has(source.entityId))
            .map((source) => ({ ...source, markdown: worldContents[source.entityId] }))
          if (sources.length !== cited.size || sources.some((source) => !source.markdown)) {
            throw new Error("NOVELX_CHARACTER_PORTRAIT_SOURCE_INCOMPLETE")
          }
          const visualLanguage = yield* loadCharacterVisualLanguage(fs, runtime)
          const contextPackPath = `.novelx/visuals/character-portrait-context-${manifest.integritySha256}.json`
          const contextPackAbsolutePath = path.join(runtime.world.directory, ...contextPackPath.split("/"))
          const contextPack =
            JSON.stringify(
              {
                schemaVersion: 1,
                characterMaterializationIntegritySha256: manifest.integritySha256,
                ownerId: manifest.protagonist.id,
                protagonist: manifest.protagonist,
                dossier: {
                  id: manifest.document.id,
                  path: manifest.document.targetPath,
                  sha256: manifest.document.committedSha256,
                  markdown: dossier,
                },
                citedWorldOriginals: sources,
                visualLanguage,
                fixedComposition: CHARACTER_PORTRAIT_COMPOSITION,
                instruction:
                  "只为这个 ownerId 写一条最终角色立绘 Prompt。必须忠于角色档案、引用世界原文、共享视觉语言和固定构图；不得改写事实，不得提交备选 Prompt。",
              },
              null,
              2,
            ) + "\n"
          const existing = yield* fs.readFileStringSafe(contextPackAbsolutePath)
          if (existing !== undefined && existing !== contextPack) {
            throw new Error("NOVELX_CHARACTER_PORTRAIT_CONTEXT_CONFLICT")
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
            title: "角色立绘原文已准备",
            metadata: {
              ownerId: manifest.protagonist.id,
              title: manifest.protagonist.name,
              contextPackPath,
              characterIntegritySha256: manifest.integritySha256,
            },
            output: [
              `CONTROL characterIntegrity=${manifest.integritySha256} contextPackPath=${contextPackPath}`,
              `OWNER ${JSON.stringify({ ownerId: manifest.protagonist.id, title: manifest.protagonist.name })}`,
              "必须用 read 分页读完整个 contextPackPath，然后只提交一条最终 Prompt。",
            ].join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)

