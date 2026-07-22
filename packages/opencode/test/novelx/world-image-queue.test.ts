import { describe, expect, test } from "bun:test"
import { createServer } from "node:http"
import { NovelXWorldVisual } from "@opencode-ai/schema"
import { Effect } from "effect"
import { requestImage, requestImageWithNodeHttp, WORLD_IMAGE_MODEL } from "@/novelx/world-image-queue"
import { resolveWorldMapEditPlan } from "@/novelx/world-map-variant"

const imageTask = (input: Partial<NovelXWorldVisual.ImageTask> & Pick<NovelXWorldVisual.ImageTask, "id">) =>
  ({
    type: "map",
    subtype: "world-map",
    mapRole: "base",
    layer: null,
    entityId: null,
    baseTaskId: null,
    ownerEntityId: null,
    status: "queued",
    title: "地图",
    prompt: "保持地图位置不变并生成状态图。",
    rationale: "测试地图状态图依赖。",
    sourceEntityIds: ["entity"],
    sourceSha256s: ["a".repeat(64)],
    targetPath: "World/Media/world-map.png",
    mime: null,
    assetSha256: null,
    model: null,
    startedAt: null,
    completedAt: null,
    errorCode: null,
    ...input,
  }) satisfies NovelXWorldVisual.ImageTask

const manifestWith = (tasks: NovelXWorldVisual.ImageTask[]) =>
  ({
    schemaVersion: 3,
    atlas: { semanticMaskPath: ".novelx/visuals/world-map-semantic.png" },
    tasks,
  }) as unknown as NovelXWorldVisual.Manifest

describe("NovelX world image queue", () => {
  test("uses the image model registered by the NovelX provider profile", () => {
    expect(String(WORLD_IMAGE_MODEL)).toBe("gpt-image-2")
  })

  test("uses the semantic mask for the base and the attached shared raster for every variant", () => {
    const base = imageTask({ id: "base" })
    const variant = imageTask({
      id: "variant",
      subtype: "region-highlight",
      mapRole: "variant",
      layer: "geography",
      entityId: "central-plain",
      baseTaskId: base.id,
      ownerEntityId: "central-plain",
      targetPath: "World/Media/maps/geography/central-plain.png",
    })
    expect(resolveWorldMapEditPlan({ manifest: manifestWith([base, variant]), task: base })).toMatchObject({
      kind: "base",
      sourcePath: ".novelx/visuals/world-map-semantic.png",
    })
    expect(() => resolveWorldMapEditPlan({ manifest: manifestWith([base, variant]), task: variant })).toThrow(
      "shared base map is not attached",
    )
    const attachedBase = imageTask({
      ...base,
      status: "attached",
      mime: "image/png",
      assetSha256: "b".repeat(64),
      model: "openai-compatible/gpt-image-2",
      completedAt: 10,
    })
    expect(resolveWorldMapEditPlan({ manifest: manifestWith([attachedBase, variant]), task: variant })).toMatchObject({
      kind: "variant",
      sourcePath: "World/Media/world-map.png",
      sourceTaskId: "base",
    })
  })

  test("streams JSON image responses and follows a returned asset URL", async () => {
    const expected = Buffer.from("real-image-bytes")
    const server = createServer((request, response) => {
      if (request.url === "/asset") {
        response.writeHead(200, { "Content-Type": "image/png" })
        response.end(expected)
        return
      }
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING")
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ data: [{ url: `http://127.0.0.1:${address.port}/asset` }] }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING")
      const bytes = await Effect.runPromise(
        requestImage(
          `http://127.0.0.1:${address.port}/generate`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "test" }) },
          5_000,
        ),
      )
      expect(bytes).toEqual(expected)
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })

  test("supports the native Node HTTP transport used by the Electron sidecar", async () => {
    const expected = Buffer.from("node-sidecar-image-bytes")
    let requestLength: string | undefined
    const server = createServer((request, response) => {
      if (request.url === "/asset") {
        response.writeHead(200, { "Content-Type": "image/png" })
        response.end(expected)
        return
      }
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING")
      requestLength = request.headers["content-length"]
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ data: [{ url: `http://127.0.0.1:${address.port}/asset` }] }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING")
      const response = await requestImageWithNodeHttp(
        `http://127.0.0.1:${address.port}/generate`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "test" }) },
        5_000,
      )
      const parsed = JSON.parse(response.body.toString("utf8")) as { data: Array<{ url: string }> }
      const asset = await requestImageWithNodeHttp(parsed.data[0]!.url, { method: "GET" }, 5_000)
      expect(asset.ok).toBe(true)
      expect(asset.body).toEqual(expected)
      expect(requestLength).toBe(String(Buffer.byteLength(JSON.stringify({ model: "test" }))))
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
})
