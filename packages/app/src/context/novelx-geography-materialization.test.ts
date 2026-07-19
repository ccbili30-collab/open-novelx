import { describe, expect, it } from "bun:test"
import { parseNovelXGeographyMaterialization } from "./novelx-geography-materialization"

describe("NovelX geography materialization projection", () => {
  it("accepts an intact state and fails closed for tampering or another skeleton", async () => {
    const draft = {
      schemaVersion: 1 as const,
      stage: "geography_materialization" as const,
      status: "running" as const,
      skeletonIntegritySha256: "a".repeat(64),
      growthSessionId: "ses_growth",
      startedAt: 1,
      updatedAt: 1,
      records: [
        {
          terrainId: "terrain-1",
          targetPath: "World/地理/北境冠脉.md",
          draftPath: ".novelx/growth/drafts/terrain-1.md",
          status: "leased" as const,
          lease: {
            id: "lease-1",
            ownerSessionId: "ses_growth",
            ownerMessageId: "msg_growth",
            acquiredAt: 1,
          },
          taskSessionId: null,
          draftSha256: null,
          committedSha256: null,
          updatedAt: 1,
          errorCode: null,
        },
      ],
    }
    const manifest = { ...draft, integritySha256: await sha256(draft) }
    expect(
      (await parseNovelXGeographyMaterialization(JSON.stringify(manifest), "a".repeat(64))).records[0].status,
    ).toBe("leased")
    await expect(
      parseNovelXGeographyMaterialization(JSON.stringify({ ...manifest, updatedAt: 2 }), "a".repeat(64)),
    ).rejects.toThrow("完整性")
    await expect(parseNovelXGeographyMaterialization(JSON.stringify(manifest), "b".repeat(64))).rejects.toThrow(
      "不匹配",
    )
  })
})

async function sha256(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
