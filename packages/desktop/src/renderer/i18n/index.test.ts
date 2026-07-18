import { describe, expect, test } from "bun:test"
import { DEFAULT_LOCALE, t } from "./index"

describe("desktop renderer language default", () => {
  test("starts in Simplified Chinese before persisted settings load", () => {
    expect(DEFAULT_LOCALE).toBe("zh")
    expect(t("app.name.desktop")).toBe("OpenCode 桌面版")
  })
})
