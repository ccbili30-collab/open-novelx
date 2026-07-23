import { describe, expect, test } from "bun:test"
import { novelXDyMessageParts, novelXGrowthMessageParts } from "@/session/novelx-growth-message"

describe("NovelX Growth command presentation", () => {
  test("shows only the short slash command while keeping the expanded template model-visible", () => {
    const parts = novelXGrowthMessageParts({
      arguments: "生成一个中土世界",
      templateParts: [{ type: "text", text: "private orchestration instructions" }],
      attachmentParts: [
        { type: "file", mime: "image/png", url: "data:image/png;base64,AA==", filename: "reference.png" },
      ],
    })

    expect(parts[0]).toEqual({ type: "text", text: "/growth 生成一个中土世界", ignored: true })
    expect(parts[1]).toEqual({ type: "text", text: "private orchestration instructions", synthetic: true })
    expect(parts[2]).toMatchObject({ type: "file", filename: "reference.png" })
  })

  test("does not add an extra space when /growth has no arguments", () => {
    expect(
      novelXGrowthMessageParts({ arguments: "", templateParts: [{ type: "text", text: "internal" }] })[0],
    ).toMatchObject({ text: "/growth", ignored: true })
  })
})

describe("NovelX Douyin command presentation", () => {
  test("shows only the short /dy command while keeping parser instructions model-visible", () => {
    const parts = novelXDyMessageParts({
      arguments: "https://v.douyin.com/example/",
      templateParts: [{ type: "text", text: "private parser instructions" }],
    })

    expect(parts[0]).toEqual({ type: "text", text: "/dy https://v.douyin.com/example/", ignored: true })
    expect(parts[1]).toEqual({ type: "text", text: "private parser instructions", synthetic: true })
  })
})
