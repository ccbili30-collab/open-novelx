import { describe, expect, test } from "bun:test"
import { WORLD_IMAGE_MODEL } from "@/novelx/world-image-queue"

describe("NovelX world image queue", () => {
  test("uses the image model registered by the NovelX provider profile", () => {
    expect(String(WORLD_IMAGE_MODEL)).toBe("gpt-image-2")
  })
})
