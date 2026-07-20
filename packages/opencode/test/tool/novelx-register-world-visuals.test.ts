import { describe, expect, test } from "bun:test"
import { NovelXWorldVisual } from "@opencode-ai/schema"
import { worldVisualRegistrationResult } from "../../src/tool/novelx-register-world-visuals"

describe("NovelX world visual registration receipt", () => {
  test("returns the persisted manifest path and integrity required by publication handoff", () => {
    const manifest = {
      integritySha256: "visual-integrity",
      atlas: { cells: [{ id: "cell" }], features: [{ id: "feature" }] },
      tasks: [{ id: "task" }],
    } as unknown as NovelXWorldVisual.Manifest

    const receipt = worldVisualRegistrationResult(manifest, false)

    expect(receipt.metadata.manifestPath).toBe(NovelXWorldVisual.MANIFEST_PATH)
    expect(receipt.metadata.integritySha256).toBe("visual-integrity")
    expect(receipt.output).toContain("visual-integrity")
  })
})
