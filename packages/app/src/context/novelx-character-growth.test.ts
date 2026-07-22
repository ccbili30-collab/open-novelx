import { describe, expect, test } from "bun:test"
import { parseNovelXCharacterMaterialization, parseNovelXCharacterPortrait } from "./novelx-character-growth"

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function fixtures() {
  const sourceSha = "a".repeat(64)
  const characterDraft = {
    schemaVersion: 1 as const,
    stage: "character_materialization" as const,
    status: "text_completed" as const,
    world: {
      title: "灰潮大陆",
      materializationIntegritySha256: "b".repeat(64),
      sources: [{ entityId: "world-north", title: "霜脊山口", path: "World/霜脊山口.md", sha256: sourceSha }],
    },
    editorSessionId: "ses-character",
    preparedContextSha256: "c".repeat(64),
    sourceReads: [{ entityId: "world-north", sourceSha256: sourceSha, readAt: 2 }],
    registrationSha256: "d".repeat(64),
    protagonist: {
      id: "nx-protagonist",
      role: "protagonist" as const,
      name: "弥娅·雪痕",
      aliases: ["小雪鸦"],
      identity: "为霜口商队辨认旧路与关印的年轻向导。",
      originSourceEntityIds: ["world-north"],
      affiliationSourceEntityIds: [],
      appearance: "黑发末梢被风雪漂成灰白，穿补过三次的旧驼绒斗篷。",
      personalityContradiction: "习惯替陌生人承担危险，却把自己的求助视作软弱。",
      desire: "让被雪路吞没的同行者重新拥有姓名。",
      fear: "害怕旧账册证明父亲主动出卖了同行。",
      wound: "幼年误判雪崩征兆，使迁徙队偏离旧道。",
      voice: "说话短促，先报风向与距离；真正动怒时反而礼貌。",
      capabilities: ["辨认雪层与旧路"],
      limitations: ["左手冻伤会在严寒中失去握力"],
      initialRelationships: ["欠霜口商队一笔必须以带路偿还的旧债。"],
      openingState: "受雇带一支临时商队赶在封关钟前越过北侧旧道。",
      visualBrief: "旧驼绒斗篷、黄铜关印、冻伤左手与灰白发梢构成稳定识别点。",
    },
    document: {
      id: "character-document",
      title: "弥娅·雪痕",
      protagonistId: "nx-protagonist",
      sourceEntityIds: ["world-north"],
      sourceSha256s: [sourceSha],
      targetPath: "Characters/弥娅·雪痕.md",
      draftPath: ".novelx/growth/character-drafts/nx-protagonist.md",
      status: "committed" as const,
      lease: null,
      taskSessionId: "ses-writer",
      committedSha256: "e".repeat(64),
      updatedAt: 3,
      errorCode: null,
    },
    createdAt: 1,
    updatedAt: 3,
  }
  const character = { ...characterDraft, integritySha256: await digest(characterDraft) }
  const visualLanguage = "低饱和寒地中世纪写实绘画，材质可信，光线克制。"
  const portraitDraft = {
    schemaVersion: 1 as const,
    stage: "character_portrait" as const,
    status: "ready" as const,
    characterMaterializationIntegritySha256: character.integritySha256,
    editorSessionId: "ses-visual",
    visualLanguage,
    visualLanguageSha256: await digest(visualLanguage),
    task: {
      id: "portrait-task",
      type: "individual" as const,
      subtype: "canonical_portrait" as const,
      ownerId: "nx-protagonist",
      title: "弥娅·雪痕",
      aspect: "portrait" as const,
      composition: { ratio: "2:3" as const, faceView: "three_quarter" as const, crop: "upper_two_thirds" as const },
      status: "attached" as const,
      prompt: "四分之三视角的寒地向导单人竖幅立绘，不含文字与界面。",
      sourceDocumentId: "character-document",
      sourceDocumentSha256: "e".repeat(64),
      sourceEntityIds: ["world-north"],
      sourceSha256s: [sourceSha],
      targetPath: "Characters/Media/portraits/nx-protagonist.png",
      attempts: 1,
      mime: "image/png" as const,
      assetSha256: "f".repeat(64),
      model: "openai-compatible/gpt-image-2",
      startedAt: 4,
      completedAt: 5,
      errorCode: null,
    },
    createdAt: 4,
    updatedAt: 5,
  }
  const portrait = { ...portraitDraft, integritySha256: await digest(portraitDraft) }
  return { character, portrait }
}

describe("NovelX Character Growth UI projection", () => {
  test("accepts matching integrity-bound Character and portrait manifests", async () => {
    const { character, portrait } = await fixtures()
    expect((await parseNovelXCharacterMaterialization(JSON.stringify(character))).protagonist?.name).toBe("弥娅·雪痕")
    expect((await parseNovelXCharacterPortrait(JSON.stringify(portrait), character.integritySha256)).task.status).toBe(
      "attached",
    )
  })

  test("rejects a stale portrait and a tampered Character manifest", async () => {
    const { character, portrait } = await fixtures()
    await expect(parseNovelXCharacterPortrait(JSON.stringify(portrait), "0".repeat(64))).rejects.toThrow(
      "角色立绘与当前角色档案不匹配",
    )
    await expect(
      parseNovelXCharacterMaterialization(JSON.stringify({ ...character, updatedAt: character.updatedAt + 1 })),
    ).rejects.toThrow("角色生长状态完整性校验失败")
  })
})

