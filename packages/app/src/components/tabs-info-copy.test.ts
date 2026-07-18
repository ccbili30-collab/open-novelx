import { describe, expect, test } from "bun:test"
import { tabsInfoCopy } from "./tabs-info-copy"

describe("tabs information copy", () => {
  test("provides complete Chinese copy for the default locale", () => {
    const copy = tabsInfoCopy("zh")
    expect(copy.title).toBe("标签页功能介绍")
    expect(copy.start).toContain("新建会话")
    expect(copy.worktrees).toContain("Git 工作树")
  })

  test("keeps English copy available after a manual language switch", () => {
    expect(tabsInfoCopy("en").title).toBe("Introducing Tabs")
  })
})
