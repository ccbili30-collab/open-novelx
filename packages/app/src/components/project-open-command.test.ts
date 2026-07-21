import { describe, expect, test } from "bun:test"
import { createProjectOpenCommand } from "./project-open-command-model"

describe("createProjectOpenCommand", () => {
  test("registers every selected project and opens only the first selection", () => {
    const opened: string[] = []
    const drafts: string[] = []
    let resolve: ((value: string | string[] | null) => void) | undefined
    const option = createProjectOpenCommand({
      title: "打开项目",
      category: "项目",
      choose: (onSelect) => {
        resolve = onSelect
      },
      open: (directory) => opened.push(directory),
      activate: (directory) => drafts.push(directory),
    })

    expect(option.id).toBe("project.open")
    expect(option.keybind).toBe("mod+o")
    option.onSelect?.()
    resolve?.(["D:\\NovelX\\one", "D:\\NovelX\\two"])

    expect(opened).toEqual(["D:\\NovelX\\one", "D:\\NovelX\\two"])
    expect(drafts).toEqual(["D:\\NovelX\\one"])
  })

  test("does nothing when the directory picker is cancelled", () => {
    let calls = 0
    const option = createProjectOpenCommand({
      title: "打开项目",
      category: "项目",
      choose: (onSelect) => onSelect(null),
      open: () => calls++,
      activate: () => calls++,
    })

    option.onSelect?.()
    expect(calls).toBe(0)
  })
})
