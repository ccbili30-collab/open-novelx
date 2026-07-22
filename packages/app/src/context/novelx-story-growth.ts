import * as NovelXStory from "@opencode-ai/schema/novelx-story"
import * as NovelXStoryVisual from "@opencode-ai/schema/novelx-story-visual"
import { Schema } from "effect"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { useSDK, type DirectorySDK } from "./sdk"

export type NovelXStoryGrowthState =
  | { status: "loading" }
  | { status: "absent" }
  | {
      status: "ready"
      materialization: NovelXStory.Materialization
      covers?: NovelXStoryVisual.Manifest
      coverAssets: Record<string, string>
    }
  | { status: "error"; message: string }

export type NovelXStoryNavigationItem =
  | { id: string; kind: "root" | "group" | "work" | "theme"; label: string; depth: 0 | 1 | 2; targetPath?: undefined; ownerId?: string }
  | { id: string; kind: "document"; label: string; depth: 2 | 3; targetPath: string; ownerId?: string }

const isNotFound = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false
  const value = error as Record<string, unknown>
  if (value._tag === "FileEditNotFoundError" || value.status === 404 || value.statusCode === 404) return true
  return isNotFound(value.body) || isNotFound(value.cause)
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function sha256(value: unknown) {
  if (!globalThis.crypto?.subtle) throw new Error("当前运行环境无法校验故事生长状态。")
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function parseNovelXStoryMaterialization(content: string) {
  const manifest = Schema.decodeUnknownSync(NovelXStory.Materialization)(JSON.parse(content))
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("故事生长状态完整性校验失败。")
  return manifest
}

export async function parseNovelXStoryCovers(content: string, storyIntegritySha256: string) {
  const manifest = Schema.decodeUnknownSync(NovelXStoryVisual.Manifest)(JSON.parse(content))
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("故事封面状态完整性校验失败。")
  if (manifest.storyMaterializationIntegritySha256 !== storyIntegritySha256) throw new Error("故事封面与当前正文不匹配。")
  return manifest
}

export function createNovelXStoryGrowthController() {
  const sdk = useSDK()
  const [state, setState] = createSignal<NovelXStoryGrowthState>({ status: "loading" })
  let version = 0
  const load = async (current: DirectorySDK) => {
    const run = ++version
    try {
      const storyResult = await current.client.file.editable({ path: NovelXStory.MATERIALIZATION_PATH })
      if (run !== version) return
      if (storyResult.response.status === 404 || isNotFound(storyResult.error)) {
        setState({ status: "absent" })
        return
      }
      if (!storyResult.data) throw storyResult.error ?? new Error("故事生长状态缺失。")
      const materialization = await parseNovelXStoryMaterialization(storyResult.data.content)
      const coverResult = await current.client.file.editable({ path: NovelXStoryVisual.MANIFEST_PATH }).catch((error) => {
        if (!isNotFound(error)) throw error
        return undefined
      })
      if (run !== version) return
      if (!coverResult?.data || coverResult.response.status === 404 || isNotFound(coverResult.error)) {
        setState({ status: "ready", materialization, coverAssets: {} })
        return
      }
      const covers = await parseNovelXStoryCovers(coverResult.data.content, materialization.integritySha256)
      const entries = await Promise.all(
        covers.tasks
          .filter((task) => task.status === "attached" && task.mime)
          .map(async (task) => {
            const response = await current.client.file.read({ path: task.targetPath })
            if (response.data?.type !== "binary" || response.data.encoding !== "base64") return
            return [task.id, `data:${response.data.mimeType ?? task.mime};base64,${response.data.content}`] as const
          }),
      )
      if (run !== version) return
      setState({
        status: "ready",
        materialization,
        covers,
        coverAssets: Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => !!entry)),
      })
    } catch (error) {
      if (run !== version) return
      if (isNotFound(error)) setState({ status: "absent" })
      else setState({ status: "error", message: message(error) })
    }
  }
  createEffect(() => {
    const current = sdk()
    void load(current)
    const stop = current.event.listen((event) => {
      if (event.details.type !== "file.watcher.updated" && event.details.type !== "file.edited") return
      const file = (event.details.properties as { file?: unknown } | undefined)?.file
      if (typeof file !== "string") return
      const normalized = file.replaceAll("\\", "/")
      if (!normalized.includes("story-materialization.json") && !normalized.includes("story-covers.json") && !normalized.includes("Stories/")) return
      void load(current)
    })
    onCleanup(stop)
  })
  return { state, reload: () => load(sdk()) }
}

export function novelXStoryNavigationItems(manifest: NovelXStory.Materialization): NovelXStoryNavigationItem[] {
  if (!manifest.novel) return []
  const records = new Map(manifest.documents.map((document) => [document.id, document]))
  return [
    { id: manifest.novel.id, kind: "root", label: manifest.novel.title, depth: 0, ownerId: manifest.novel.id },
    { id: "story:novel", kind: "group", label: "小说", depth: 1 },
    { id: manifest.novel.theme.id, kind: "theme", label: manifest.novel.theme.title, depth: 2, ownerId: manifest.novel.theme.id },
    ...manifest.novel.chapters.flatMap((id) => {
      const record = records.get(id)
      return record ? [{ id, kind: "document" as const, label: record.title, depth: 3 as const, targetPath: record.targetPath, ownerId: manifest.novel!.id }] : []
    }),
    { id: "story:history", kind: "group", label: "历史", depth: 1 },
    ...manifest.historyBooks.flatMap((book) => [
      { id: book.id, kind: "work" as const, label: book.title, depth: 2 as const, ownerId: book.id },
      ...book.chapterIds.flatMap((id) => {
        const record = records.get(id)
        return record ? [{ id, kind: "document" as const, label: record.title, depth: 3 as const, targetPath: record.targetPath, ownerId: book.id }] : []
      }),
    ]),
    { id: "story:references", kind: "group", label: "文献", depth: 1 },
    ...manifest.references.flatMap((reference) => {
      const record = records.get(reference.documentId)
      return record ? [{ id: record.id, kind: "document" as const, label: reference.title, depth: 2 as const, targetPath: record.targetPath }] : []
    }),
  ]
}
