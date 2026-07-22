import { describe, expect, test } from "bun:test"
import {
  classifyStudySourcePath,
  commitStudyDocument,
  commitStudySegmentExtraction,
  createStudyMaterialization,
  estimateStudySourceTokens,
  finishStudyText,
  prepareStudySegment,
  recordStudySegmentRead,
  registerStudyDocuments,
  segmentStudySource,
  studySha256,
  studyIntegrationPage,
  verifyStudyMaterialization,
} from "../../src/novelx/study-materialization"

const source = {
  id: "study-source-story",
  relativePath: "Stories/迷雾之城.md",
  kind: "text" as const,
  roleHint: "story" as const,
  byteSize: 120,
  contentSha256: studySha256("第一章\n克莱恩走进迷雾。"),
  adapterStatus: "ready" as const,
}

describe("NovelX Study materialization", () => {
  test("classifies project material without treating binary formats as readable text", () => {
    expect(classifyStudySourcePath("Stories/迷雾之城.md")).toEqual({ kind: "text", roleHint: "story" })
    expect(classifyStudySourcePath("Characters/克莱恩.png")).toEqual({ kind: "image", roleHint: "character" })
    expect(classifyStudySourcePath("Wiki/设定集.pdf")).toEqual({ kind: "document", roleHint: "reference" })
    expect(classifyStudySourcePath("素材/访谈.mp4")).toEqual({ kind: "video", roleHint: "unclassified" })
  })

  test("uses a conservative multilingual source-token estimate", () => {
    expect(estimateStudySourceTokens("汉".repeat(80_000))).toBe(80_000)
    expect(estimateStudySourceTokens("a".repeat(320_000))).toBe(80_000)
    expect(estimateStudySourceTokens("😀".repeat(1_000))).toBeGreaterThanOrEqual(1_000)
  })

  test("splits source text at semantic boundaries under the 80k source limit", () => {
    const text = Array.from({ length: 180 }, (_, index) => `## 第${index + 1}节\n${"雾".repeat(1_000)}`).join("\n\n")
    const segments = segmentStudySource({ sourceId: source.id, text, maxSourceTokens: 80_000 })

    expect(segments.length).toBeGreaterThan(2)
    expect(segments[0]?.startOffset).toBe(0)
    expect(segments.at(-1)?.endOffset).toBe(text.length)
    expect(segments.every((segment) => segment.estimatedSourceTokens <= 80_000)).toBe(true)
    expect(segments.every((segment) => text.slice(segment.startOffset, segment.endOffset).length > 0)).toBe(true)
  })

  test("materializes extracted facts into deterministic public folders without overwriting sources", () => {
    const content = "第一章\n克莱恩走进迷雾。"
    const segment = segmentStudySource({ sourceId: source.id, text: content, maxSourceTokens: 80_000 })[0]!
    let manifest = createStudyMaterialization({
      studySessionId: "ses-study",
      sources: [source],
      segments: [segment],
      now: 10,
    })

    manifest = prepareStudySegment({
      manifest,
      segmentId: segment.id,
      workerSessionId: "ses-worker-1",
      now: 15,
    }).manifest
    manifest = recordStudySegmentRead({
      manifest,
      segmentId: segment.id,
      workerSessionId: "ses-worker-1",
      fromOffset: segment.startOffset,
      toOffset: segment.endOffset,
      now: 16,
    })

    manifest = commitStudySegmentExtraction({
      manifest,
      segmentId: segment.id,
      workerSessionId: "ses-worker-1",
      extraction: {
        entities: [
          {
            key: "klein",
            kind: "character",
            group: "人物",
            title: "克莱恩",
            aliases: ["愚者"],
            summary: "迷雾之城故事中持续行动并承担核心冲突的人物。",
            evidence: [{ sourceId: source.id, segmentId: segment.id, detail: "第一章中明确出现并进入迷雾。" }],
          },
        ],
        relations: [],
        gaps: [{ entityKey: "klein", field: "appearance", question: "原文尚未提供稳定外貌。" }],
        visualCandidates: [
          { entityKey: "klein", type: "portrait", priority: "required", reason: "主角需要默认立绘。" },
        ],
      },
      now: 20,
    })

    const registered = registerStudyDocuments({
      manifest,
      integratorSessionId: "ses-integrator",
      proposals: [
        {
          entityKey: "klein",
          kind: "character",
          group: "人物",
          title: "克莱恩",
          aliases: ["愚者"],
          summary: "迷雾之城故事中持续行动并承担核心冲突的人物。",
          evidence: [{ sourceId: source.id, segmentId: segment.id, detail: "第一章中明确出现并进入迷雾。" }],
          sections: ["身份", "经历", "关系"],
        },
      ],
      now: 30,
    })
    manifest = registered.manifest
    expect(manifest.documents[0]?.targetPath).toBe("Characters/克莱恩.md")

    expect(() =>
      registerStudyDocuments({
        manifest: createStudyMaterialization({
          studySessionId: "ses-study",
          sources: [{ ...source, relativePath: "Characters/克莱恩.md" }],
          segments: [{ ...segment }],
          now: 10,
        }),
        integratorSessionId: "ses-integrator",
        proposals: [
          {
            entityKey: "klein",
            kind: "character",
            group: "人物",
            title: "克莱恩",
            aliases: [],
            summary: "从既有角色资料中抽取出的正式人物档案。",
            evidence: [{ sourceId: source.id, segmentId: segment.id, detail: "既有角色资料明确记录。" }],
            sections: ["身份"],
          },
        ],
        now: 30,
      }),
    ).toThrow("NOVELX_STUDY_SOURCE_OVERWRITE")

    manifest = commitStudyDocument({
      manifest,
      documentId: manifest.documents[0]!.id,
      integratorSessionId: "ses-integrator",
      content: "# 克莱恩\n\n## 身份\n\n他是迷雾之城故事中的核心人物。\n\n## 经历\n\n他在第一章走进迷雾。\n\n## 关系\n\n现有材料尚未说明。\n",
      resolvedGaps: [{ field: "appearance", origin: "unknown", detail: "现有材料与公开资料均未说明。" }],
      now: 40,
    })
    const finished = finishStudyText({ manifest, studySessionId: "ses-study", now: 50 })
    expect(finished.status).toBe("text_completed")
    expect(finished.visuals[0]?.status).toBe("pending")
    expect(verifyStudyMaterialization(finished)).toEqual(finished)
  })

  test("pages sealed extraction summaries instead of returning an unbounded integration payload", () => {
    const text = Array.from({ length: 20 }, (_, index) => `第${index + 1}节。`).join("\n\n")
    const segments = segmentStudySource({ sourceId: source.id, text, maxSourceTokens: 4 })
    expect(segments.length).toBeGreaterThan(8)
    let manifest = createStudyMaterialization({
      studySessionId: "ses-study-paged",
      sources: [{ ...source, byteSize: Buffer.byteLength(text), contentSha256: studySha256(text) }],
      segments,
      now: 1,
    })
    for (const segment of segments) {
      const workerSessionId = `worker-${segment.ordinal}`
      manifest = prepareStudySegment({ manifest, segmentId: segment.id, workerSessionId, now: 2 }).manifest
      manifest = recordStudySegmentRead({
        manifest,
        segmentId: segment.id,
        workerSessionId,
        fromOffset: segment.startOffset,
        toOffset: segment.endOffset,
        now: 3,
      })
      manifest = commitStudySegmentExtraction({
        manifest,
        segmentId: segment.id,
        workerSessionId,
        extraction: { entities: [], relations: [], gaps: [], visualCandidates: [] },
        now: 4,
      })
    }
    const first = studyIntegrationPage({ manifest, offset: 0, limit: 4 })
    expect(first.segments).toHaveLength(4)
    expect(first.nextOffset).toBe(4)
    expect(first.done).toBe(false)
    const lastOffset = Math.floor((segments.length - 1) / 4) * 4
    const last = studyIntegrationPage({ manifest, offset: lastOffset, limit: 4 })
    expect(last.segments.length).toBeLessThanOrEqual(4)
    expect(last.nextOffset).toBeNull()
    expect(last.done).toBe(true)
  })
})
