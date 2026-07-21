import {
  commitStoryDocument,
  createStoryMaterialization,
  prepareStoryDocument,
  recordStoryCharacterRead,
  recordStorySourceReads,
  registerStory,
} from "../../src/novelx/story-materialization"
import { worldSha256 } from "../../src/novelx/world-blueprint"

const SHA = (digit: string) => digit.repeat(64)
const world = {
  title: "灰潮大陆",
  materializationIntegritySha256: SHA("a"),
  sources: [{ entityId: "world-1", title: "霜脊山系", path: "World/霜脊山系.md", sha256: SHA("1") }],
}
const characterMarkdown = `# 弥娅·雪痕\n\n${"她在霜脊山口辨认旧路、关印和每一场风雪留下的代价。".repeat(60)}\n`
const protagonist = {
  id: "nx-protagonist-miya",
  name: "弥娅·雪痕",
  path: "Characters/弥娅·雪痕.md",
  sha256: worldSha256(characterMarkdown),
  characterIntegritySha256: SHA("c"),
}

export function registeredStoryFixture() {
  const planning = createStoryMaterialization({ world, protagonist, editorSessionId: "ses-story-editor", now: 1 })
  const read = recordStorySourceReads({
    manifest: planning,
    editorSessionId: "ses-story-editor",
    sourceEntityIds: ["world-1"],
    now: 2,
  })
  const characterRead = recordStoryCharacterRead({
    manifest: read,
    editorSessionId: "ses-story-editor",
    protagonistId: protagonist.id,
    sourceSha256: protagonist.sha256,
    now: 2,
  })
  let manifest = registerStory({
    manifest: characterRead,
    editorSessionId: "ses-story-editor",
    profile: {
      contextSha256: characterRead.preparedContextSha256,
      historyBooks: [
        {
          title: "《霜脊以北》",
          author: "边地史会",
          summary: "解释霜脊边境三百年的制度、战争和迁徙。",
          chapters: Array.from({ length: 3 }, (_, index) => ({
            title: `第${index + 1}章 边境纪年`,
            brief: "以具名事件解释边境制度形成和变化。",
            sourceEntityIds: ["world-1"],
          })),
        },
      ],
      references: Array.from({ length: 2 }, (_, index) => ({
        title: `《边境文书${index + 1}》`,
        kindLabel: "文书",
        author: "无名记录者",
        summary: "保存边境社会运行留下的具体文字证据。",
        sourceEntityIds: ["world-1"],
        historyReferences: [{ historyBookIndex: 0, chapterIndex: index }],
      })),
      novel: {
        title: "《雪线以北》",
        author: "NovelX",
        summary: "一群旅人在风雪封关期间面对旧债和边境冲突。",
        theme: { title: "风雪封关", summary: "六章组成的完整故事主题。" },
        chapters: Array.from({ length: 6 }, (_, index) => ({
          title: `第${index + 1}章 风雪`,
          brief: "推进封关期间连续发生的故事。",
          sourceEntityIds: ["world-1"],
          historyReferences: [{ historyBookIndex: 0, chapterIndex: index % 3 }],
          documentIndices: [index % 2],
        })),
      },
    },
    now: 3,
  }).manifest
  const contents: Record<string, string> = {}
  for (const document of manifest.documents) {
    const prepared = prepareStoryDocument({
      manifest,
      documentId: document.id,
      editorSessionId: "ses-story-editor",
      editorMessageId: `msg-${document.ordinal}`,
      committedContents: contents,
      protagonistMarkdown: characterMarkdown,
      now: 10 + document.ordinal,
    })
    manifest = prepared.manifest
    const minimum = document.kind === "novel_chapter" ? 1_600 : document.kind === "history_chapter" ? 1_300 : 400
    const markdown = `# ${document.title}\n\n${"可阅读的世界叙事。".repeat(Math.ceil(minimum / 9))}\n`
    const committed = commitStoryDocument({
      manifest,
      documentId: document.id,
      editorSessionId: "ses-story-editor",
      taskSessionId: `ses-writer-${document.ordinal}`,
      leaseId: prepared.record.lease!.id,
      markdown,
      now: 100 + document.ordinal,
    })
    manifest = committed.manifest
    contents[document.id] = committed.markdown
  }
  return manifest
}
