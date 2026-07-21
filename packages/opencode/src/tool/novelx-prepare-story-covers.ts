import path from "node:path"
import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Tool } from "@/tool/tool"
import { loadCommittedStoryContents, loadStoryRuntime } from "./novelx-story-runtime"
import { assertVisualTool, loadStoryVisualLanguage } from "./novelx-story-cover-runtime"

const TOOL_ID = "novelx_prepare_story_covers"
export const Parameters = Schema.Struct({})
type Metadata = { required: number; novel: string; historyBooks: number; contextPackPath: string }

export const NovelXPrepareStoryCoversTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service>(
  TOOL_ID,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return {
      description: "Read sealed Story originals and return the exact mandatory novel, history-book and theme cover owners.",
      parameters: Parameters,
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          assertVisualTool(ctx)
          const runtime = yield* loadStoryRuntime(fs)
          if (runtime.manifest.status !== "text_completed" || !runtime.manifest.novel) throw new Error("NOVELX_STORY_TEXT_INCOMPLETE")
          const visualLanguage = yield* loadStoryVisualLanguage(fs, runtime)
          const contents = yield* loadCommittedStoryContents(fs, runtime)
          const works = [
            {
              ownerId: runtime.manifest.novel.id,
              subtype: "novel",
              title: runtime.manifest.novel.title,
              author: runtime.manifest.novel.author,
              summary: runtime.manifest.novel.summary,
              documents: runtime.manifest.novel.chapters.map((id) => ({
                record: runtime.manifest.documents.find((document) => document.id === id),
                markdown: contents[id],
              })),
            },
            ...runtime.manifest.historyBooks.map((book) => ({
              ownerId: book.id,
              subtype: "history",
              title: book.title,
              author: book.author,
              summary: book.summary,
              documents: book.chapterIds.map((id) => ({
                record: runtime.manifest.documents.find((document) => document.id === id),
                markdown: contents[id],
              })),
            })),
            {
              ownerId: runtime.manifest.novel.theme.id,
              subtype: "theme",
              title: runtime.manifest.novel.theme.title,
              author: runtime.manifest.novel.author,
              summary: runtime.manifest.novel.theme.summary,
              documents: runtime.manifest.novel.chapters.map((id) => ({
                record: runtime.manifest.documents.find((document) => document.id === id),
                markdown: contents[id],
              })),
            },
          ]
          const contextPackPath = `.novelx/visuals/story-cover-context-${runtime.manifest.integritySha256}.json`
          const contextPackAbsolutePath = path.join(runtime.world.directory, ...contextPackPath.split("/"))
          const contextPack =
            JSON.stringify(
              {
                schemaVersion: 1,
                storyMaterializationIntegritySha256: runtime.manifest.integritySha256,
                visualLanguage,
                works,
                instruction: "必须为每个 ownerId 各提交一个 CoverProfile；每个 profile 只有一条直接提交图片模型的最终 prompt，不得遗漏、增加、重复或提供备选 prompt。",
              },
              null,
              2,
            ) + "\n"
          const existing = yield* fs.readFileStringSafe(contextPackAbsolutePath)
          if (existing !== undefined && existing !== contextPack) {
            throw new Error("NOVELX_STORY_COVER_CONTEXT_CONFLICT: Existing cover context differs from the sealed Story.")
          }
          if (existing === undefined) {
            const temporary = `${contextPackAbsolutePath}.${process.pid}.${randomUUID()}.tmp`
            yield* fs.ensureDir(path.dirname(contextPackAbsolutePath))
            yield* fs.writeFileString(temporary, contextPack, { flag: "wx" }).pipe(
              Effect.andThen(fs.rename(temporary, contextPackAbsolutePath)),
              Effect.onError(() => fs.remove(temporary).pipe(Effect.ignore)),
            )
          }
          const owners = works.map((work) => ({ ownerId: work.ownerId, subtype: work.subtype, title: work.title }))
          return {
            title: "故事封面原文已准备",
            metadata: {
              required: works.length,
              novel: runtime.manifest.novel.title,
              historyBooks: runtime.manifest.historyBooks.length,
              contextPackPath,
            },
            output: [
              `CONTROL storyIntegrity=${runtime.manifest.integritySha256} contextPackPath=${contextPackPath}`,
              `OWNERS ${JSON.stringify(owners)}`,
              "必须用 read 分页读完整个 contextPackPath 后，为 OWNERS 中每个 ownerId 各提交一个 CoverProfile；每个 owner 只允许一条最终 Prompt。",
            ].join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
