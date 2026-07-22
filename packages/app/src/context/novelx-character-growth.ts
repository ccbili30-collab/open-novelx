import { NovelXCharacter } from "@opencode-ai/schema/novelx-character"
import * as NovelXCharacterVisual from "@opencode-ai/schema/novelx-character-visual"
import { Schema } from "effect"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { useSDK, type DirectorySDK } from "./sdk"

export type NovelXCharacterGrowthState =
  | { status: "loading" }
  | { status: "absent" }
  | {
      status: "ready"
      materialization: NovelXCharacter.Materialization
      portrait?: NovelXCharacterVisual.Manifest
      portraitAsset?: string
    }
  | { status: "error"; message: string }

const isNotFound = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false
  const value = error as Record<string, unknown>
  if (value._tag === "FileEditNotFoundError" || value.status === 404 || value.statusCode === 404) return true
  return isNotFound(value.body) || isNotFound(value.cause)
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function sha256(value: unknown) {
  if (!globalThis.crypto?.subtle) throw new Error("当前运行环境无法校验角色生长状态。")
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function parseNovelXCharacterMaterialization(content: string) {
  const manifest = Schema.decodeUnknownSync(NovelXCharacter.Materialization)(JSON.parse(content))
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("角色生长状态完整性校验失败。")
  return manifest
}

export async function parseNovelXCharacterPortrait(content: string, characterIntegritySha256: string) {
  const manifest = Schema.decodeUnknownSync(NovelXCharacterVisual.Manifest)(JSON.parse(content))
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("角色立绘状态完整性校验失败。")
  if (manifest.characterMaterializationIntegritySha256 !== characterIntegritySha256) {
    throw new Error("角色立绘与当前角色档案不匹配。")
  }
  return manifest
}

export function createNovelXCharacterGrowthController() {
  const sdk = useSDK()
  const [state, setState] = createSignal<NovelXCharacterGrowthState>({ status: "loading" })
  let version = 0
  const load = async (current: DirectorySDK) => {
    const run = ++version
    try {
      const characterResult = await current.client.file.editable({ path: NovelXCharacter.MATERIALIZATION_PATH })
      if (run !== version) return
      if (characterResult.response.status === 404 || isNotFound(characterResult.error)) {
        setState({ status: "absent" })
        return
      }
      if (!characterResult.data) throw characterResult.error ?? new Error("角色生长状态缺失。")
      const materialization = await parseNovelXCharacterMaterialization(characterResult.data.content)
      const portraitResult = await current.client.file
        .editable({ path: NovelXCharacterVisual.MANIFEST_PATH })
        .catch((error) => {
          if (!isNotFound(error)) throw error
          return undefined
        })
      if (run !== version) return
      if (!portraitResult?.data || portraitResult.response.status === 404 || isNotFound(portraitResult.error)) {
        setState({ status: "ready", materialization })
        return
      }
      const portrait = await parseNovelXCharacterPortrait(portraitResult.data.content, materialization.integritySha256)
      let portraitAsset: string | undefined
      if (portrait.task.status === "attached" && portrait.task.mime) {
        const response = await current.client.file.read({ path: portrait.task.targetPath })
        if (response.data?.type === "binary" && response.data.encoding === "base64") {
          portraitAsset = `data:${response.data.mimeType ?? portrait.task.mime};base64,${response.data.content}`
        }
      }
      if (run !== version) return
      setState({ status: "ready", materialization, portrait, portraitAsset })
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
      if (
        !normalized.includes("character-materialization.json") &&
        !normalized.includes("character-portrait.json") &&
        !normalized.includes("Characters/")
      )
        return
      void load(current)
    })
    onCleanup(stop)
  })
  return { state, reload: () => void load(sdk()) }
}

