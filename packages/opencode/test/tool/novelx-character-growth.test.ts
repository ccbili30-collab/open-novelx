import { afterEach, describe, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Exit } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { SessionCompaction } from "@/session/compaction"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { Truncate } from "@/tool/truncate"
import { NovelXPrepareCharacterTool } from "@/tool/novelx-prepare-character"
import { NovelXReadCharacterWorldTool } from "@/tool/novelx-read-character-world"
import { NovelXRegisterCharacterTool } from "@/tool/novelx-register-character"
import { NovelXPrepareCharacterDocumentTool } from "@/tool/novelx-prepare-character-document"
import { NovelXCommitCharacterDocumentTool } from "@/tool/novelx-commit-character-document"
import { NovelXFinishCharacterTool } from "@/tool/novelx-finish-character"
import { NovelXRouteGrowthTool } from "@/tool/novelx-route-growth"
import { NovelXPrepareStoryTool } from "@/tool/novelx-prepare-story"
import { NovelXReadStoryWorldTool } from "@/tool/novelx-read-story-world"
import { NovelXReadStoryCharacterTool } from "@/tool/novelx-read-story-character"
import { NovelXRegisterStoryTool } from "@/tool/novelx-register-story"
import { NovelXPrepareStoryDocumentTool } from "@/tool/novelx-prepare-story-document"
import { ToolRegistry } from "@/tool/registry"
import { createCharacterMaterialization } from "@/novelx/character-materialization"
import {
  commitStoryDocument,
  createStoryMaterialization,
  finishStoryText,
  prepareStoryDocument,
  recordStoryCharacterRead,
  recordStorySourceReads,
  registerStory,
} from "@/novelx/story-materialization"
import { compileWorldBlueprint, worldSha256 } from "@/novelx/world-blueprint"
import {
  checkpointGrowthMemory,
  commitWorldDocument,
  createWorldMaterialization,
  finishWorld,
  finishWorldStage,
  prepareWorldDocument,
  prepareWorldStage,
  registerWorldStage,
} from "@/novelx/world-materialization"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const layer = LayerNode.compile(
  LayerNode.group([
    Agent.node,
    BackgroundJob.node,
    Config.node,
    CrossSpawnSpawner.node,
    Database.node,
    EventV2Bridge.node,
    FSUtil.node,
    Ripgrep.node,
    RuntimeFlags.node,
    Session.node,
    SessionCompaction.node,
    SessionProjector.node,
    SessionRunState.node,
    SessionStatus.node,
    ToolRegistry.node,
    Truncate.node,
  ]),
)
const it = testEffect(layer)
const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

afterEach(async () => {
  await disposeAllInstances()
})

describe("NovelX Character Growth tools", () => {
  it.instance(
    "materializes exactly one source-bound protagonist through an owned writer child",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const world = yield* Effect.promise(() => seedFrozenWorld(test.directory))
        const sessions = yield* Session.Service
        const root = yield* sessions.create({ title: "Growth", agent: "growth" })
        const rootAssistant = yield* assistantMessage(sessions, root.id, "growth")
        const rootContext = context(root.id, rootAssistant.id, "growth", "call-route")
        const route = yield* (yield* NovelXRouteGrowthTool).init()
        const initialRoute = yield* route.execute({}, rootContext)
        expect(initialRoute.metadata).toMatchObject({
          route: "character_required",
          nextAgent: "novelx-character-editor",
        })
        const prematureStoryEditor = yield* sessions.create({
          parentID: root.id,
          title: "故事：越权提前开始",
          agent: "novelx-story-editor",
        })
        const prematureAssistant = yield* assistantMessage(sessions, prematureStoryEditor.id, "novelx-story-editor")
        const prepareStory = yield* (yield* NovelXPrepareStoryTool).init()
        const prematureStory = yield* prepareStory
          .execute(
            {},
            context(prematureStoryEditor.id, prematureAssistant.id, "novelx-story-editor", "call-premature-story"),
          )
          .pipe(Effect.exit)
        expect(Exit.isFailure(prematureStory)).toBe(true)
        const editor = yield* sessions.create({
          parentID: root.id,
          title: "角色：唯一主角",
          agent: "novelx-character-editor",
        })
        const editorAssistant = yield* assistantMessage(sessions, editor.id, "novelx-character-editor")
        const editorContext = context(editor.id, editorAssistant.id, "novelx-character-editor", "call-character")

        const prepare = yield* (yield* NovelXPrepareCharacterTool).init()
        const prepared = yield* prepare.execute({}, editorContext)
        expect(prepared.metadata.sourceCount).toBe(1)
        const resumeRoute = yield* route.execute({}, { ...rootContext, callID: "call-route-resume" })
        expect(resumeRoute.metadata).toMatchObject({ route: "character_resume", nextAgent: "novelx-character-editor" })

        const read = yield* (yield* NovelXReadCharacterWorldTool).init()
        const readResult = yield* read.execute(
          { entityIds: [world.entityId] },
          { ...editorContext, callID: "call-character-read" },
        )
        expect(readResult.metadata.totalRead).toBe(1)

        const register = yield* (yield* NovelXRegisterCharacterTool).init()
        const registered = yield* register.execute(
          {
            contextSha256: prepared.metadata.contextSha256,
            name: "弥娅·雪痕",
            aliases: ["小雪鸦"],
            identity: "为霜口商队辨认旧路与关印的年轻向导。",
            originSourceEntityIds: [world.entityId],
            affiliationSourceEntityIds: [world.entityId],
            appearance: "黑发有灰白发梢，左手戴着缺两节指套的旧手套，斗篷缝有褪色商队标记。",
            personalityContradiction: "习惯替陌生人承担危险，却把自己的求助视作软弱。",
            desire: "带失踪商队留下的账册穿过封关山口，让被吞没的人重新拥有姓名。",
            fear: "害怕账册最终证明父亲不是遇难者，而是主动出卖了同行。",
            wound: "幼年一次错误的雪崩预警使迁徙队偏离旧道，她始终认为死者由自己造成。",
            voice: "说话短促，先报风向与距离；真正动怒时反而改用完整而礼貌的句子。",
            capabilities: ["辨认雪层与旧路", "伪造低阶关印"],
            limitations: ["不擅长正面战斗", "左手冻伤会在严寒中失去握力"],
            initialRelationships: ["欠霜口商队一笔无法公开的旧债。"],
            openingState: "故事开始时，她受雇带一支临时商队赶在封关钟前越过北侧旧道。",
            visualBrief: "寒地边境向导，以旧驼绒斗篷、黄铜关印与灰白发梢作为稳定识别点。",
          },
          { ...editorContext, callID: "call-character-register" },
        )
        expect(registered.metadata.targetPath).toBe("Characters/弥娅·雪痕.md")

        const prepareDocument = yield* (yield* NovelXPrepareCharacterDocumentTool).init()
        const document = yield* prepareDocument.execute({}, { ...editorContext, callID: "call-character-document" })
        expect(document.metadata.contextPackPath).toContain("character-context")

        const wrongChild = yield* sessions.create({
          parentID: editor.id,
          title: "错误叶节点",
          agent: "novelx-story-writer",
        })
        yield* assistantMessage(sessions, wrongChild.id, "novelx-story-writer", characterDossier())
        const commit = yield* (yield* NovelXCommitCharacterDocumentTool).init()
        const wrongCommit = yield* commit
          .execute(
            { leaseId: document.metadata.leaseId, taskSessionId: wrongChild.id },
            { ...editorContext, callID: "call-character-wrong-commit" },
          )
          .pipe(Effect.exit)
        expect(Exit.isFailure(wrongCommit)).toBe(true)

        const writer = yield* sessions.create({
          parentID: editor.id,
          title: "角色：弥娅·雪痕",
          agent: "novelx-character-writer",
        })
        yield* assistantMessage(sessions, writer.id, "novelx-character-writer", characterDossier())
        const committed = yield* commit.execute(
          { leaseId: document.metadata.leaseId, taskSessionId: writer.id },
          { ...editorContext, callID: "call-character-commit" },
        )
        expect(committed.metadata.sha256).toHaveLength(64)

        const finish = yield* (yield* NovelXFinishCharacterTool).init()
        const finished = yield* finish.execute({}, { ...editorContext, callID: "call-character-finish" })
        expect(finished.output).toContain("CHARACTER ")
        expect(finished.metadata.protagonistId).toBe(registered.metadata.protagonistId)
        const storyRoute = yield* route.execute({}, { ...rootContext, callID: "call-route-story" })
        expect(storyRoute.metadata).toMatchObject({ route: "story_required", nextAgent: "novelx-story-editor" })

        const manifest = JSON.parse(
          yield* Effect.promise(() =>
            fs.readFile(path.join(test.directory, ".novelx", "growth", "character-materialization.json"), "utf8"),
          ),
        )
        const dossier = yield* Effect.promise(() =>
          fs.readFile(path.join(test.directory, "Characters", "弥娅·雪痕.md"), "utf8"),
        )
        expect(manifest).toMatchObject({ status: "text_completed", schemaVersion: 1 })
        expect(manifest.document).toMatchObject({ status: "committed", taskSessionId: writer.id })
        expect(dossier.startsWith("# 弥娅·雪痕\n")).toBe(true)

        const mismatched = createCharacterMaterialization({
          world: {
            ...manifest.world,
            materializationIntegritySha256: "f".repeat(64),
          },
          editorSessionId: editor.id,
          now: Date.now(),
        })
        yield* Effect.promise(() =>
          fs.writeFile(
            path.join(test.directory, ".novelx", "growth", "character-materialization.json"),
            JSON.stringify(mismatched, null, 2) + "\n",
          ),
        )
        const drift = yield* route.execute({}, { ...rootContext, callID: "call-route-drift" }).pipe(Effect.exit)
        expect(Exit.isFailure(drift)).toBe(true)

        yield* Effect.promise(() =>
          fs.writeFile(
            path.join(test.directory, ".novelx", "growth", "character-materialization.json"),
            JSON.stringify(manifest, null, 2) + "\n",
          ),
        )
        const storyEditor = yield* sessions.create({
          parentID: root.id,
          title: "故事：历史、文献与小说",
          agent: "novelx-story-editor",
        })
        const storyAssistant = yield* assistantMessage(sessions, storyEditor.id, "novelx-story-editor")
        const storyContext = context(storyEditor.id, storyAssistant.id, "novelx-story-editor", "call-story")
        const storyPrepared = yield* prepareStory.execute({}, storyContext)
        expect(storyPrepared.output).toContain("弥娅·雪痕")

        const readStoryWorld = yield* (yield* NovelXReadStoryWorldTool).init()
        yield* readStoryWorld.execute({ entityIds: [world.entityId] }, { ...storyContext, callID: "call-story-world" })
        const readStoryCharacter = yield* (yield* NovelXReadStoryCharacterTool).init()
        const storyCharacter = yield* readStoryCharacter.execute(
          {},
          { ...storyContext, callID: "call-story-character" },
        )
        expect(storyCharacter.metadata.sha256).toBe(committed.metadata.sha256)

        const registerStoryTool = yield* (yield* NovelXRegisterStoryTool).init()
        const storyRegistered = yield* registerStoryTool.execute(
          storyProfile(storyPrepared.metadata.contextSha256, world.entityId),
          { ...storyContext, callID: "call-story-register" },
        )
        const firstStoryDocument = storyRegistered.metadata.documents > 0
        expect(firstStoryDocument).toBe(true)
        const storyManifest = JSON.parse(
          yield* Effect.promise(() =>
            fs.readFile(path.join(test.directory, ".novelx", "growth", "story-materialization.json"), "utf8"),
          ),
        )
        expect(storyManifest).toMatchObject({
          schemaVersion: 2,
          protagonist: { id: registered.metadata.protagonistId, sha256: committed.metadata.sha256 },
        })

        const prepareStoryDocumentTool = yield* (yield* NovelXPrepareStoryDocumentTool).init()
        const firstDocument = yield* prepareStoryDocumentTool.execute(
          { documentId: storyManifest.documents[0].id },
          { ...storyContext, callID: "call-story-document" },
        )
        const contextPack = JSON.parse(
          yield* Effect.promise(() =>
            fs.readFile(path.join(test.directory, ...firstDocument.metadata.contextPackPath.split("/")), "utf8"),
          ),
        )
        expect(contextPack.context.protagonist).toMatchObject({
          id: registered.metadata.protagonistId,
          markdown: dossier,
        })
        const replayedStoryDocument = yield* prepareStoryDocumentTool.execute(
          { documentId: storyManifest.documents[0].id },
          { ...storyContext, callID: "call-story-document-replay" },
        )
        expect(replayedStoryDocument.metadata.replayed).toBe(true)
        expect(replayedStoryDocument.metadata.contextPackPath).toBe(firstDocument.metadata.contextPackPath)
        yield* Effect.promise(() =>
          fs.writeFile(path.join(test.directory, "Characters", "弥娅·雪痕.md"), `${dossier}\n被篡改的内容`),
        )
        const driftedStorySource = yield* prepareStoryDocumentTool
          .execute(
            { documentId: storyManifest.documents[0].id },
            { ...storyContext, callID: "call-story-document-drift" },
          )
          .pipe(Effect.exit)
        expect(Exit.isFailure(driftedStorySource)).toBe(true)
      }),
    { timeout: 30_000 },
  )

  it.instance("keeps a completed legacy Story v1 terminal without retroactively creating Character Growth", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const world = yield* Effect.promise(() => seedFrozenWorld(test.directory))
      const legacy = completedLegacyStory(world)
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(test.directory, ".novelx", "growth", "story-materialization.json"),
          JSON.stringify(legacy, null, 2) + "\n",
        ),
      )
      const sessions = yield* Session.Service
      const root = yield* sessions.create({ title: "Legacy Growth", agent: "growth" })
      const assistant = yield* assistantMessage(sessions, root.id, "growth")
      const route = yield* (yield* NovelXRouteGrowthTool).init()
      const result = yield* route.execute({}, context(root.id, assistant.id, "growth", "call-legacy-route"))
      expect(result.metadata).toMatchObject({ route: "complete", nextAgent: null })
      const characterExists = yield* Effect.promise(() =>
        fs
          .access(path.join(test.directory, ".novelx", "growth", "character-materialization.json"))
          .then(() => true)
          .catch(() => false),
      )
      expect(characterExists).toBe(false)
    }),
  )
})

async function seedFrozenWorld(directory: string) {
  const growthSessionId = "ses-growth-fixture"
  const editorSessionId = "ses-stage-fixture"
  const blueprint = compileWorldBlueprint({
    profile: {
      title: "灰潮大陆",
      genre: { family: "fantasy", label: "寒地中世纪幻想", scale: "大陆北境" },
      designSummary: "以山口、河谷、严寒和关隘制度约束人物能够采取的行动。",
      stages: [
        {
          label: "北境自然与关隘",
          purpose: "建立角色必须遵守的气候、道路、资源和权力边界。",
          itemCount: 1,
          dependsOnStageIndices: [],
          reasoningFocus: ["长冬如何限制迁徙与贸易", "山口如何形成关印制度"],
          documentSections: ["地貌与气候", "道路与资源", "关隘秩序"],
        },
      ],
    },
    source: { sessionId: growthSessionId, messageId: "msg-growth", toolCallId: "call-blueprint", registeredAt: 1 },
  })
  let manifest = createWorldMaterialization({ blueprint, growthSessionId, now: 2 })
  const stageId = blueprint.stages[0]!.id
  const prepared = prepareWorldStage({
    manifest,
    blueprint,
    stageId,
    ownerSessionId: editorSessionId,
    ownerParentSessionId: growthSessionId,
    now: 3,
  })
  manifest = prepared.manifest
  const registered = registerWorldStage({
    manifest,
    blueprint,
    ownerSessionId: editorSessionId,
    profile: {
      stageId,
      contextSha256: prepared.contextSha256,
      entities: [
        {
          name: "霜脊山口",
          typeLabel: "寒地山口与关隘聚落",
          summary: "连接北侧雪原与三岔河谷的季节通道，严寒、雪崩与关印共同限制人员流动。",
          facts: [
            { label: "长冬", detail: "封雪期持续数月，只有少数旧路能在风向稳定时通行。" },
            { label: "关印", detail: "商队必须持双印通关，遗失一枚就会被扣留查验。" },
          ],
          constraints: ["任何穿越山口的行动都受天气窗口、补给和关印三重限制。"],
          upstreamBindings: [],
        },
      ],
      relations: [],
    },
    now: 4,
  })
  manifest = registered.manifest
  const entityId = registered.stage.entities[0]!.id
  const leased = prepareWorldDocument({
    manifest,
    blueprint,
    entityId,
    ownerSessionId: editorSessionId,
    ownerMessageId: "msg-stage",
    committedDocuments: {},
    now: 5,
  })
  manifest = leased.manifest
  const paragraph =
    "霜脊山口在长冬里只剩几条能够辨认的旧路。积雪、风向和雪崩共同决定通行窗口，关隘则以双印制度控制商队、粮食和役夫。任何赶路者都必须在补给、时间与身份暴露之间做出选择。"
  const draft = `# 霜脊山口\n\n## 事实依据\n\n${paragraph.repeat(2)}\n\n## 因果推演\n\n${paragraph.repeat(2)}\n\n## 地貌与气候\n\n${paragraph.repeat(2)}\n\n## 道路与资源\n\n${paragraph.repeat(2)}\n\n## 关隘秩序\n\n${paragraph.repeat(2)}\n`
  const committed = commitWorldDocument({
    manifest,
    blueprint,
    entityId,
    ownerSessionId: editorSessionId,
    taskSessionId: "ses-world-writer-fixture",
    draft,
    now: 6,
  })
  manifest = committed.manifest
  const sealed = finishWorldStage({
    manifest,
    blueprint,
    stageId,
    ownerSessionId: editorSessionId,
    navigationSummary: `霜脊山口（${entityId}）封存了长冬、旧路、补给与双印关隘的共同约束。`,
    now: 7,
  })
  manifest = sealed.manifest
  manifest = checkpointGrowthMemory({
    manifest,
    blueprint,
    stageId,
    ownerSessionId: growthSessionId,
    compactionMessageId: "msg-compaction-fixture",
    now: 8,
  }).manifest
  manifest = finishWorld({ manifest, blueprint, ownerSessionId: growthSessionId, now: 9 })

  await fs.mkdir(path.join(directory, ".novelx", "growth"), { recursive: true })
  await fs.mkdir(path.dirname(path.join(directory, ...committed.record.targetPath.split("/"))), { recursive: true })
  await fs.writeFile(
    path.join(directory, ".novelx", "growth", "world-blueprint.json"),
    JSON.stringify(blueprint, null, 2) + "\n",
  )
  await fs.writeFile(
    path.join(directory, ".novelx", "growth", "world-materialization.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  )
  await fs.writeFile(path.join(directory, ...committed.record.targetPath.split("/")), committed.draft)
  return {
    title: blueprint.profile.title,
    entityId,
    materializationIntegritySha256: manifest.integritySha256,
    source: {
      entityId,
      title: registered.stage.entities[0]!.name,
      path: committed.record.targetPath,
      sha256: committed.record.committedSha256!,
    },
  }
}

function completedLegacyStory(world: Awaited<ReturnType<typeof seedFrozenWorld>>) {
  const editorSessionId = "ses-legacy-story-editor"
  const characterMarkdown = `# 旧版主角\n\n${"旧版故事测试角色只用于证明已完成的 Story v1 不会被倒灌新角色。".repeat(60)}\n`
  const protagonist = {
    id: "nx-legacy-protagonist",
    name: "旧版主角",
    path: "Characters/旧版主角.md",
    sha256: worldSha256(characterMarkdown),
    characterIntegritySha256: "c".repeat(64),
  }
  const protagonistContinuity = {
    id: protagonist.id,
    name: protagonist.name,
    openingState: "临时商队困在雪线下，封关钟响前必须越过北侧旧道。",
    wound: "她曾误判雪崩征兆，使同行者失踪，因此不肯再次放弃受困的商队。",
    initialRelationships: ["她欠霜口商队一笔必须以这次带路偿还的旧债。"],
  }
  const planning = createStoryMaterialization({
    world: {
      title: world.title,
      materializationIntegritySha256: world.materializationIntegritySha256,
      sources: [world.source],
    },
    protagonist,
    editorSessionId,
    now: 10,
  })
  const read = recordStorySourceReads({
    manifest: planning,
    editorSessionId,
    sourceEntityIds: [world.entityId],
    now: 11,
  })
  const characterRead = recordStoryCharacterRead({
    manifest: read,
    editorSessionId,
    protagonistId: protagonist.id,
    sourceSha256: protagonist.sha256,
    now: 11,
  })
  let manifest = registerStory({
    manifest: characterRead,
    editorSessionId,
    protagonistContinuity,
    profile: {
      contextSha256: characterRead.preparedContextSha256,
      historyBooks: [
        {
          title: "《霜脊关隘史》",
          author: "边境抄写会",
          summary: "记录霜脊关隘的封雪、商路、粮令与双印制度如何形成。",
          chapters: Array.from({ length: 3 }, (_, index) => ({
            title: `第${index + 1}章 关隘纪年`,
            brief: "以具名事件解释关隘制度、迁徙与商路秩序的变化。",
            sourceEntityIds: [world.entityId],
          })),
        },
      ],
      references: Array.from({ length: 2 }, (_, index) => ({
        title: `《霜口文书${index + 1}》`,
        kindLabel: "关隘文书",
        author: "无名记录者",
        summary: "保存封关期间粮食、通行与人员查验留下的具体文字证据。",
        sourceEntityIds: [world.entityId],
        historyReferences: [{ historyBookIndex: 0, chapterIndex: index }],
      })),
      novel: {
        title: "《雪线以北》",
        author: "NovelX",
        summary: "一支临时商队在风雪封关期间面对旧债、失踪者与边境冲突。",
        theme: { title: "风雪封关", summary: "六章组成一条连续且付出代价的边境故事。" },
        chapters: Array.from({ length: 6 }, (_, index) => ({
          title: `第${index + 1}章 风雪旧路`,
          brief:
            index === 0
              ? "临时商队在雪线下整队，必须赶在封关钟响之前踏上北侧旧道，并承担选择带来的后果。"
              : "推进封关期间连续发生的选择、冲突与后果。",
          sourceEntityIds: [world.entityId],
          historyReferences: [{ historyBookIndex: 0, chapterIndex: index % 3 }],
          documentIndices: [index % 2],
        })),
      },
    },
    now: 12,
  }).manifest
  const committedContents: Record<string, string> = {}
  for (const document of manifest.documents) {
    const prepared = prepareStoryDocument({
      manifest,
      documentId: document.id,
      editorSessionId,
      editorMessageId: `msg-legacy-${document.ordinal}`,
      committedContents,
      protagonistMarkdown: characterMarkdown,
      protagonistContinuity,
      now: 20 + document.ordinal,
    })
    manifest = prepared.manifest
    const minimum = document.kind === "novel_chapter" ? 1_600 : document.kind === "history_chapter" ? 1_300 : 400
    const sourceTitles = document.sourceEntityIds.map(
      (entityId) => manifest.world.sources.find((source) => source.entityId === entityId)!.title,
    )
    const openingAnchors =
      document.kind === "novel_chapter" && manifest.novel?.chapters[0] === document.id
        ? "临时商队在雪线下已经整队，封关钟响之前，他们必须踏上北侧旧道。"
        : ""
    const markdown = `# ${document.title}\n\n${sourceTitles.join("、")}。${openingAnchors}\n\n${"霜脊关隘的风雪、商路和双印制度共同约束人物选择。".repeat(Math.ceil(minimum / 24))}\n`
    const taskSessionId =
      document.kind === "novel_chapter" ? "ses-legacy-novel-writer" : `ses-legacy-writer-${document.ordinal}`
    const committed = commitStoryDocument({
      manifest,
      documentId: document.id,
      editorSessionId,
      taskSessionId,
      leaseId: prepared.record.lease!.id,
      markdown,
      protagonistContinuity,
      now: 40 + document.ordinal,
    })
    manifest = committed.manifest
    committedContents[document.id] = committed.markdown
  }
  const completed = finishStoryText({ manifest, editorSessionId, now: 100 })
  const { protagonist: _, protagonistRead: __, integritySha256: ___, ...common } = completed
  const legacyDraft = {
    ...common,
    schemaVersion: 1 as const,
    preparedContextSha256: worldSha256({ world: completed.world }),
  }
  return { ...legacyDraft, integritySha256: worldSha256(legacyDraft) }
}

function storyProfile(contextSha256: string, entityId: string) {
  return {
    contextSha256,
    historyBooks: [
      {
        title: "《霜脊关隘史》",
        author: "边境抄写会",
        summary: "记录霜脊关隘的封雪、商路、粮令与双印制度如何形成。",
        chapters: Array.from({ length: 3 }, (_, index) => ({
          title: `第${index + 1}章 关隘纪年`,
          brief: "以具名事件解释关隘制度、迁徙与商路秩序的变化。",
          sourceEntityIds: [entityId],
        })),
      },
    ],
    references: Array.from({ length: 2 }, (_, index) => ({
      title: `《霜口文书${index + 1}》`,
      kindLabel: "关隘文书",
      author: "无名记录者",
      summary: "保存封关期间粮食、通行与人员查验留下的具体文字证据。",
      sourceEntityIds: [entityId],
      historyReferences: [{ historyBookIndex: 0, chapterIndex: index }],
    })),
    novel: {
      title: "《雪线以北》",
      author: "NovelX",
      summary: "弥娅带着失踪商队的账册穿越封关线，在旧债和父亲的秘密之间作出选择。",
      theme: { title: "风雪封关", summary: "六章围绕弥娅的选择构成一条连续且付出代价的故事。" },
      chapters: Array.from({ length: 6 }, (_, index) => ({
        title: `第${index + 1}章 风雪旧路`,
        brief:
          index === 0
            ? "故事开始时，弥娅接下带路任务；她受雇带一支临时商队；必须赶在封关钟前越过北侧旧道。"
            : "让弥娅依据既有能力与限制推进封关期间连续发生的选择、冲突与后果。",
        sourceEntityIds: [entityId],
        historyReferences: [{ historyBookIndex: 0, chapterIndex: index % 3 }],
        documentIndices: [index % 2],
      })),
    },
  }
}

function context(sessionID: SessionID, messageID: MessageID, agent: string, callID: string) {
  return {
    sessionID,
    messageID,
    callID,
    agent,
    abort: new AbortController().signal,
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
}

function assistantMessage(sessions: Session.Interface, sessionID: SessionID, agent: string, text?: string) {
  return Effect.gen(function* () {
    const assistant: SessionV1.Assistant = {
      id: MessageID.ascending(),
      role: "assistant",
      parentID: MessageID.ascending(),
      sessionID,
      mode: agent,
      agent,
      cost: 0,
      path: { cwd: "/tmp", root: "/tmp" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: ref.modelID,
      providerID: ref.providerID,
      time: { created: Date.now() },
      finish: "stop",
    }
    yield* sessions.updateMessage(assistant)
    if (text) {
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: assistant.id,
        sessionID,
        type: "text",
        text,
      })
    }
    return assistant
  })
}

function characterDossier() {
  const paragraph =
    "弥娅先看风向，再看人。她会把商队停在背风石后，逐一核对关印上的磨痕，也会记住每个雇主避而不谈的名字。霜脊山口教会她，勇敢不是迎着暴雪前进，而是在补给、时间和身份暴露之间承认代价。她能辨认旧路和雪层，却不擅长正面战斗；冻伤的左手在严寒中会失去握力。她想把失踪者的账册送出封关线，又害怕其中记着父亲的背叛。这个矛盾只决定故事的起点，不替她决定最后会成为谁。"
  return `# 弥娅·雪痕\n\n## 身份与来处\n\n${paragraph.repeat(2)}\n\n## 外貌与习惯\n\n${paragraph.repeat(2)}\n\n## 欲望、恐惧与旧伤\n\n${paragraph.repeat(2)}\n\n## 能力与代价\n\n${paragraph.repeat(2)}\n\n## 初始关系与处境\n\n${paragraph.repeat(2)}\n`
}
