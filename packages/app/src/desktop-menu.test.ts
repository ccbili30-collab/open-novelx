import { describe, expect, test } from "bun:test"
import { DESKTOP_MENU, desktopMenuLabel } from "./desktop-menu"

describe("desktop menu labels", () => {
  test("renders the Windows menu in Chinese for the default locale", () => {
    const file = DESKTOP_MENU.find((menu) => menu.id === "file")!
    const newSession = file.items?.find((item) => item.type === "item" && item.command === "session.new")
    if (!newSession || newSession.type !== "item") throw new Error("New session menu item is missing")

    expect(desktopMenuLabel(file, "zh")).toBe("文件")
    expect(desktopMenuLabel(newSession, "zh")).toBe("新建会话")
  })

  test("keeps English labels for a manual language switch", () => {
    const help = DESKTOP_MENU.find((menu) => menu.id === "help")!
    expect(desktopMenuLabel(help, "en")).toBe("Help")
  })

  test("has a Chinese label for every visible text label except the NovelX brand", () => {
    const labels = DESKTOP_MENU.flatMap((menu) => [menu, ...(menu.items ?? [])]).filter(
      (item) => "label" in item && item.label && item.label !== "NovelX",
    )
    expect(labels.filter((item) => !("labelZh" in item) || !item.labelZh)).toEqual([])
  })
})
