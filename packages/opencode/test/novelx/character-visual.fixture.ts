import {
  commitCharacterDocument,
  createCharacterMaterialization,
  finishCharacterText,
  prepareCharacterDocument,
  recordCharacterSourceReads,
  registerCharacter,
} from "../../src/novelx/character-materialization"
import { worldSha256 } from "../../src/novelx/world-blueprint"

const worldMarkdown = `# 霜脊山系\n\n${"终年积雪的山口限制商队通行，旧关印和驼绒衣物是边地生活的一部分。".repeat(20)}\n`
const world = {
  title: "灰潮大陆",
  materializationIntegritySha256: "a".repeat(64),
  sources: [
    {
      entityId: "world-north",
      title: "霜脊山系",
      path: "World/01-自然/霜脊山系.md",
      sha256: worldSha256(worldMarkdown),
    },
  ],
}

export function completedCharacterFixture() {
  const editorSessionId = "ses-character-editor"
  const planning = createCharacterMaterialization({ world, editorSessionId, now: 10 })
  const read = recordCharacterSourceReads({
    manifest: planning,
    editorSessionId,
    sourceEntityIds: ["world-north"],
    now: 20,
  })
  const registered = registerCharacter({
    manifest: read,
    editorSessionId,
    profile: {
      contextSha256: read.preparedContextSha256,
      name: "弥娅·雪痕",
      aliases: ["小雪鸦"],
      identity: "为霜口商队辨认旧路与关印的年轻向导。",
      originSourceEntityIds: ["world-north"],
      affiliationSourceEntityIds: [],
      appearance: "黑发末梢被风雪漂成灰白，穿补过三次的旧驼绒斗篷，左手有明显冻伤。",
      personalityContradiction: "习惯替陌生人承担危险，却把自己的求助视作软弱。",
      desire: "让被雪路吞没的同行者重新拥有姓名。",
      fear: "害怕旧账册证明父亲主动出卖了同行。",
      wound: "幼年误判雪崩征兆，使迁徙队偏离旧道。",
      voice: "说话短促，先报风向与距离；真正动怒时反而礼貌。",
      capabilities: ["辨认雪层与旧路", "记忆商队旗语"],
      limitations: ["不擅长正面战斗", "左手冻伤会在严寒中失去握力"],
      initialRelationships: ["欠霜口商队一笔必须以带路偿还的旧债。"],
      openingState: "受雇带一支临时商队赶在封关钟前越过北侧旧道。",
      visualBrief: "寒地边境向导；旧驼绒斗篷、黄铜关印、冻伤左手与灰白发梢构成稳定识别点。",
    },
    now: 30,
  }).manifest
  const prepared = prepareCharacterDocument({
    manifest: registered,
    editorSessionId,
    editorMessageId: "msg-character",
    worldContents: { "world-north": worldMarkdown },
    now: 40,
  })
  const dossier = `# 弥娅·雪痕\n\n霜脊山系塑造了她的衣着和谋生方式。\n\n${"她用黄铜关印压住斗篷领口，灰白发梢贴在冻红的脸侧，左手始终避开最冷的风。".repeat(45)}\n`
  const committed = commitCharacterDocument({
    manifest: prepared.manifest,
    editorSessionId,
    writerSessionId: "ses-character-writer",
    leaseId: prepared.record.lease!.id,
    markdown: dossier,
    now: 50,
  })
  return {
    manifest: finishCharacterText({ manifest: committed.manifest, editorSessionId, now: 60 }),
    dossier: committed.markdown,
    worldContents: { "world-north": worldMarkdown },
  }
}

