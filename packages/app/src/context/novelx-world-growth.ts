import { NovelXWorld, NovelXWorldVisual } from "@opencode-ai/schema"
import { Schema } from "effect"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { useSDK, type DirectorySDK } from "./sdk"

export type NovelXWorldGrowthState =
  | { status: "loading" }
  | { status: "absent" }
  | {
      status: "ready"
      blueprint: NovelXWorld.BlueprintManifest
      materialization?: NovelXWorld.WorldMaterialization
      visual?: NovelXWorldVisual.Manifest
      visualAssets?: Record<string, string>
    }
  | { status: "error"; message: string }

export type NovelXWorldNavigationItem =
  | { id: string; kind: "root"; label: string; depth: 0; stageId: "" }
  | { id: string; kind: "stage"; label: string; depth: 1; stageId: string }
  | { id: string; kind: "editor"; label: string; depth: 2; stageId: string; sessionId: string }
  | { id: string; kind: "entity"; label: string; depth: 3; stageId: string; typeLabel: string }

export type NovelXWorldMapMode = "art" | "geography" | "human" | "semantic"

export function resolveNovelXWorldMapFeature(
  visual: NovelXWorldVisual.Manifest,
  mode: NovelXWorldMapMode,
  input: { cellId?: string; explicitEntityId?: string },
) {
  if (mode === "art" || mode === "semantic") return undefined
  const layer = mode === "geography" ? "geography" : "human"
  if (input.explicitEntityId) {
    return visual.atlas.features.find(
      (feature) => feature.layer === layer && feature.entityId === input.explicitEntityId,
    )
  }
  const cell = visual.atlas.cells.find((candidate) => candidate.id === input.cellId)
  if (!cell) return undefined
  const ids = new Set(mode === "geography" ? cell.geographyEntityIds : cell.humanEntityIds)
  const importance = { required: 3, notable: 2, ordinary: 1 } as const
  return visual.atlas.features
    .filter((feature) => feature.layer === layer && ids.has(feature.entityId))
    .filter((feature) => mode !== "geography" || feature.kind !== "river")
    .toSorted((left, right) => importance[right.importance] - importance[left.importance])[0]
}

const errorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return "无法读取世界生长状态。"
}

const isNotFound = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false
  const value = error as Record<string, unknown>
  if (value._tag === "FileEditNotFoundError" || value.status === 404 || value.statusCode === 404) return true
  return isNotFound(value.body) || isNotFound(value.cause)
}

const matchesWorldPath = (value: string) => {
  const normalized = value.replaceAll("\\", "/").toLocaleLowerCase()
  return [
    NovelXWorld.BLUEPRINT_PATH,
    NovelXWorld.MATERIALIZATION_PATH,
    NovelXWorldVisual.MANIFEST_PATH,
    "World/Media/",
  ].some((path) => {
    const expected = path.toLocaleLowerCase()
    if (expected.endsWith("/")) return normalized.includes(`/${expected}`) || normalized.startsWith(expected)
    return normalized === expected || normalized.endsWith(`/${expected}`)
  })
}

export async function parseNovelXWorldVisuals(content: string, worldMaterializationIntegritySha256: string) {
  const manifest = Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(JSON.parse(content))
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("世界视觉状态完整性校验失败。")
  if (manifest.worldMaterializationIntegritySha256 !== worldMaterializationIntegritySha256) {
    throw new Error("世界视觉状态与当前世界事实不匹配。")
  }
  return manifest
}

async function sha256(value: unknown) {
  if (!globalThis.crypto?.subtle) throw new Error("当前运行环境无法校验世界生长状态完整性。")
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function parseNovelXWorldBlueprint(content: string) {
  const manifest = Schema.decodeUnknownSync(NovelXWorld.BlueprintManifest)(JSON.parse(content))
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("世界蓝图完整性校验失败。")
  if ((await sha256(manifest.profile)) !== manifest.source.profileSha256) throw new Error("世界蓝图配置校验失败。")
  return manifest
}

export async function parseNovelXWorldMaterialization(content: string, blueprintIntegritySha256: string) {
  const manifest = Schema.decodeUnknownSync(NovelXWorld.WorldMaterialization)(JSON.parse(content))
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("世界生长状态完整性校验失败。")
  if (manifest.blueprintIntegritySha256 !== blueprintIntegritySha256) {
    throw new Error("世界生长状态与当前蓝图不匹配。")
  }
  return manifest
}

export function createNovelXWorldGrowthController() {
  const sdk = useSDK()
  const [state, setState] = createSignal<NovelXWorldGrowthState>({ status: "loading" })
  let loadVersion = 0

  const load = async (current: DirectorySDK) => {
    const version = ++loadVersion
    setState({ status: "loading" })
    try {
      const blueprintResult = await current.client.file.editable({ path: NovelXWorld.BLUEPRINT_PATH })
      if (version !== loadVersion) return
      if (blueprintResult.response.status === 404 || isNotFound(blueprintResult.error)) {
        setState({ status: "absent" })
        return
      }
      if (!blueprintResult.data) {
        setState({ status: "error", message: errorMessage(blueprintResult.error) })
        return
      }
      const blueprint = await parseNovelXWorldBlueprint(blueprintResult.data.content)
      const materializationResult = await current.client.file.editable({ path: NovelXWorld.MATERIALIZATION_PATH })
      if (version !== loadVersion) return
      if (materializationResult.response.status === 404 || isNotFound(materializationResult.error)) {
        setState({ status: "ready", blueprint })
        return
      }
      if (!materializationResult.data) {
        setState({ status: "error", message: errorMessage(materializationResult.error) })
        return
      }
      const materialization = await parseNovelXWorldMaterialization(
        materializationResult.data.content,
        blueprint.integritySha256,
      )
      if (version !== loadVersion) return
      const visualResult = await current.client.file
        .editable({ path: NovelXWorldVisual.MANIFEST_PATH })
        .catch((error) => {
          if (!isNotFound(error)) throw error
          return undefined
        })
      if (version !== loadVersion) return
      if (
        !visualResult ||
        visualResult.response.status === 404 ||
        isNotFound(visualResult.error) ||
        !visualResult.data
      ) {
        setState({ status: "ready", blueprint, materialization })
        return
      }
      const visual = await parseNovelXWorldVisuals(visualResult.data.content, materialization.integritySha256)
      const assetEntries = await Promise.all(
        visual.tasks
          .filter((task) => task.status === "attached" && task.mime)
          .map(async (task) => {
            const response = await current.client.file.read({ path: task.targetPath })
            if (response.data?.type !== "binary" || response.data.encoding !== "base64") return undefined
            return [task.id, `data:${response.data.mimeType ?? task.mime};base64,${response.data.content}`] as const
          }),
      )
      if (version !== loadVersion) return
      setState({
        status: "ready",
        blueprint,
        materialization,
        visual,
        visualAssets: Object.fromEntries(assetEntries.filter((entry): entry is NonNullable<typeof entry> => !!entry)),
      })
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
      if (typeof properties?.file !== "string" || !matchesWorldPath(properties.file)) return
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

export function novelXWorldNavigationItems(
  blueprint: NovelXWorld.BlueprintManifest,
  materialization?: NovelXWorld.WorldMaterialization,
): NovelXWorldNavigationItem[] {
  const records = new Map(materialization?.stages.map((stage) => [stage.stageId, stage]) ?? [])
  return [
    {
      id: `growth:${materialization?.growthSessionId ?? blueprint.source.sessionId}`,
      kind: "root" as const,
      label: "Growth 总主编",
      depth: 0 as const,
      stageId: "" as const,
    },
    ...blueprint.stages.flatMap((stage) => [
      { id: stage.id, kind: "stage" as const, label: stage.label, depth: 1 as const, stageId: stage.id },
      ...(records.get(stage.id)?.editorSessionId
        ? [
            {
              id: records.get(stage.id)!.editorSessionId!,
              kind: "editor" as const,
              label: "阶段主编",
              depth: 2 as const,
              stageId: stage.id,
              sessionId: records.get(stage.id)!.editorSessionId!,
            },
          ]
        : []),
      ...(records.get(stage.id)?.entities.map((entity) => ({
        id: entity.id,
        kind: "entity" as const,
        label: entity.name,
        depth: 3 as const,
        stageId: stage.id,
        typeLabel: entity.typeLabel,
      })) ?? []),
    ]),
  ]
}

export const novelXWorldStatusLabel = (status: NovelXWorld.WorldDocumentStatus | undefined) =>
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
