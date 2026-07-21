import { describe, expect, test } from "bun:test"
import { navigableTaskSessionID } from "./novelx-task-navigation"

describe("NovelX task navigation boundary", () => {
  test("keeps internal NovelX child sessions out of the user-facing transcript", () => {
    expect(navigableTaskSessionID({ subagent_type: "novelx-world-writer" }, "ses_child")).toBeUndefined()
    expect(navigableTaskSessionID({ subagent_type: "novelx-stage-editor" }, "ses_stage")).toBeUndefined()
  })

  test("preserves upstream task navigation for non-NovelX agents", () => {
    expect(navigableTaskSessionID({ subagent_type: "explore" }, "ses_child")).toBe("ses_child")
    expect(navigableTaskSessionID({}, "ses_child")).toBe("ses_child")
  })
})
