import { describe, expect, test } from "bun:test"
import { inspectSourceTitleGrounding } from "../../src/novelx/text-grounding"

const sources = [
  { entityId: "world-port", title: "暮湾潮关城" },
  { entityId: "world-sea", title: "长暮内海" },
]

describe("NovelX proper-name grounding", () => {
  test("rejects a spliced name that reuses a protected world-name suffix", () => {
    const result = inspectSourceTitleGrounding({
      markdown: "长暮潮关城碑档署保存了旧年潮册。",
      requiredSourceEntityIds: [],
      worldSources: sources,
    })

    expect(result.confusableDrifts).toContainEqual({
      sourceTitle: "暮湾潮关城",
      authoritativePrefix: "暮湾潮关城",
      candidate: "长暮潮关城",
    })
  })

  test("allows a new institution below the complete authoritative place name", () => {
    const result = inspectSourceTitleGrounding({
      markdown: "暮湾潮关城碑档署保存了旧年潮册。",
      requiredSourceEntityIds: [],
      worldSources: sources,
    })

    expect(result.confusableDrifts).toEqual([])
  })

  test("does not treat ordinary prose before a protected suffix as a proper-name splice", () => {
    const result = inspectSourceTitleGrounding({
      markdown: "以关议会、井契盟和渡契院为中心，并围绕井群牧路分配水源。",
      requiredSourceEntityIds: [],
      worldSources: [
        ...sources,
        { entityId: "world-well-road", title: "赤风井群牧路" },
        { entityId: "world-contract", title: "三汊渡契院" },
      ],
    })

    expect(result.confusableDrifts).toEqual([])
  })

  test("does not infer a place name from an unrelated descriptive phrase", () => {
    const result = inspectSourceTitleGrounding({
      markdown: "这是一条绵延千里的脊山脉。",
      requiredSourceEntityIds: [],
      worldSources: [{ entityId: "world-range", title: "王冠脊山脉" }],
    })

    expect(result.confusableDrifts).toEqual([])
  })

  test("still rejects a one-character drift when the world name is extended into an institution", () => {
    const result = inspectSourceTitleGrounding({
      markdown: "三汊母河流域档案署保存旧契。",
      requiredSourceEntityIds: [],
      worldSources: [{ entityId: "world-river", title: "三岔母河流域" }],
    })

    expect(result.confusableDrifts).toContainEqual({
      sourceTitle: "三岔母河流域",
      authoritativePrefix: "三岔母河流域",
      candidate: "三汊母河流域",
    })
  })
})
