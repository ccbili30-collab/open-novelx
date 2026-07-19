import { afterEach, describe, expect, test } from "bun:test"
import { Context, Effect } from "effect"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import path from "path"
import { mkdir } from "node:fs/promises"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { FilePaths } from "../../src/server/routes/instance/httpapi/groups/file"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import { pollWithTimeout } from "../lib/effect"

const context = Context.empty() as Context.Context<unknown>

function request(
  route: string,
  directory: string,
  options: { query?: Record<string, string>; method?: "GET" | "PUT"; body?: unknown } = {},
) {
  const url = new URL(`http://localhost${route}`)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value)
  }
  return HttpApiApp.webHandler().handler(
    new Request(url, {
      method: options.method,
      headers: {
        "x-opencode-directory": directory,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    context,
  )
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("file HttpApi", () => {
  test("serves read endpoints", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "hello.txt"), "hello")

    const [list, content, status] = await Promise.all([
      request(FilePaths.list, tmp.path, { query: { path: "." } }),
      request(FilePaths.content, tmp.path, { query: { path: "hello.txt" } }),
      request(FilePaths.status, tmp.path),
    ])

    expect(list.status).toBe(200)
    expect(await list.json()).toContainEqual(
      expect.objectContaining({ name: "hello.txt", path: "hello.txt", type: "file" }),
    )

    expect(content.status).toBe(200)
    expect(await content.json()).toMatchObject({ type: "text", content: "hello" })

    expect(status.status).toBe(200)
    expect(await status.json()).toEqual([])
  })

  test("serves search endpoints", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "hello.txt"), "needle")

    const [text, symbols] = await Promise.all([
      request(FilePaths.findText, tmp.path, { query: { pattern: "needle" } }),
      request(FilePaths.findSymbol, tmp.path, { query: { query: "hello" } }),
    ])
    const files = await Effect.runPromise(
      pollWithTimeout(
        Effect.promise(async () => {
          const response = await request(FilePaths.findFile, tmp.path, {
            query: { query: "hello", type: "file" },
          })
          const body = await response.json()
          return body.includes("hello.txt") ? { response, body } : undefined
        }),
        "file search index was not ready",
      ),
    )

    expect(text.status).toBe(200)
    expect(await text.json()).toContainEqual(expect.objectContaining({ line_number: 1 }))

    expect(files.response.status).toBe(200)
    expect(files.body).toContain("hello.txt")

    expect(symbols.status).toBe(200)
    expect(await symbols.json()).toEqual([])
  })

  test("reads exact editable UTF-8 content without trimming and reports BOM", async () => {
    await using tmp = await tmpdir({ git: true })
    const original = "  第一行\r\n最后一行  \r\n"
    await Bun.write(path.join(tmp.path, "world.md"), `\uFEFF${original}`)

    const response = await request("/file/edit", tmp.path, { query: { path: "world.md" } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ type: "text", content: original, bom: true })
  })

  test("conditionally saves exact content and rejects a stale baseline", async () => {
    await using tmp = await tmpdir({ git: true })
    const target = path.join(tmp.path, "world.md")
    const original = "# 世界\r\n\r\n旧内容\r\n"
    await Bun.write(target, `\uFEFF${original}`)

    const first = await request("/file/edit", tmp.path, {
      query: { path: "world.md" },
      method: "PUT",
      body: {
        content: "# 世界\r\n\r\n新内容\r\n",
        expectedContent: original,
        expectedBom: true,
      },
    })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ type: "text", content: "# 世界\r\n\r\n新内容\r\n", bom: true })
    expect(Array.from(new Uint8Array(await Bun.file(target).arrayBuffer())).slice(0, 3)).toEqual([0xef, 0xbb, 0xbf])
    expect(await Bun.file(target).text()).toBe("# 世界\r\n\r\n新内容\r\n")

    const stale = await request("/file/edit", tmp.path, {
      query: { path: "world.md" },
      method: "PUT",
      body: {
        content: "不应覆盖",
        expectedContent: original,
        expectedBom: true,
      },
    })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ _tag: "FileEditConflictError", path: "world.md" })
    expect(await Bun.file(target).text()).toBe("# 世界\r\n\r\n新内容\r\n")
  })

  test("fails closed for missing, binary, and escaping editable targets", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "binary.bin"), new Uint8Array([0, 1, 2, 3]))
    await Bun.write(path.join(tmp.path, "invalid.txt"), new Uint8Array([0xc3, 0x28]))
    await mkdir(path.join(tmp.path, "folder"))

    const [missing, binary, invalidUtf8, directory, escaping] = await Promise.all([
      request("/file/edit", tmp.path, { query: { path: "missing.md" } }),
      request("/file/edit", tmp.path, { query: { path: "binary.bin" } }),
      request("/file/edit", tmp.path, { query: { path: "invalid.txt" } }),
      request("/file/edit", tmp.path, { query: { path: "folder" } }),
      request("/file/edit", tmp.path, { query: { path: "..\\outside.md" } }),
    ])

    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ _tag: "FileEditNotFoundError", path: "missing.md" })
    expect(binary.status).toBe(400)
    expect(await binary.json()).toMatchObject({ _tag: "FileEditInvalidError", reason: "binary" })
    expect(invalidUtf8.status).toBe(400)
    expect(await invalidUtf8.json()).toMatchObject({ _tag: "FileEditInvalidError", reason: "invalid_utf8" })
    expect(directory.status).toBe(400)
    expect(await directory.json()).toMatchObject({ _tag: "FileEditInvalidError", reason: "not_file" })
    expect(escaping.status).toBe(400)
    expect(await escaping.json()).toMatchObject({ _tag: "FileEditInvalidError", reason: "invalid_path" })
  })

  test("generated SDK reads, writes, and reports stale editable content", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "sdk.md"), "before\n")
    const handler = HttpApiApp.webHandler().handler
    const fetch = Object.assign(
      (input: RequestInfo | URL, init?: RequestInit) =>
        handler(input instanceof Request ? input : new Request(input, init), context),
      { preconnect: globalThis.fetch.preconnect },
    ) satisfies typeof globalThis.fetch
    const sdk = createOpencodeClient({
      baseUrl: "http://localhost",
      directory: tmp.path,
      fetch,
    })

    const read = await sdk.file.editable({ path: "sdk.md" })
    expect(read.response.status).toBe(200)
    expect(read.data).toEqual({ type: "text", content: "before\n", bom: false })

    const written = await sdk.file.write({
      path: "sdk.md",
      fileEditableWrite: { content: "after\n", expectedContent: "before\n", expectedBom: false },
    })
    expect(written.response.status).toBe(200)
    expect(written.data).toEqual({ type: "text", content: "after\n", bom: false })
    expect(await Bun.file(path.join(tmp.path, "sdk.md")).text()).toBe("after\n")

    const stale = await sdk.file.write({
      path: "sdk.md",
      fileEditableWrite: { content: "stale overwrite", expectedContent: "before\n", expectedBom: false },
    })
    expect(stale.response.status).toBe(409)
    expect(stale.error).toMatchObject({ _tag: "FileEditConflictError", path: "sdk.md" })
  })
})
