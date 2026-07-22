import { NovelXGrowth } from "@opencode-ai/schema"
import { Schema } from "effect"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { useSDK, type DirectorySDK } from "./sdk"

export type NovelXGrowthSkeletonState =
  | { status: "loading" }
  | { status: "absent" }
  | { status: "ready"; manifest: NovelXGrowth.Manifest }
  | { status: "error"; message: string }

const errorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return "无法读取生长骨架。"
}

const isNotFound = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false
  const value = error as Record<string, unknown>
  if (value._tag === "FileEditNotFoundError" || value.status === 404 || value.statusCode === 404) return true
  return isNotFound(value.body) || isNotFound(value.cause)
}

const matchesManifestPath = (value: string) => {
  const normalized = value.replaceAll("\\", "/").toLocaleLowerCase()
  const manifest = NovelXGrowth.MANIFEST_PATH.toLocaleLowerCase()
  return normalized === manifest || normalized.endsWith(`/${manifest}`)
}

async function sha256(value: unknown) {
  if (!globalThis.crypto?.subtle) throw new Error("当前运行环境无法校验生长骨架完整性。")
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function parseNovelXGrowthSkeleton(content: string) {
  const manifest = Schema.decodeUnknownSync(NovelXGrowth.Manifest)(JSON.parse(content))
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("生长骨架完整性校验失败。")
  if ((await sha256(manifest.profile)) !== manifest.source.profileSha256) {
    throw new Error("生长骨架配置校验失败。")
  }
  return manifest
}

export function createNovelXGrowthSkeletonController() {
  const sdk = useSDK()
  const [state, setState] = createSignal<NovelXGrowthSkeletonState>({ status: "loading" })
  let loadVersion = 0

  const load = async (current: DirectorySDK) => {
    const version = ++loadVersion
    setState({ status: "loading" })
    try {
      const result = await current.client.file.editable({ path: NovelXGrowth.MANIFEST_PATH })
      if (version !== loadVersion) return
      if (result.response.status === 404 || isNotFound(result.error)) {
        setState({ status: "absent" })
        return
      }
      if (!result.data) {
        setState({ status: "error", message: errorMessage(result.error) })
        return
      }
      const manifest = await parseNovelXGrowthSkeleton(result.data.content)
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
    void load(current)
    const stop = current.event.listen((event) => {
      if (event.details.type !== "file.watcher.updated" && event.details.type !== "file.edited") return
      const properties = event.details.properties as { file?: unknown } | undefined
      if (typeof properties?.file !== "string" || !matchesManifestPath(properties.file)) return
      void load(current)
    })
    onCleanup(stop)
  })

  return {
    state,
    reload() {
      return load(sdk())
    },
  }
}

export type NovelXGrowthNavigationItem = {
  id: string
  label: string
  resource: "files" | "world" | "characters" | "graph" | "story" | "package"
  kind: "terrain"
  depth: number
  parentLabel?: string
}

export function novelXGrowthNavigationItems(
  manifest: NovelXGrowth.Manifest,
  resource: NovelXGrowthNavigationItem["resource"],
): NovelXGrowthNavigationItem[] {
  if (resource !== "world") return []
  const children = new Map<string | null, NovelXGrowth.RegisteredTerrainNode[]>()
  for (const node of manifest.terrain.nodes) {
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])
  }
  const byId = new Map(manifest.terrain.nodes.map((node) => [node.id, node]))
  const visit = (parentId: string | null, depth: number): NovelXGrowthNavigationItem[] =>
    (children.get(parentId) ?? []).flatMap((node) => [
      {
        id: node.id,
        label: node.name,
        resource,
        kind: "terrain" as const,
        depth,
        parentLabel: node.parentId ? byId.get(node.parentId)?.name : undefined,
      },
      ...visit(node.id, depth + 1),
    ])
  return visit(null, 0)
}
