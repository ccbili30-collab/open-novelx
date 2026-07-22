import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"
import { isNovelXHiddenProjectPath } from "./novelx-project-files"
import { useSDK } from "./sdk"
import {
  projectNovelXFileGraph,
  type NovelXProjectGraphDocument,
  type NovelXProjectGraphResult,
} from "@/pages/session/novelx-project-graph-model"

type ProjectFileNode = {
  name: string
  path: string
  type: "file" | "directory"
  ignored: boolean
}

type ProjectGraphEvent = {
  details: {
    type: string
    properties?: unknown
  }
}

export type NovelXProjectGraphSDK = {
  directory: string
  client: {
    file: {
      list(input: { path: string }): Promise<{ data?: readonly ProjectFileNode[] }>
      editable(input: { path: string }): Promise<{ data?: { content: string }; error?: unknown }>
    }
  }
  event?: {
    listen(listener: (event: ProjectGraphEvent) => void): () => void
  }
}

export type NovelXIndexedProjectGraph = NovelXProjectGraphResult & {
  truncated: boolean
}

export type NovelXProjectGraphState =
  | { status: "idle" }
  | { status: "loading"; previous?: NovelXIndexedProjectGraph }
  | { status: "ready"; result: NovelXIndexedProjectGraph; refreshedAt: number }
  | { status: "error"; message: string; previous?: NovelXIndexedProjectGraph }

type ProjectGraphLimits = {
  maxDirectories: number
  maxDocuments: number
  maxDepth: number
  readConcurrency: number
}

const DEFAULT_LIMITS: ProjectGraphLimits = {
  maxDirectories: 200,
  maxDocuments: 300,
  maxDepth: 12,
  readConcurrency: 6,
}

const DOCUMENT_EXTENSIONS = new Set(["md", "markdown", "txt", "rst", "adoc"])

const normalize = (value: string) => value.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "")

export function isNovelXProjectGraphDocumentPath(value: string) {
  const name = normalize(value).split("/").at(-1) ?? ""
  const extension = name.includes(".") ? name.split(".").at(-1)?.toLocaleLowerCase() : undefined
  return extension ? DOCUMENT_EXTENSIONS.has(extension) : false
}

const errorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message
  if (typeof error === "string" && error) return error
  return "无法读取项目文档。"
}

const eventFile = (properties: unknown) => {
  if (!properties || typeof properties !== "object" || !("file" in properties)) return undefined
  return typeof properties.file === "string" ? properties.file : undefined
}

const projectName = (directory: string) => normalize(directory).split("/").at(-1) || "当前项目"

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, transform: (item: T) => Promise<R>) {
  const results: R[] = Array.from({ length: items.length })
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      const item = items[index]
      if (item === undefined) continue
      results[index] = await transform(item)
    }
  }
  const count = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: count }, () => worker()))
  return results
}

export async function loadNovelXProjectGraph(
  sdk: NovelXProjectGraphSDK,
  overrides: Partial<ProjectGraphLimits> = {},
): Promise<NovelXIndexedProjectGraph> {
  const limits = { ...DEFAULT_LIMITS, ...overrides }
  const queue = [{ path: "", depth: 0 }]
  const visited = new Set<string>()
  const paths: string[] = []
  let directories = 0
  let truncated = false

  while (queue.length) {
    const current = queue.shift()
    if (!current) continue
    const key = normalize(current.path).toLocaleLowerCase()
    if (visited.has(key)) continue
    visited.add(key)
    const response = await sdk.client.file.list({ path: current.path })
    if (!response.data) throw new Error(`无法列出项目目录：${current.path || "."}`)
    const entries = [...response.data].sort((a, b) => normalize(a.path).localeCompare(normalize(b.path)))
    for (const entry of entries) {
      const path = normalize(entry.path)
      if (!path || entry.ignored || isNovelXHiddenProjectPath(path)) continue
      if (entry.type === "directory") {
        if (current.depth >= limits.maxDepth || directories >= limits.maxDirectories) {
          truncated = true
          continue
        }
        directories += 1
        queue.push({ path, depth: current.depth + 1 })
        continue
      }
      if (!isNovelXProjectGraphDocumentPath(path)) continue
      if (paths.length >= limits.maxDocuments) {
        truncated = true
        continue
      }
      paths.push(path)
    }
  }

  const documents = await mapConcurrent(
    paths,
    limits.readConcurrency,
    async (path): Promise<NovelXProjectGraphDocument> => {
      const response = await sdk.client.file.editable({ path })
      if (!response.data) throw new Error(`无法读取项目文档 ${path}：${errorMessage(response.error)}`)
      return { path, content: response.data.content }
    },
  )
  return { ...projectNovelXFileGraph({ projectName: projectName(sdk.directory), documents }), truncated }
}

const previousResult = (state: NovelXProjectGraphState) => {
  if (state.status === "ready") return state.result
  if (state.status === "loading" || state.status === "error") return state.previous
  return undefined
}

export function createNovelXProjectGraphController(input?: { sdk: Accessor<NovelXProjectGraphSDK> }) {
  const sdk = input?.sdk ?? useSDK()
  const [state, setState] = createSignal<NovelXProjectGraphState>({ status: "idle" })
  let version = 0

  const load = async (current: NovelXProjectGraphSDK) => {
    const run = ++version
    const previous = previousResult(state())
    setState({ status: "loading", previous })
    try {
      const result = await loadNovelXProjectGraph(current)
      if (run !== version) return
      setState({ status: "ready", result, refreshedAt: Date.now() })
    } catch (error) {
      if (run !== version) return
      setState({ status: "error", message: errorMessage(error), previous })
    }
  }

  createEffect(() => {
    const current = sdk()
    current.directory
    version += 1
    setState({ status: "idle" })
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = current.event?.listen((event) => {
      if (event.details.type !== "file.watcher.updated" && event.details.type !== "file.edited") return
      const currentState = state()
      if (currentState.status !== "ready" && !(currentState.status === "error" && currentState.previous)) return
      const file = eventFile(event.details.properties)
      if (!file || isNovelXHiddenProjectPath(file)) return
      const name = normalize(file).split("/").at(-1) ?? ""
      if (name.includes(".") && !isNovelXProjectGraphDocumentPath(file)) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void load(current), 250)
    })
    onCleanup(() => {
      version += 1
      if (timer) clearTimeout(timer)
      stop?.()
    })
  })

  return {
    state,
    reload: () => load(sdk()),
  }
}
