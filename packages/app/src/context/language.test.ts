import { describe, expect, test } from "bun:test"
import { DEFAULT_LOCALE, normalizeLocale, resolveInitialLocale } from "./language"

describe("NovelX language default", () => {
  test("uses Simplified Chinese when no language has been chosen", () => {
    expect(DEFAULT_LOCALE).toBe("zh")
    expect(resolveInitialLocale()).toBe("zh")
  })

  test("preserves an explicit stored or requested language", () => {
    expect(resolveInitialLocale({ stored: "en" })).toBe("en")
    expect(resolveInitialLocale({ requested: "ja", stored: "en" })).toBe("ja")
  })

  test("fails invalid persisted values back to Simplified Chinese", () => {
    expect(normalizeLocale("not-a-locale")).toBe("zh")
  })
})
