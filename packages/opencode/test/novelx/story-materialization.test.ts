import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { NovelXStory } from "@opencode-ai/schema/novelx-story"
import {
  commitStoryDocument,
  createStoryMaterialization,
  finishStoryText,
  prepareStoryDocument,
  recordStoryCharacterRead,
  recordStorySourceReads,
  registerStory,
  verifyStoryMaterialization,
} from "../../src/novelx/story-materialization"
import { worldSha256 } from "../../src/novelx/world-blueprint"

const SHA = (digit: string) => digit.repeat(64)

const world = {
  title: "灰潮大陆：自然约束下的世界生长",
  materializationIntegritySha256: SHA("a"),
  sources: [
    { entityId: "world-north", title: "霜脊山系", path: "World/01-自然/霜脊山系.md", sha256: SHA("1") },
    { entityId: "world-river", title: "三岔母河流域", path: "World/01-自然/三岔母河流域.md", sha256: SHA("2") },
    { entityId: "world-order", title: "霜口双印关议会", path: "World/03-权力/霜口双印关议会.md", sha256: SHA("3") },
  ],
}

const characterMarkdown = `# 弥娅·雪痕\n\n${"她从霜脊山口的旧路和双印制度中学会判断风雪、债务与人的犹豫。".repeat(60)}\n`
const protagonist = {
  id: "nx-protagonist-miya",
  name: "弥娅·雪痕",
  path: "Characters/弥娅·雪痕.md",
  sha256: worldSha256(characterMarkdown),
  characterIntegritySha256: SHA("c"),
}

const profile = {
  contextSha256: "",
  historyBooks: [
    {
      title: "《霜脊以北：关隘三百年》",
      author: "无名关史编纂会",
      summary: "以北境关隘的税权、迁徙、冬季封锁和山口战争解释灰潮大陆北方秩序如何形成。",
      chapters: [
        {
          title: "第一章 山口尚未成为边界",
          brief: "追溯三条古道如何从季节迁徙路线变为征税和驻军节点。",
          sourceEntityIds: ["world-north", "world-river"],
        },
        {
          title: "第二章 双印制度",
          brief: "说明关隘议会如何在商队、领主和守军之间建立双印许可。",
          sourceEntityIds: ["world-north", "world-order"],
        },
        {
          title: "第三章 长冬后的新边民",
          brief: "记录连续灾年如何改变人口、税役和边境共同体。",
          sourceEntityIds: ["world-north", "world-river", "world-order"],
        },
      ],
    },
  ],
  references: [
    {
      title: "《三岔渡冬粮征调令》",
      kindLabel: "法令",
      author: "霜口双印关议会",
      summary: "一份在长冬前征调渡口粮食、役夫和驮兽的边境法令。",
      sourceEntityIds: ["world-river", "world-order"],
      historyReferences: [{ historyBookIndex: 0, chapterIndex: 1 }],
    },
    {
      title: "《北行第七码头书》",
      kindLabel: "私人书信",
      author: "署名残缺的盐商学徒",
      summary: "一封描述关隘封锁、粮价和失踪商队的私人书信。",
      sourceEntityIds: ["world-north", "world-river"],
      historyReferences: [{ historyBookIndex: 0, chapterIndex: 2 }],
    },
  ],
  novel: {
    title: "《雪线以北》",
    author: "NovelX",
    summary: "一支被困在长冬关隘的临时商队，在粮令、旧债和即将爆发的边境冲突之间寻找出路。",
    theme: {
      title: "第一主题：风雪封关",
      summary: "六章构成完整闭环：封关、失踪、追索、背叛、山口决断与代价。",
    },
    chapters: Array.from({ length: 6 }, (_, index) => ({
      title: `第${index + 1}章 ${["封关", "失踪者", "旧印", "雪夜", "山口", "归途"][index]}`,
      brief: `推进风雪封关主题的第 ${index + 1} 个连续剧情阶段，并保留人物行动造成的实际后果。`,
      sourceEntityIds: index < 3 ? ["world-north", "world-order"] : ["world-north", "world-river"],
      historyReferences: [{ historyBookIndex: 0, chapterIndex: Math.min(index, 2) }],
      documentIndices: [index % 2],
    })),
  },
}

const planning = () =>
  createStoryMaterialization({
    world,
    protagonist,
    editorSessionId: "ses-story-editor",
    now: 10,
  })

const registered = () => {
  const read = recordStorySourceReads({
    manifest: planning(),
    editorSessionId: "ses-story-editor",
    sourceEntityIds: world.sources.map((source) => source.entityId),
    now: 20,
  })
  const characterRead = recordStoryCharacterRead({
    manifest: read,
    editorSessionId: "ses-story-editor",
    protagonistId: protagonist.id,
    sourceSha256: protagonist.sha256,
    now: 25,
  })
  return registerStory({
    manifest: characterRead,
    editorSessionId: "ses-story-editor",
    profile: { ...profile, contextSha256: characterRead.preparedContextSha256 },
    now: 30,
  }).manifest
}

const prose = (title: string, length: number) => `# ${title}\n\n${"正文叙述。".repeat(Math.ceil(length / 5))}\n`

describe("NovelX story materialization", () => {
  test("requires one committed protagonist source and includes it in the new v2 context integrity", () => {
    expect(() =>
      createStoryMaterialization({
        world,
        protagonist: undefined as never,
        editorSessionId: "ses-story-editor",
        now: 10,
      }),
    ).toThrow("NOVELX_STORY_CHARACTER_REQUIRED")

    const manifest = planning()
    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.protagonist).toEqual(protagonist)
    expect(manifest.preparedContextSha256).toBe(worldSha256({ world: manifest.world, protagonist }))
  })

  test("registers named history, references and exactly one 6-8 chapter novel with one-way dependencies", () => {
    const manifest = registered()

    expect(manifest.status).toBe("writing")
    expect(manifest.historyBooks).toHaveLength(1)
    expect(manifest.references).toHaveLength(2)
    expect(manifest.novel.chapters).toHaveLength(6)
    expect(manifest.documents).toHaveLength(11)
    expect(manifest.documents.map((document) => document.kind)).toEqual([
      "history_chapter",
      "history_chapter",
      "history_chapter",
      "reference_document",
      "reference_document",
      "novel_chapter",
      "novel_chapter",
      "novel_chapter",
      "novel_chapter",
      "novel_chapter",
      "novel_chapter",
    ])
    expect(manifest.documents[6]!.upstreamDocumentIds).toContain(manifest.documents[5]!.id)
    expect(manifest.documents.every((document) => document.targetPath.startsWith("Stories/"))).toBe(true)
    expect(manifest.protagonistRead).toMatchObject({ protagonistId: protagonist.id, sourceSha256: protagonist.sha256 })
    expect(verifyStoryMaterialization(manifest)).toEqual(manifest)
  })

  test("refuses unread world sources and downstream work whose dependencies are not committed", () => {
    const read = recordStorySourceReads({
      manifest: planning(),
      editorSessionId: "ses-story-editor",
      sourceEntityIds: ["world-north"],
      now: 20,
    })
    const characterRead = recordStoryCharacterRead({
      manifest: read,
      editorSessionId: "ses-story-editor",
      protagonistId: protagonist.id,
      sourceSha256: protagonist.sha256,
      now: 25,
    })
    expect(() =>
      registerStory({
        manifest: characterRead,
        editorSessionId: "ses-story-editor",
        profile: { ...profile, contextSha256: characterRead.preparedContextSha256 },
        now: 30,
      }),
    ).toThrow("NOVELX_STORY_SOURCE_UNREAD")

    const allWorld = recordStorySourceReads({
      manifest: planning(),
      editorSessionId: "ses-story-editor",
      sourceEntityIds: world.sources.map((source) => source.entityId),
      now: 20,
    })
    expect(() =>
      registerStory({
        manifest: allWorld,
        editorSessionId: "ses-story-editor",
        profile: { ...profile, contextSha256: allWorld.preparedContextSha256 },
        now: 30,
      }),
    ).toThrow("NOVELX_STORY_CHARACTER_SOURCE_UNREAD")

    const manifest = registered()
    const reference = manifest.documents.find((document) => document.kind === "reference_document")!
    expect(() =>
      prepareStoryDocument({
        manifest,
        documentId: reference.id,
        editorSessionId: "ses-story-editor",
        editorMessageId: "msg-1",
        committedContents: {},
        protagonistMarkdown: characterMarkdown,
        now: 40,
      }),
    ).toThrow("NOVELX_STORY_DEPENDENCY_INCOMPLETE")
  })

  test("leases, commits and finishes every document in strict order", () => {
    let manifest = registered()
    const committedContents: Record<string, string> = {}

    for (const document of manifest.documents) {
      const prepared = prepareStoryDocument({
        manifest,
        documentId: document.id,
        editorSessionId: "ses-story-editor",
        editorMessageId: `msg-${document.ordinal}`,
        committedContents,
        protagonistMarkdown: characterMarkdown,
        now: 100 + document.ordinal,
      })
      manifest = prepared.manifest
      if (document.kind === "novel_chapter") {
        expect(prepared.context.protagonist?.markdown).toBe(characterMarkdown)
      }
      const minimum = document.kind === "novel_chapter" ? 1_500 : document.kind === "history_chapter" ? 1_200 : 300
      const markdown = prose(document.title, minimum + 100)
      const committed = commitStoryDocument({
        manifest,
        documentId: document.id,
        editorSessionId: "ses-story-editor",
        taskSessionId: `ses-writer-${document.ordinal}`,
        leaseId: prepared.record.lease!.id,
        markdown,
        now: 200 + document.ordinal,
      })
      manifest = committed.manifest
      committedContents[document.id] = committed.markdown
    }

    const finished = finishStoryText({ manifest, editorSessionId: "ses-story-editor", now: 500 })
    expect(finished.status).toBe("text_completed")
    expect(finished.documents.every((document) => document.status === "committed")).toBe(true)
  })

  test("replays an unfinished lease across messages in the same editor session and rejects another session", () => {
    const manifest = registered()
    const document = manifest.documents[0]!
    const first = prepareStoryDocument({
      manifest,
      documentId: document.id,
      editorSessionId: "ses-story-editor",
      editorMessageId: "msg-before-provider-failure",
      committedContents: {},
      protagonistMarkdown: characterMarkdown,
      now: 100,
    })

    const resumed = prepareStoryDocument({
      manifest: first.manifest,
      documentId: document.id,
      editorSessionId: "ses-story-editor",
      editorMessageId: "msg-after-provider-failure",
      committedContents: {},
      protagonistMarkdown: characterMarkdown,
      now: 200,
    })

    expect(resumed.replayed).toBe(true)
    expect(resumed.record.lease?.id).toBe(first.record.lease?.id)
    expect(resumed.record.lease?.ownerMessageId).toBe("msg-before-provider-failure")
    expect(() =>
      prepareStoryDocument({
        manifest: first.manifest,
        documentId: document.id,
        editorSessionId: "ses-different-editor",
        editorMessageId: "msg-other",
        committedContents: {},
        protagonistMarkdown: characterMarkdown,
        now: 300,
      }),
    ).toThrow("NOVELX_STORY_EDITOR_SESSION_INVALID")
  })

  test("fails when the frozen protagonist dossier is missing or changed", () => {
    const manifest = registered()
    const document = manifest.documents[0]!
    expect(() =>
      prepareStoryDocument({
        manifest,
        documentId: document.id,
        editorSessionId: "ses-story-editor",
        editorMessageId: "msg-character-missing",
        committedContents: {},
        now: 100,
      }),
    ).toThrow("NOVELX_STORY_CHARACTER_SOURCE_DRIFT")
    expect(() =>
      prepareStoryDocument({
        manifest,
        documentId: document.id,
        editorSessionId: "ses-story-editor",
        editorMessageId: "msg-character-changed",
        committedContents: {},
        protagonistMarkdown: `${characterMarkdown}\nchanged`,
        now: 100,
      }),
    ).toThrow("NOVELX_STORY_CHARACTER_SOURCE_DRIFT")
  })

  test("decodes and verifies a completed legacy v1 Story without mutation", () => {
    let current = registered()
    const committedContents: Record<string, string> = {}
    for (const document of current.documents) {
      const prepared = prepareStoryDocument({
        manifest: current,
        documentId: document.id,
        editorSessionId: "ses-story-editor",
        editorMessageId: `msg-legacy-${document.ordinal}`,
        committedContents,
        protagonistMarkdown: characterMarkdown,
        now: 100 + document.ordinal,
      })
      current = prepared.manifest
      const minimum = document.kind === "novel_chapter" ? 1_500 : document.kind === "history_chapter" ? 1_200 : 300
      const committed = commitStoryDocument({
        manifest: current,
        documentId: document.id,
        editorSessionId: "ses-story-editor",
        taskSessionId: `ses-legacy-${document.ordinal}`,
        leaseId: prepared.record.lease!.id,
        markdown: prose(document.title, minimum + 100),
        now: 200 + document.ordinal,
      })
      current = committed.manifest
      committedContents[document.id] = committed.markdown
    }
    const completed = finishStoryText({ manifest: current, editorSessionId: "ses-story-editor", now: 500 })
    const { protagonist: _, protagonistRead: __, integritySha256: ___, ...common } = completed
    const legacyDraft = {
      ...common,
      schemaVersion: 1 as const,
      preparedContextSha256: worldSha256({ world: completed.world }),
    }
    const legacy = { ...legacyDraft, integritySha256: worldSha256(legacyDraft) }
    const decoded = Schema.decodeUnknownSync(NovelXStory.Materialization)(JSON.parse(JSON.stringify(legacy)))
    expect(verifyStoryMaterialization(decoded)).toEqual(legacy)
    expect(decoded.schemaVersion).toBe(1)
  })
})
