import { describe, expect, test } from "bun:test"
import { NovelXWorld } from "@opencode-ai/schema"
import { compileWorldBlueprint, worldSha256 } from "../../src/novelx/world-blueprint"
import {
  abortWorldDocument,
  checkpointGrowthMemory,
  commitWorldDocument,
  createWorldMaterialization,
  finishWorld,
  finishWorldStage,
  prepareWorldDocument,
  prepareWorldStage,
  readWorldSources,
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
        itemCount: 2,
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

const naturalProfile = (contextSha256: string): NovelXWorld.StageRegistrationProfile => ({
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
      upstreamBindings: [],
    },
    {
      name: "拉格朗日冰库群",
      typeLabel: "挥发物储备与转运区",
      summary: "分布在稳定点附近的冰体捕获、储存和转运设施，是推进剂与封闭生态补给来源。",
      facts: [
        { label: "储量", detail: "冰体储量可观，但开采速率受姿态控制和碎屑风险限制。" },
        { label: "交通", detail: "低能转移轨道节省推进剂，却造成以月计的运输周期。" },
        { label: "风险", detail: "碎屑云会迫使运输窗口关闭并改变保险和库存策略。" },
      ],
      constraints: ["任何稳定供给都必须保留长运输周期和碎屑封锁的安全库存。"],
      upstreamBindings: [],
    },
  ],
  relations: [
    {
      fromEntityIndex: 0,
      toEntityIndex: 1,
      label: "能源换补给",
      summary: "同步环提供开采能源和时标，冰库群向维护节点供应推进剂与生命保障物资。",
    },
  ],
})

function prepareNatural(initial = createWorldMaterialization({ blueprint, growthSessionId: "ses-growth", now: 200 })) {
  return prepareWorldStage({
    manifest: initial,
    blueprint,
    stageId: blueprint.stages[0]!.id,
    ownerSessionId: "ses-natural-editor",
    ownerParentSessionId: "ses-growth",
    now: 201,
  })
}

function commitNaturalStage() {
  const prepared = prepareNatural()
  const registered = registerWorldStage({
    manifest: prepared.manifest,
    blueprint,
    profile: naturalProfile(prepared.contextSha256),
    ownerSessionId: "ses-natural-editor",
    now: 202,
  })
  let manifest = registered.manifest
  const contents: Record<string, string> = {}
  for (const [index, entity] of registered.stage.entities.entries()) {
    const preparedDocument = prepareWorldDocument({
      manifest,
      blueprint,
      entityId: entity.id,
      ownerSessionId: "ses-natural-editor",
      ownerMessageId: `msg-natural-${index}`,
      committedDocuments: contents,
      now: 203 + index * 2,
    })
    const content = dossier(entity.name, blueprint.stages[0]!.documentSections)
    const committed = commitWorldDocument({
      manifest: preparedDocument.manifest,
      blueprint,
      entityId: entity.id,
      ownerSessionId: "ses-natural-editor",
      taskSessionId: `ses-natural-leaf-${index}`,
      draft: content,
      now: 204 + index * 2,
    })
    manifest = committed.manifest
    contents[entity.id] = content
  }
  const sealed = finishWorldStage({
    manifest,
    blueprint,
    stageId: blueprint.stages[0]!.id,
    ownerSessionId: "ses-natural-editor",
    navigationSummary:
      "赫利俄斯同步环与拉格朗日冰库群共同封存了能源、辐射、通信、补给和交通窗口的自然底座。",
    now: 210,
  })
  return { manifest: sealed.manifest, stage: sealed.stage, contents }
}

describe("NovelX adaptive world materialization", () => {
  test("binds a stage to exactly one clean stage editor session", () => {
    const initial = createWorldMaterialization({ blueprint, growthSessionId: "ses-growth", now: 200 })
    expect(initial.schemaVersion).toBe(2)
    expect(initial.stages[0]?.editorSessionId).toBeNull()
    expect(() =>
      prepareWorldStage({
        manifest: initial,
        blueprint,
        stageId: blueprint.stages[0]!.id,
        ownerSessionId: "ses-growth",
        ownerParentSessionId: null,
        now: 201,
      }),
    ).toThrow("stage editor")
    const prepared = prepareNatural(initial)
    expect(prepared.stage.editorSessionId).toBe("ses-natural-editor")
    expect(() =>
      prepareWorldStage({
        manifest: prepared.manifest,
        blueprint,
        stageId: blueprint.stages[0]!.id,
        ownerSessionId: "ses-impostor-editor",
        ownerParentSessionId: "ses-growth",
        now: 203,
      }),
    ).toThrow("already bound")
  })

  test("requires explicit stage review, sealed handoff, and root memory checkpoint", () => {
    const committed = commitNaturalStage()
    expect(committed.stage.status).toBe("completed")
    expect(committed.stage.handoff?.documents).toHaveLength(2)
    const checkpointed = checkpointGrowthMemory({
      manifest: committed.manifest,
      blueprint,
      stageId: blueprint.stages[0]!.id,
      ownerSessionId: "ses-growth",
      compactionMessageId: "msg-compaction-1",
      now: 211,
    })
    expect(checkpointed.checkpoint.contextEpoch).toBe(1)
    expect(
      checkpointGrowthMemory({
        manifest: checkpointed.manifest,
        blueprint,
        stageId: blueprint.stages[0]!.id,
        ownerSessionId: "ses-growth",
        compactionMessageId: "msg-compaction-1",
        now: 212,
      }).replayed,
    ).toBe(true)
    expect(verifyWorldMaterialization({ manifest: checkpointed.manifest, blueprint })).toBe(checkpointed.manifest)
  })

  test("reads exact upstream originals before registering a many-to-many human binding", () => {
    const natural = commitNaturalStage()
    const sourceEntities = natural.stage.entities
    const prepared = prepareWorldStage({
      manifest: natural.manifest,
      blueprint,
      stageId: blueprint.stages[1]!.id,
      ownerSessionId: "ses-human-editor",
      ownerParentSessionId: "ses-growth",
      now: 220,
    })
    expect(prepared.context.dependencies[0]?.entities[0]).not.toHaveProperty("dossier")
    expect(() =>
      registerWorldStage({
        manifest: prepared.manifest,
        blueprint,
        ownerSessionId: "ses-human-editor",
        now: 221,
        profile: humanProfile(prepared.contextSha256, sourceEntities),
      }),
    ).toThrow("did not read exactly")
    expect(() =>
      readWorldSources({
        manifest: prepared.manifest,
        blueprint,
        stageId: blueprint.stages[1]!.id,
        ownerSessionId: "ses-human-editor",
        entityIds: sourceEntities.map((entity) => entity.id),
        committedDocuments: { ...natural.contents, [sourceEntities[0]!.id]: `${natural.contents[sourceEntities[0]!.id]}漂移` },
        now: 222,
      }),
    ).toThrow("missing or stale")
    const read = readWorldSources({
      manifest: prepared.manifest,
      blueprint,
      stageId: blueprint.stages[1]!.id,
      ownerSessionId: "ses-human-editor",
      entityIds: sourceEntities.map((entity) => entity.id),
      committedDocuments: natural.contents,
      now: 223,
    })
    const registered = registerWorldStage({
      manifest: read.manifest,
      blueprint,
      ownerSessionId: "ses-human-editor",
      now: 224,
      profile: humanProfile(prepared.contextSha256, sourceEntities),
    })
    expect(registered.stage.entities[0]?.upstreamBindings).toHaveLength(2)
    expect(registered.stage.entities[0]?.upstreamBindings.every((binding) => binding.sourceSha256.length === 64)).toBe(
      true,
    )
  })

  test("preserves stopped leaf work and blocks early world completion", () => {
    const prepared = prepareNatural()
    const registered = registerWorldStage({
      manifest: prepared.manifest,
      blueprint,
      profile: naturalProfile(prepared.contextSha256),
      ownerSessionId: "ses-natural-editor",
      now: 202,
    })
    const entity = registered.stage.entities[0]!
    const preparedDocument = prepareWorldDocument({
      manifest: registered.manifest,
      blueprint,
      entityId: entity.id,
      ownerSessionId: "ses-natural-editor",
      ownerMessageId: "msg-document",
      committedDocuments: {},
      now: 203,
    })
    const stopped = abortWorldDocument({
      manifest: preparedDocument.manifest,
      blueprint,
      entityId: entity.id,
      ownerSessionId: "ses-natural-editor",
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

function humanProfile(
  contextSha256: string,
  sources: readonly NovelXWorld.RegisteredEntity[],
): NovelXWorld.StageRegistrationProfile {
  return {
    stageId: blueprint.stages[1]!.id,
    contextSha256,
    entities: [
      {
        name: "镜面航运联合体",
        typeLabel: "跨轨道基础设施联盟",
        summary: "同时控制同步环维护时隙与冰库运输配额的联合组织，其辖域跨越多个自然区域。",
        facts: [
          { label: "权力来源", detail: "维护能力来自同步环有限窗口，供给能力来自冰库的长周期运输。" },
          { label: "治理", detail: "以能源时隙和安全库存的联动合同约束成员，不直接拥有全部设施。" },
          { label: "边界", detail: "通信遮挡或碎屑封锁期间，各节点只能在预设配额内临时处置。" },
        ],
        constraints: ["不得假设无限能源、即时运输或零延迟通信。"],
        upstreamBindings: [
          {
            entityId: sources[0]!.id,
            relation: "跨域能源与通信依赖",
            impact: "同步环的维护窗口和遮挡周期决定联合体的能源配给权与分区自治时限。",
            constraints: ["高粒子流期间不能安排常规载人维护，遮挡期必须允许节点自治。"],
          },
          {
            entityId: sources[1]!.id,
            relation: "跨域补给与运输依赖",
            impact: "冰库的月级运输周期与碎屑风险迫使联合体维持安全库存和长期合同。",
            constraints: ["库存必须覆盖一次运输窗口关闭，不能把低能轨道描述成即时物流。"],
          },
        ],
      },
    ],
    relations: [],
  }
}

function withoutIntegrity(manifest: NovelXWorld.WorldMaterialization) {
  const { integritySha256: _, ...draft } = manifest
  return draft
}
