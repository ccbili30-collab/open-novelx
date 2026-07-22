import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import {
  createNovelXProjectGraphController,
  loadNovelXProjectGraph,
  type NovelXProjectGraphSDK,
} from "./novelx-project-graph"

type Node = { name: string; path: string; absolute: string; type: "file" | "directory"; ignored: boolean }

const node = (path: string, type: Node["type"], ignored = false): Node => ({
  name: path.replaceAll("\\", "/").split("/").at(-1) ?? path,
  path,
  absolute: `C:/Project/${path}`,
  type,
  ignored,
})

function fakeSDK(input: {
  lists: Record<string, Node[] | Error>
  contents?: Record<string, string | Error | Promise<string>>
  onRead?: (path: string, phase: "start" | "end") => void
}) {
  const listeners = new Set<(event: { details: { type: string; properties?: unknown } }) => void>()
  const sdk: NovelXProjectGraphSDK = {
    directory: "C:/Project",
    client: {
      file: {
        async list({ path }) {
          const value = input.lists[path]
          if (value instanceof Error) throw value
          return { data: value ?? [] }
        },
        async editable({ path }) {
          input.onRead?.(path, "start")
          const value = await (input.contents?.[path] ?? `# ${path}`)
          input.onRead?.(path, "end")
          if (value instanceof Error) throw value
          return { data: { content: value } }
        },
      },
    },
    event: {
      listen(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  }
  return {
    sdk,
    emit: (file: string) =>
      [...listeners].forEach((listener) =>
        listener({ details: { type: "file.watcher.updated", properties: { file } } }),
      ),
  }
}

describe("loadNovelXProjectGraph", () => {
  test("recursively indexes only visible supported documents", async () => {
    const { sdk } = fakeSDK({
      lists: {
        "": [
          node("World", "directory"),
          node(".novelx", "directory"),
          node("README.md", "file"),
          node("cover.png", "file"),
        ],
        World: [node("World/北境.md", "file"), node("World/secret.md", "file", true), node("World/data.json", "file")],
      },
      contents: { "README.md": "# 项目", "World/北境.md": "# 北境" },
    })

    const result = await loadNovelXProjectGraph(sdk)

    expect(result.documentCount).toBe(2)
    expect(result.truncated).toBe(false)
    expect(result.graph.nodes.flatMap((item) => item.sourcePath ?? [])).toEqual(["README.md", "World/北境.md"])
  })

  test("limits read concurrency and reports truncation", async () => {
    let active = 0
    let peak = 0
    const files = Array.from({ length: 8 }, (_, index) => node(`World/${index}.md`, "file"))
    const { sdk } = fakeSDK({
      lists: { "": [node("World", "directory")], World: files },
      contents: Object.fromEntries(files.map((file) => [file.path, Promise.resolve(`# ${file.name}`)])),
      onRead: (_path, phase) => {
        active += phase === "start" ? 1 : -1
        peak = Math.max(peak, active)
      },
    })

    const result = await loadNovelXProjectGraph(sdk, { maxDocuments: 7, readConcurrency: 3 })

    expect(result.documentCount).toBe(7)
    expect(result.truncated).toBe(true)
    expect(peak).toBeLessThanOrEqual(3)
  })

  test("reports directory-depth truncation without traversing hidden descendants", async () => {
    const { sdk } = fakeSDK({
      lists: {
        "": [node("A", "directory")],
        A: [node("A/B", "directory")],
        "A/B": [node("A/B/deep.md", "file")],
      },
    })

    const result = await loadNovelXProjectGraph(sdk, { maxDepth: 1 })

    expect(result.documentCount).toBe(0)
    expect(result.truncated).toBe(true)
  })
})

describe("createNovelXProjectGraphController", () => {
  test("newer reload wins over a slower previous request", async () => {
    let releaseOld: ((value: string) => void) | undefined
    const oldContent = new Promise<string>((resolve) => (releaseOld = resolve))
    let listCount = 0
    const base = fakeSDK({ lists: {}, contents: { "old.md": oldContent, "new.md": "# 新文档" } })
    base.sdk.client.file.list = async () => {
      listCount += 1
      return { data: [node(listCount === 1 ? "old.md" : "new.md", "file")] }
    }

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const [sdk] = createSignal(base.sdk)
        const controller = createNovelXProjectGraphController({ sdk })
        const first = controller.reload()
        const second = controller.reload()
        void second
          .then(() => {
            releaseOld?.("# 旧文档")
            return first
          })
          .then(() => {
            const state = controller.state()
            expect(state.status).toBe("ready")
            if (state.status === "ready")
              expect(state.result.graph.nodes.some((item) => item.label === "新文档")).toBe(true)
            dispose()
            resolve()
          })
          .catch(reject)
      })
    })
  })

  test("keeps the previous graph when a refresh fails", async () => {
    const base = fakeSDK({ lists: { "": [node("README.md", "file")] } })

    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const [sdk] = createSignal(base.sdk)
        const controller = createNovelXProjectGraphController({ sdk })
        void controller
          .reload()
          .then(() => {
            base.sdk.client.file.list = async () => {
              throw new Error("list failed")
            }
            return controller.reload()
          })
          .then(() => {
            const state = controller.state()
            expect(state.status).toBe("error")
            if (state.status === "error") expect(state.previous?.documentCount).toBe(1)
            dispose()
            resolve()
          })
          .catch(reject)
      })
    })
  })
})
