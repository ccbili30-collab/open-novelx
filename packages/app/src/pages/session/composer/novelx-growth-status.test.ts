import { describe, expect, test } from "bun:test"
import { activeGrowth, growthTitle, type GrowthSession } from "./novelx-growth-status"

const sessions = (...items: GrowthSession[]) => Object.fromEntries(items.map((item) => [item.id, item]))

describe("NovelX Growth status projection", () => {
  test("projects the deepest running Growth child beneath the root", () => {
    expect(
      activeGrowth({
        currentID: "writer",
        sessions: sessions(
          { id: "root", title: "创建一个经典中世纪幻想大世界" },
          { id: "editor", parentID: "root", title: "阶段：财富、信仰与技艺 (@novelx-stage-editor subagent)" },
          { id: "writer", parentID: "editor", title: "灰冠隘口誓骑团 (@novelx-world-writer subagent)" },
        ),
        statuses: { root: { type: "busy" }, editor: { type: "busy" }, writer: { type: "busy" } },
      }),
    ).toMatchObject({ rootID: "root", sessionID: "writer", title: "灰冠隘口誓骑团", status: { type: "busy" } })
  })

  test("prioritizes a retrying editor and keeps its five-attempt cycle visible", () => {
    expect(
      activeGrowth({
        currentID: "root",
        sessions: sessions(
          { id: "root", title: "中土世界" },
          { id: "editor", parentID: "root", title: "阶段：财富、信仰与技艺 (@novelx-stage-editor subagent)" },
          { id: "writer", parentID: "editor", title: "灰冠隘口誓骑团 (@novelx-world-writer subagent)" },
        ),
        statuses: {
          root: { type: "busy" },
          editor: { type: "retry", attempt: 4, message: "Upstream HTTP/2 stream failed", next: 1234 },
          writer: { type: "busy" },
        },
      }),
    ).toMatchObject({
      rootID: "root",
      sessionID: "editor",
      title: "财富、信仰与技艺",
      status: { type: "retry", attempt: 4 },
    })
  })

  test("does not label ordinary NovelX subagents as Growth", () => {
    expect(
      activeGrowth({
        currentID: "root",
        sessions: sessions(
          { id: "root", title: "修复测试" },
          { id: "child", parentID: "root", title: "查找错误 (@general subagent)" },
        ),
        statuses: { child: { type: "busy" } },
      }),
    ).toBeUndefined()
  })

  test("cleans editor titles for the compact status bar", () => {
    expect(growthTitle("阶段：财富、信仰与技艺 (@novelx-stage-editor subagent)")).toBe("财富、信仰与技艺")
  })
})
