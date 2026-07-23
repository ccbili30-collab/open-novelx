import { describe, expect, test } from "bun:test"
import { projectDisplayMetadata } from "./project-display"

describe("projectDisplayMetadata", () => {
  test("projects a persisted local name and icon for global projects", () => {
    const project = projectDisplayMetadata({
      project: { worktree: "C:/NovelX/nobe", expanded: true },
      metadata: {
        id: "global",
        worktree: "C:/NovelX/nobe",
        name: "nobe",
        icon: { color: "gray" },
        time: { created: 0, updated: 0 },
        sandboxes: [],
      },
      local: { name: "挖的的", icon: { color: "lime" } },
    })

    expect(project.name).toBe("挖的的")
    expect(project.icon).toEqual({ color: "lime" })
  })

  test("does not let stale local metadata override a registered project", () => {
    const project = projectDisplayMetadata({
      project: { worktree: "C:/NovelX/world", expanded: true },
      metadata: {
        id: "project-real",
        worktree: "C:/NovelX/world",
        name: "正式名称",
        icon: { color: "blue" },
        time: { created: 0, updated: 0 },
        sandboxes: [],
      },
      local: { name: "旧名称", icon: { color: "red" } },
      iconOverride: "data:image/png;base64,AAA",
    })

    expect(project.name).toBe("正式名称")
    expect(project.icon).toEqual({ color: "blue", override: "data:image/png;base64,AAA" })
  })
})
