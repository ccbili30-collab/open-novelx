import { describe, expect, test } from "bun:test"
import { NovelXWorld } from "@opencode-ai/schema"
import { compileWorldBlueprint, worldSha256 } from "../../src/novelx/world-blueprint"
import {
  abortWorldDocument,
  commitWorldDocument,
  createWorldMaterialization,
  finishWorld,
  prepareWorldDocument,
  prepareWorldStage,
  registerWorldStage,
  verifyWorldMaterialization,
} from "../../src/novelx/world-materialization"

const blueprint = compileWorldBlueprint({
  profile: {
    title: "环日共同体",
    genre: { family: "science fiction", label: "近未来轨道殖民", scale: "单恒星系" },
    designSummary: "先确定物理环境，再根据真实空间约束长出控制基础设施的组织。",
    stages: [
      {
        label: "轨道环境",
        purpose: "建立辐射、能源和交通窗口等物理事实。",
        itemCount: 1,
        dependsOnStageIndices: [],
        reasoningFocus: ["辐射怎样限制活动", "轨道怎样决定交通窗口"],
        documentSections: ["空间结构", "物理环境", "资源与通行", "风险与边界"],
      },
      {
        label: "企业与自治组织",
        purpose: "依据轨道基础设施和通信延迟建立实际控制关系。",
        itemCount: 1,
        dependsOnStageIndices: [0],
        reasoningFocus: ["权力来自哪些基础设施", "通信延迟怎样改变治理"],
        documentSections: ["组织结构", "运作机制", "资源与影响", "风险与边界"],
      },
    ],
  },
  source: { sessionId: "ses-growth", messageId: "msg-growth", toolCallId: "call-blueprint", registeredAt: 100 },
})

const dossier = (name: string, sections: readonly string[]) =>
  [
    `# ${name}`,
    ...sections.flatMap((section) => [
      "",
      `## ${section}`,
      "",
      `${section}基于已经注册的事实、约束和依赖档案进行说明。这里给出足够具体的结构、条件、作用和边界，不使用占位内容，也不提前生成角色、故事或图片。对反常结论必须指出已经注册的技术条件或物理原因，对常规结论则采用保守推演。`,
    ]),
    "",
    "本档案还会交叉核对能源、距离、时间、通信、材料和组织能力之间的关系，使后续层面能够引用明确事实，而不是只引用题材气氛。任何能力都有成本、范围和失效条件；任何组织影响都能追溯到已经提交的环境或基础设施。",
  ].join("\n") + "\n"

const firstStageProfile = (contextSha256: string): NovelXWorld.StageRegistrationProfile => ({
  stageId: blueprint.stages[0]!.id,
  contextSha256,
  entities: [
    {
      name: "赫利俄斯同步环",
      typeLabel: "恒星能量与通信轨道带",
      summary: "围绕恒星稳定运行的采能、转发和维护轨道集合，是整个系统的能源与时间基准。",
      facts: [
        { label: "轨道", detail: "主要节点保持在多组共振轨道上，以轮换方式避开高粒子流区域。" },
        { label: "能源", detail: "近星阵列提供高密度能源，但散热和材料疲劳限制持续输出。" },
        { label: "通信", detail: "中继阵列形成系统时间基准，遮挡窗口仍会造成分钟级断联。" },
      ],
      constraints: ["强辐射和散热上限使载人维护只能在有限窗口内进行。"],
      dependencyEntityIds: [],
    },
  ],
  relations: [],
})

describe("NovelX adaptive world materialization", () => {
  test("registers a free-form first stage and commits its formal dossier", () => {
    const initial = createWorldMaterialization({ blueprint, growthSessionId: "ses-growth", now: 200 })
    const preparedStage = prepareWorldStage({
      manifest: initial,
      blueprint,
      stageId: blueprint.stages[0]!.id,
      ownerSessionId: "ses-growth",
      committedDocuments: {},
      now: 201,
    })
    const registered = registerWorldStage({
      manifest: preparedStage.manifest,
      blueprint,
      profile: firstStageProfile(preparedStage.contextSha256),
      ownerSessionId: "ses-growth",
      now: 202,
    })
    expect(registered.stage.entities[0]?.name).toBe("赫利俄斯同步环")
    expect(registered.manifest.documents[0]?.targetPath).toBe("World/01-轨道环境/赫利俄斯同步环.md")
    const { integritySha256: _, ...missingDocumentDraft } = registered.manifest
    const missingDocument = {
      ...missingDocumentDraft,
      documents: [],
      integritySha256: worldSha256({ ...missingDocumentDraft, documents: [] }),
    }
    expect(() => verifyWorldMaterialization({ manifest: missingDocument, blueprint })).toThrow("exactly one document")
    expect(
      registerWorldStage({
        manifest: registered.manifest,
        blueprint,
        profile: firstStageProfile(preparedStage.contextSha256),
        ownerSessionId: "ses-growth",
        now: 203,
      }).replayed,
    ).toBe(true)
    const entity = registered.stage.entities[0]!
    const preparedDocument = prepareWorldDocument({
      manifest: registered.manifest,
      blueprint,
      entityId: entity.id,
      ownerSessionId: "ses-growth",
      ownerMessageId: "msg-document",
      committedDocuments: {},
      now: 203,
    })
    const committed = commitWorldDocument({
      manifest: preparedDocument.manifest,
      blueprint,
      entityId: entity.id,
      ownerSessionId: "ses-growth",
      taskSessionId: "ses-world-child",
      draft: dossier(entity.name, blueprint.stages[0]!.documentSections),
      now: 204,
    })
    expect(committed.manifest.stages[0]?.status).toBe("completed")
    expect(committed.record.status).toBe("committed")
    expect(verifyWorldMaterialization({ manifest: committed.manifest, blueprint })).toBe(committed.manifest)
  })

  test("requires actual committed dependency dossiers before registering a later layer", () => {
    const initial = createWorldMaterialization({ blueprint, growthSessionId: "ses-growth", now: 200 })
    expect(() =>
      prepareWorldStage({
        manifest: initial,
        blueprint,
        stageId: blueprint.stages[1]!.id,
        ownerSessionId: "ses-growth",
        committedDocuments: {},
        now: 201,
      }),
    ).toThrow("requires completed stage")

    const firstPrepared = prepareWorldStage({
      manifest: initial,
      blueprint,
      stageId: blueprint.stages[0]!.id,
      ownerSessionId: "ses-growth",
      committedDocuments: {},
      now: 202,
    })
    const firstRegistered = registerWorldStage({
      manifest: firstPrepared.manifest,
      blueprint,
      profile: firstStageProfile(firstPrepared.contextSha256),
      ownerSessionId: "ses-growth",
      now: 203,
    })
    const entity = firstRegistered.stage.entities[0]!
    const firstDocument = prepareWorldDocument({
      manifest: firstRegistered.manifest,
      blueprint,
      entityId: entity.id,
      ownerSessionId: "ses-growth",
      ownerMessageId: "msg-document",
      committedDocuments: {},
      now: 204,
    })
    const content = dossier(entity.name, blueprint.stages[0]!.documentSections)
    const firstCommitted = commitWorldDocument({
      manifest: firstDocument.manifest,
      blueprint,
      entityId: entity.id,
      ownerSessionId: "ses-growth",
      taskSessionId: "ses-child",
      draft: content,
      now: 205,
    })
    expect(() =>
      prepareWorldStage({
        manifest: firstCommitted.manifest,
        blueprint,
        stageId: blueprint.stages[1]!.id,
        ownerSessionId: "ses-growth",
        committedDocuments: { [entity.id]: `${content}tampered` },
        now: 206,
      }),
    ).toThrow("missing or stale")
    const secondPrepared = prepareWorldStage({
      manifest: firstCommitted.manifest,
      blueprint,
      stageId: blueprint.stages[1]!.id,
      ownerSessionId: "ses-growth",
      committedDocuments: { [entity.id]: content },
      now: 207,
    })
    expect(secondPrepared.context.dependencies[0]?.entities[0]?.dossier).toBe(content)
    expect(() =>
      registerWorldStage({
        manifest: secondPrepared.manifest,
        blueprint,
        ownerSessionId: "ses-growth",
        now: 208,
        profile: {
          stageId: blueprint.stages[1]!.id,
          contextSha256: secondPrepared.contextSha256,
          entities: [
            {
              name: "镜面航运联合体",
              typeLabel: "基础设施企业联盟",
              summary: "控制轨道维护窗口和能源配额的企业联合体。",
              facts: [
                { label: "权力来源", detail: "维护能力来自同步环的有限载人窗口。" },
                { label: "治理", detail: "以配额和时隙合同约束成员，不直接拥有全部设施。" },
                { label: "边界", detail: "通信遮挡期间各节点拥有临时处置权。" },
              ],
              constraints: ["不得假设无限能源或零延迟通信。"],
              dependencyEntityIds: [],
            },
          ],
          relations: [],
        },
      }),
    ).toThrow("must use at least one committed entity")
  })

  test("preserves stopped work and blocks early world completion", () => {
    const initial = createWorldMaterialization({ blueprint, growthSessionId: "ses-growth", now: 200 })
    const preparedStage = prepareWorldStage({
      manifest: initial,
      blueprint,
      stageId: blueprint.stages[0]!.id,
      ownerSessionId: "ses-growth",
      committedDocuments: {},
      now: 201,
    })
    const registered = registerWorldStage({
      manifest: preparedStage.manifest,
      blueprint,
      profile: firstStageProfile(preparedStage.contextSha256),
      ownerSessionId: "ses-growth",
      now: 202,
    })
    const entity = registered.stage.entities[0]!
    const preparedDocument = prepareWorldDocument({
      manifest: registered.manifest,
      blueprint,
      entityId: entity.id,
      ownerSessionId: "ses-growth",
      ownerMessageId: "msg-document",
      committedDocuments: {},
      now: 203,
    })
    const stopped = abortWorldDocument({
      manifest: preparedDocument.manifest,
      blueprint,
      entityId: entity.id,
      ownerSessionId: "ses-growth",
      taskSessionId: "ses-child",
      now: 204,
    })
    expect(stopped.documents[0]).toMatchObject({ status: "waiting_user", lease: null, taskSessionId: "ses-child" })
    expect(() => finishWorld({ manifest: stopped, blueprint, ownerSessionId: "ses-growth", now: 205 })).toThrow(
      "incomplete",
    )
    expect(worldSha256(withoutIntegrity(stopped))).toBe(stopped.integritySha256)
  })
})

function withoutIntegrity(manifest: NovelXWorld.WorldMaterialization) {
  const { integritySha256: _, ...draft } = manifest
  return draft
}
