import { describe, expect, it } from "bun:test"
import { novelXGrowthToolCompleted, restrictNovelXGrowthTools } from "@/novelx/growth-loop"

describe("NovelX Growth loop gate", () => {
  it("removes all tools after registration completed in the current user turn", () => {
    const completed = novelXGrowthToolCompleted(
      [
        {
          info: { role: "assistant", parentID: "msg-current" },
          parts: [
            {
              type: "tool",
              tool: "novelx_register_growth_skeleton",
              state: { status: "completed" },
            },
          ],
        },
      ],
      "msg-current",
    )
    const tools = restrictNovelXGrowthTools({
      agent: "growth",
      completedThisTurn: completed,
      tools: { novelx_register_growth_skeleton: {}, read: {} },
    })

    expect(completed).toBe(true)
    expect(tools).toEqual({})
  })

  it("allows a failed registration to be corrected in the same user turn", () => {
    const completed = novelXGrowthToolCompleted(
      [
        {
          info: { role: "assistant", parentID: "msg-current" },
          parts: [
            {
              type: "tool",
              tool: "novelx_register_growth_skeleton",
              state: { status: "error" },
            },
          ],
        },
      ],
      "msg-current",
    )
    const tools = { novelx_register_growth_skeleton: {} }

    expect(completed).toBe(false)
    expect(restrictNovelXGrowthTools({ agent: "growth", completedThisTurn: completed, tools })).toBe(tools)
  })

  it("does not consume completed registrations from earlier turns or other agents", () => {
    const completed = novelXGrowthToolCompleted(
      [
        {
          info: { role: "assistant", parentID: "msg-older" },
          parts: [
            {
              type: "tool",
              tool: "novelx_register_growth_skeleton",
              state: { status: "completed" },
            },
          ],
        },
      ],
      "msg-current",
    )
    const tools = { novelx_register_growth_skeleton: {} }

    expect(completed).toBe(false)
    expect(restrictNovelXGrowthTools({ agent: "growth", completedThisTurn: completed, tools })).toBe(tools)
    expect(restrictNovelXGrowthTools({ agent: "build", completedThisTurn: true, tools })).toBe(tools)
  })
})
