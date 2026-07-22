import { describe, expect, test } from "bun:test"
import {
  commitCharacterDocument,
  createCharacterMaterialization,
  finishCharacterText,
  prepareCharacterDocument,
  recordCharacterSourceReads,
  registerCharacter,
  verifyCharacterMaterialization,
} from "../../src/novelx/character-materialization"
import { worldSha256 } from "../../src/novelx/world-blueprint"

const SHA = (digit: string) => digit.repeat(64)

const sourceContents = {
  "world-north": "北境山脉原文",
  "world-river": "三岔河谷原文",
  "world-order": "双印关议会原文",
}

const world = {
  title: "灰潮大陆：自然约束下的世界生长",
  materializationIntegritySha256: SHA("a"),
  sources: [
    {
      entityId: "world-north",
      title: "霜脊山系",
      path: "World/01-自然/霜脊山系.md",
      sha256: worldSha256(sourceContents["world-north"]),
    },
    {
      entityId: "world-river",
      title: "三岔母河流域",
      path: "World/01-自然/三岔母河流域.md",
      sha256: worldSha256(sourceContents["world-river"]),
    },
    {
      entityId: "world-order",
      title: "霜口双印关议会",
      path: "World/03-权力/霜口双印关议会.md",
      sha256: worldSha256(sourceContents["world-order"]),
    },
  ],
}

const profile = {
  contextSha256: "",
  name: "弥娅·雪痕",
  aliases: ["小雪鸦"],
  identity: "为霜口商队辨认旧路与关印的年轻向导。",
  originSourceEntityIds: ["world-north", "world-river"],
  affiliationSourceEntityIds: ["world-order"],
  appearance: "黑发被风雪漂成灰白发梢，左手缺两节指套，常穿补过三次的旧驼绒斗篷。",
  personalityContradiction: "习惯替陌生人承担危险，却把自己的求助视作软弱。",
  desire: "带失踪商队留下的账册穿过封关山口，让被吞没的人重新拥有姓名。",
  fear: "她害怕账册证明父亲并非遇难者，而是主动出卖了同行。",
  wound: "幼年那场错误的雪崩预警使整支迁徙队偏离旧道，她一直认为死者由自己造成。",
  voice: "说话短促，先报风向与距离；真正动怒时反而改用完整而礼貌的句子。",
  capabilities: ["辨认雪层与旧路", "伪造低阶关印", "记忆商队旗语"],
  limitations: ["不擅长正面战斗", "左手冻伤会在严寒中失去握力", "对父亲相关线索容易误判"],
  initialRelationships: [
    "欠霜口双印关议会一笔无法公开的旧债。",
    "与三岔渡的摆渡人互相救过一次，却从未承认彼此是朋友。",
  ],
  openingState: "故事开始时，她受雇带一支临时商队赶在封关钟前越过北侧旧道。",
  visualBrief: "寒地边境向导；旧驼绒斗篷、磨损皮靴、黄铜关印与灰白发梢构成稳定识别点。",
}

const planning = () =>
  createCharacterMaterialization({
    world,
    editorSessionId: "ses-character-editor",
    now: 10,
  })

const registered = () => {
  const read = recordCharacterSourceReads({
    manifest: planning(),
    editorSessionId: "ses-character-editor",
    sourceEntityIds: world.sources.map((source) => source.entityId),
    now: 20,
  })
  return registerCharacter({
    manifest: read,
    editorSessionId: "ses-character-editor",
    profile: { ...profile, contextSha256: read.preparedContextSha256 },
    now: 30,
  }).manifest
}

const exactSourceTitles = world.sources.map((source) => source.title).join("、")
const dossier = `# ${profile.name}\n\n她的来路同时受${exactSourceTitles}约束。有些旧伤的因果仍无法确定，但这不是尚待填写的生产说明。\n\n${"她在风雪封关前检查每一枚关印，也记得每条旧路曾经吞没过谁。".repeat(45)}\n`

describe("NovelX character materialization", () => {
  test("creates a frozen world snapshot and registers exactly one stable protagonist after every source was read", () => {
    const initial = planning()
    expect(initial.status).toBe("planning")
    expect(initial.world.sources).toEqual(world.sources)

    const partial = recordCharacterSourceReads({
      manifest: initial,
      editorSessionId: "ses-character-editor",
      sourceEntityIds: ["world-north", "world-river"],
      now: 20,
    })
    expect(() =>
      registerCharacter({
        manifest: partial,
        editorSessionId: "ses-character-editor",
        profile: { ...profile, contextSha256: partial.preparedContextSha256 },
        now: 30,
      }),
    ).toThrow("NOVELX_CHARACTER_SOURCE_UNREAD")

    const first = registered()
    const second = registered()
    expect(first.status).toBe("writing")
    expect(first.protagonist?.id).toBe(second.protagonist?.id)
    expect(first.protagonist?.role).toBe("protagonist")
    expect(first.document?.targetPath).toBe(`Characters/${profile.name}.md`)
    expect(verifyCharacterMaterialization(first)).toEqual(first)
  })

  test("fails closed on stale context, unknown or duplicate source reads, and unsafe frozen paths", () => {
    expect(() =>
      recordCharacterSourceReads({
        manifest: planning(),
        editorSessionId: "ses-character-editor",
        sourceEntityIds: ["world-missing"],
        now: 20,
      }),
    ).toThrow("NOVELX_CHARACTER_SOURCE_UNKNOWN")
    expect(() =>
      recordCharacterSourceReads({
        manifest: planning(),
        editorSessionId: "ses-character-editor",
        sourceEntityIds: ["world-north", "world-north"],
        now: 20,
      }),
    ).toThrow("NOVELX_CHARACTER_VALUE_DUPLICATE")
    expect(() =>
      registerCharacter({
        manifest: recordCharacterSourceReads({
          manifest: planning(),
          editorSessionId: "ses-character-editor",
          sourceEntityIds: world.sources.map((source) => source.entityId),
          now: 20,
        }),
        editorSessionId: "ses-character-editor",
        profile: { ...profile, contextSha256: SHA("f") },
        now: 30,
      }),
    ).toThrow("NOVELX_CHARACTER_CONTEXT_STALE")
    expect(() =>
      createCharacterMaterialization({
        world: { ...world, sources: [{ ...world.sources[0]!, path: "../outside.md" }] },
        editorSessionId: "ses-character-editor",
        now: 10,
      }),
    ).toThrow("NOVELX_CHARACTER_TARGET_PATH_INVALID")
  })

  test("leases one dossier and returns the exact frozen originals selected by the registered profile", () => {
    const prepared = prepareCharacterDocument({
      manifest: registered(),
      editorSessionId: "ses-character-editor",
      editorMessageId: "msg-character",
      worldContents: sourceContents,
      now: 40,
    })

    expect(prepared.record.status).toBe("leased")
    expect(prepared.context.worldSources.map((source) => source.markdown)).toEqual(Object.values(sourceContents))
    expect(prepared.context.protagonist.name).toBe(profile.name)

    expect(() =>
      prepareCharacterDocument({
        manifest: registered(),
        editorSessionId: "ses-character-editor",
        editorMessageId: "msg-character",
        worldContents: { ...sourceContents, "world-north": "changed" },
        now: 40,
      }),
    ).toThrow("NOVELX_CHARACTER_SOURCE_DRIFT")
  })

  test("commits only the owned writer result, rejects leaks and replays identical content idempotently", () => {
    const prepared = prepareCharacterDocument({
      manifest: registered(),
      editorSessionId: "ses-character-editor",
      editorMessageId: "msg-character",
      worldContents: sourceContents,
      now: 40,
    })
    const leaseId = prepared.record.lease!.id

    expect(() =>
      commitCharacterDocument({
        manifest: prepared.manifest,
        editorSessionId: "ses-character-editor",
        writerSessionId: "ses-character-writer",
        leaseId,
        markdown: `# 错误标题\n\n${exactSourceTitles}。${"正文。".repeat(300)}`,
        now: 50,
      }),
    ).toThrow("NOVELX_CHARACTER_DOCUMENT_TITLE_INVALID")
    expect(() =>
      commitCharacterDocument({
        manifest: prepared.manifest,
        editorSessionId: "ses-character-editor",
        writerSessionId: "ses-character-writer",
        leaseId,
        markdown: `# ${profile.name}\n\n${exactSourceTitles}。阶段主编调用 Agent 后输出。${"正文。".repeat(300)}`,
        now: 50,
      }),
    ).toThrow("NOVELX_CHARACTER_DOCUMENT_INTERNAL_LEAK")
    expect(() =>
      commitCharacterDocument({
        manifest: prepared.manifest,
        editorSessionId: "ses-character-editor",
        writerSessionId: "ses-character-writer",
        leaseId,
        markdown: `# ${profile.name}\n\n${"她在风雪封关前检查每一枚关印。".repeat(80)}`,
        now: 50,
      }),
    ).toThrow("NOVELX_CHARACTER_SOURCE_TITLE_MISSING")
    expect(() =>
      commitCharacterDocument({
        manifest: prepared.manifest,
        editorSessionId: "ses-character-editor",
        writerSessionId: "ses-character-writer",
        leaseId,
        markdown: `# ${profile.name}\n\n${exactSourceTitles}。她沿三汊母河三条支流辨路。${"她在风雪封关前检查每一枚关印。".repeat(80)}`,
        now: 50,
      }),
    ).toThrow("NOVELX_CHARACTER_PROPER_NAME_DRIFT")

    const committed = commitCharacterDocument({
      manifest: prepared.manifest,
      editorSessionId: "ses-character-editor",
      writerSessionId: "ses-character-writer",
      leaseId,
      markdown: dossier,
      now: 50,
    })
    expect(committed.record.taskSessionId).toBe("ses-character-writer")

    const replay = commitCharacterDocument({
      manifest: committed.manifest,
      editorSessionId: "ses-character-editor",
      writerSessionId: "ses-character-writer",
      leaseId,
      markdown: dossier,
      now: 60,
    })
    expect(replay.replayed).toBe(true)
    expect(() =>
      commitCharacterDocument({
        manifest: committed.manifest,
        editorSessionId: "ses-character-editor",
        writerSessionId: "ses-character-writer",
        leaseId,
        markdown: `${dossier}\n不同内容`,
        now: 60,
      }),
    ).toThrow("NOVELX_CHARACTER_DOCUMENT_COMMIT_CONFLICT")
  })

  test("finishes only after the dossier is committed and detects persisted tampering", () => {
    expect(() =>
      finishCharacterText({ manifest: registered(), editorSessionId: "ses-character-editor", now: 50 }),
    ).toThrow("NOVELX_CHARACTER_TEXT_INCOMPLETE")

    const prepared = prepareCharacterDocument({
      manifest: registered(),
      editorSessionId: "ses-character-editor",
      editorMessageId: "msg-character",
      worldContents: sourceContents,
      now: 40,
    })
    const committed = commitCharacterDocument({
      manifest: prepared.manifest,
      editorSessionId: "ses-character-editor",
      writerSessionId: "ses-character-writer",
      leaseId: prepared.record.lease!.id,
      markdown: dossier,
      now: 50,
    })
    const finished = finishCharacterText({
      manifest: committed.manifest,
      editorSessionId: "ses-character-editor",
      now: 60,
    })
    expect(finished.status).toBe("text_completed")
    expect(() => verifyCharacterMaterialization({ ...finished, updatedAt: 61 })).toThrow(
      "NOVELX_CHARACTER_INTEGRITY_INVALID",
    )
  })
})
