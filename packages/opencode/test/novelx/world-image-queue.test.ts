import { describe, expect, test } from "bun:test"
import { createServer } from "node:http"
import { Effect } from "effect"
import { requestImage, requestImageWithNodeHttp, WORLD_IMAGE_MODEL } from "@/novelx/world-image-queue"

describe("NovelX world image queue", () => {
  test("uses the image model registered by the NovelX provider profile", () => {
    expect(String(WORLD_IMAGE_MODEL)).toBe("gpt-image-2")
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
