import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { NovelXWorld } from "@opencode-ai/schema"
import { compileWorldBlueprint, verifyWorldBlueprint } from "../../src/novelx/world-blueprint"

const profile: NovelXWorld.BlueprintProfile = {
  title: "环日共同体",
  genre: { family: "science fiction", label: "近未来单恒星系殖民", scale: "一个有人类长期活动的恒星系" },
  designSummary: "围绕轨道环境、殖民设施、自治智能与利益组织的约束关系建立一个可继续推演的科技世界。",
  stages: [
    {
      label: "恒星与轨道环境",
      purpose: "确定能源、辐射、轨道窗口和殖民活动能够发生的物理边界。",
      itemCount: 3,
      dependsOnStageIndices: [],
      reasoningFocus: ["轨道和辐射怎样限制长期活动", "能源与通信条件怎样形成空间差异"],
      documentSections: ["空间结构", "物理环境", "资源与通行", "风险与边界"],
    },
    {
      label: "自治组织与企业联盟",
      purpose: "根据已经确定的空间、能源和通行事实注册实际控制资源的组织。",
      itemCount: 2,
      dependsOnStageIndices: [0],
      reasoningFocus: ["组织权力来自哪些稀缺基础设施", "距离和通信延迟如何改变治理"],
      documentSections: ["组织结构", "运作机制", "资源与影响", "风险与边界"],
    },
  ],
}

const compile = (value = profile) =>
  compileWorldBlueprint({
    profile: value,
    source: { sessionId: "ses-growth", messageId: "msg-growth", toolCallId: "call-blueprint", registeredAt: 100 },
  })

describe("NovelX adaptive world blueprint", () => {
  test("keeps model-selected science-fiction layers without a fixed race, religion, or nation taxonomy", () => {
    const manifest = compile()
    expect(Schema.decodeUnknownSync(NovelXWorld.BlueprintManifest)(manifest)).toEqual(manifest)
    expect(manifest.stages.map((stage) => stage.label)).toEqual(["恒星与轨道环境", "自治组织与企业联盟"])
    expect(manifest.stages[1]?.dependsOnStageIds).toEqual([manifest.stages[0]?.id])
    expect(manifest.stages[0]?.documentSections.slice(0, 2)).toEqual(["事实依据", "因果推演"])
    expect(compile()).toEqual(manifest)
    expect(verifyWorldBlueprint(manifest)).toBe(manifest)
  })

  test("fails closed for forward dependencies, repeated sections, and unbounded worlds", () => {
    expect(() =>
      compile({
        ...profile,
        stages: [{ ...profile.stages[0]!, dependsOnStageIndices: [0] }],
      }),
    ).toThrow("earlier stages")
    expect(() =>
      compile({
        ...profile,
        stages: [{ ...profile.stages[0]!, documentSections: ["事实依据", "空间结构"] }],
      }),
    ).toThrow("Harness-owned")
    expect(() =>
      compile({
        ...profile,
        stages: Array.from({ length: 4 }, (_, index) => ({
          ...profile.stages[0]!,
          label: `自由层面甲${String.fromCharCode(65 + index)}`,
          itemCount: 10,
        })),
      }),
    ).toThrow("maximum is 36")
  })

  test("detects persisted blueprint tampering", () => {
    const manifest = compile()
    expect(() => verifyWorldBlueprint({ ...manifest, status: "registered", registeredAt: 101 })).toThrow(
      "integrity check failed",
    )
  })
})
