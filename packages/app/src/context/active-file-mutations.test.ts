import { describe, expect, test } from "bun:test"
import { activeFileMutations } from "./active-file-mutations"

const tool = (name: string, status: string, input: Record<string, unknown>) => ({
  type: "tool",
  tool: name,
  state: { status, input },
})

describe("active Agent file mutations", () => {
  test("reports only pending and running write/edit targets", () => {
    expect(
      activeFileMutations([
        tool("write", "running", { filePath: "World\\北境.md" }),
        tool("edit", "pending", { filePath: "./Characters/艾琳.md" }),
        tool("write", "completed", { filePath: "Story/done.md" }),
        tool("read", "running", { path: "World/read-only.md" }),
      ]),
    ).toEqual(["World/北境.md", "Characters/艾琳.md"])
  })

  test("extracts every affected path from an active apply_patch", () => {
    expect(
      activeFileMutations([
        tool("apply_patch", "running", {
          patchText: [
            "*** Begin Patch",
            "*** Update File: World/北境.md",
            "*** Move to: World/北境设定.md",
            "*** Add File: Characters/艾琳.md",
            "*** Delete File: Drafts/旧稿.md",
            "*** End Patch",
          ].join("\n"),
        }),
      ]),
    ).toEqual(["World/北境.md", "World/北境设定.md", "Characters/艾琳.md", "Drafts/旧稿.md"])
  })

  test("ignores malformed, completed, and duplicate targets", () => {
    expect(
      activeFileMutations([
        tool("apply_patch", "completed", { patchText: "*** Update File: no.md" }),
        tool("apply_patch", "running", { patchText: "*** Update File: same.md\n*** Update File: same.md" }),
        tool("edit", "running", { filePath: 42 }),
        { type: "text", text: "not a tool" },
      ]),
    ).toEqual(["same.md"])
  })
})
