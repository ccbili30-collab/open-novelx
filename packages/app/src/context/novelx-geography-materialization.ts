import { NovelXGrowth } from "@opencode-ai/schema"
import { Schema } from "effect"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { useSDK, type DirectorySDK } from "./sdk"

export type NovelXGeographyMaterializationState =
  | { status: "loading" }
  | { status: "absent" }
  | { status: "ready"; manifest: NovelXGrowth.GeographyMaterialization }
  | { status: "error"; message: string }

const errorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return "无法读取地理生长状态。"
}

const isNotFound = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false
  const value = error as Record<string, unknown>
  if (value._tag === "FileEditNotFoundError" || value.status === 404 || value.statusCode === 404) return true
  return isNotFound(value.body) || isNotFound(value.cause)
}

const matchesPath = (value: string) => {
  const normalized = value.replaceAll("\\", "/").toLocaleLowerCase()
  const expected = NovelXGrowth.MATERIALIZATION_PATH.toLocaleLowerCase()
  return normalized === expected || normalized.endsWith(`/${expected}`)
}

async function sha256(value: unknown) {
  if (!globalThis.crypto?.subtle) throw new Error("当前运行环境无法校验地理生长状态完整性。")
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function parseNovelXGeographyMaterialization(content: string, skeletonIntegritySha256: string) {
  const manifest = Schema.decodeUnknownSync(NovelXGrowth.GeographyMaterialization)(JSON.parse(content))
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("地理生长状态完整性校验失败。")
  if (manifest.skeletonIntegritySha256 !== skeletonIntegritySha256) {
    throw new Error("地理生长状态与当前世界骨架不匹配。")
  }
  return manifest
}

export function createNovelXGeographyMaterializationController(skeletonIntegritySha256: () => string | undefined) {
  const sdk = useSDK()
  const [state, setState] = createSignal<NovelXGeographyMaterializationState>({ status: "loading" })
  let loadVersion = 0

  const load = async (current: DirectorySDK) => {
    const version = ++loadVersion
    const skeleton = skeletonIntegritySha256()
    if (!skeleton) {
      setState({ status: "absent" })
      return
    }
    setState({ status: "loading" })
    try {
      const result = await current.client.file.editable({ path: NovelXGrowth.MATERIALIZATION_PATH })
      if (version !== loadVersion) return
      if (result.response.status === 404 || isNotFound(result.error)) {
        setState({ status: "absent" })
        return
      }
      if (!result.data) {
        setState({ status: "error", message: errorMessage(result.error) })
        return
      }
      const manifest = await parseNovelXGeographyMaterialization(result.data.content, skeleton)
      if (version !== loadVersion) return
      setState({ status: "ready", manifest })
    } catch (error) {
      if (version !== loadVersion) return
      if (isNotFound(error)) {
        setState({ status: "absent" })
        return
      }
      setState({ status: "error", message: errorMessage(error) })
    }
  }

  createEffect(() => {
    const current = sdk()
    skeletonIntegritySha256()
    void load(current)
    const stop = current.event.listen((event) => {
      if (event.details.type !== "file.watcher.updated" && event.details.type !== "file.edited") return
      const properties = event.details.properties as { file?: unknown } | undefined
      if (typeof properties?.file !== "string" || !matchesPath(properties.file)) return
      void load(current)
    })
    onCleanup(stop)
  })

  return {
    state,
    reload() {
      void load(sdk())
    },
  }
}

export const novelXGeographyStatusLabel = (status: NovelXGrowth.GeographyDocumentStatus | undefined) =>
  ({
    registered: "已注册",
    leased: "已分配",
    drafting: "正在写作",
    submitted: "已返回主编",
    reviewing: "主编审核中",
    committed: "已提交",
    failed: "失败",
    waiting_user: "等待用户",
  })[status ?? "registered"]
