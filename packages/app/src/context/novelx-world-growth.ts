import { NovelXWorld, NovelXWorldPublication, NovelXWorldVisual } from "@opencode-ai/schema"
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
      publication?: NovelXWorldPublication.Manifest
      publicationTexts?: Record<string, { atlas?: string; travelogue?: string }>
      warnings?: readonly string[]
    }
  | { status: "error"; message: string }

export type NovelXWorldNavigationItem =
  | { id: string; kind: "root"; label: string; depth: 0; stageId: "" }
  | { id: string; kind: "stage"; label: string; depth: 1; stageId: string }
  | { id: string; kind: "editor"; label: string; depth: 2; stageId: string; sessionId: string }
  | { id: string; kind: "entity"; label: string; depth: 2 | 3; stageId: string; typeLabel: string }

export type NovelXWorldMapMode = "art" | "geography" | "human" | "semantic"

export type NovelXWorldMapSelection =
  | { state: "idle" }
  | { state: "highlighted"; entityId: string }
  | { state: "focused"; entityId: string }

export function advanceNovelXWorldMapSelection(
  current: NovelXWorldMapSelection,
  entityId: string,
): NovelXWorldMapSelection {
  if (current.state === "idle" || current.entityId !== entityId) return { state: "highlighted", entityId }
  if (current.state === "highlighted") return { state: "focused", entityId }
  return { state: "idle" }
}

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
  const entityId = mode === "geography" ? cell.geographyAreaEntityId : cell.humanAreaEntityId
  return entityId
    ? visual.atlas.features.find(
        (feature) => feature.layer === layer && feature.geometry === "area" && feature.entityId === entityId,
      )
    : undefined
}

export function resolveNovelXWorldMapRasterTask(
  visual: NovelXWorldVisual.Manifest,
  mode: NovelXWorldMapMode,
  selection: NovelXWorldMapSelection,
) {
  const base = visual.tasks.find(
    (task) => task.type === "map" && (visual.schemaVersion === 2 || task.mapRole === "base"),
  )
  if (!base || selection.state === "idle" || mode === "art" || mode === "semantic") return base
  const layer = mode === "geography" ? "geography" : "human"
  return (
    visual.tasks.find(
      (task) =>
        task.type === "map" &&
        task.mapRole === "variant" &&
        task.layer === layer &&
        task.entityId === selection.entityId &&
        task.status === "attached",
    ) ?? base
  )
}

export function novelXWorldMapVariantProgress(visual: NovelXWorldVisual.Manifest, layer?: "geography" | "human") {
  const variants = visual.tasks.filter(
    (task) => task.type === "map" && task.mapRole === "variant" && (!layer || task.layer === layer),
  )
  const attached = variants.filter((task) => task.status === "attached").length
  const failed = variants.filter((task) => task.status === "failed").length
  return { total: variants.length, attached, failed, pending: variants.length - attached - failed }
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
    NovelXWorldPublication.MANIFEST_PATH,
    "World/Media/",
    `${NovelXWorldPublication.PUBLICATION_DIRECTORY}/`,
  ].some((path) => {
    const expected = path.toLocaleLowerCase()
    if (expected.endsWith("/")) return normalized.includes(`/${expected}`) || normalized.startsWith(expected)
    return normalized === expected || normalized.endsWith(`/${expected}`)
  })
}

export async function parseNovelXWorldVisuals(content: string, worldMaterializationIntegritySha256: string) {
  const value = JSON.parse(content) as { schemaVersion?: unknown }
  if (value.schemaVersion !== 2 && value.schemaVersion !== 3) throw new Error("地图数据已过期，需要重新生成。")
  const manifest = Schema.decodeUnknownSync(NovelXWorldVisual.Manifest)(value)
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("世界视觉状态完整性校验失败。")
  if (manifest.worldMaterializationIntegritySha256 !== worldMaterializationIntegritySha256) {
    throw new Error("世界视觉状态与当前世界事实不匹配。")
  }
  return manifest
}

export async function parseNovelXWorldPublication(
  content: string,
  worldMaterializationIntegritySha256: string,
  worldVisualIntegritySha256: string,
) {
  const manifest = Schema.decodeUnknownSync(NovelXWorldPublication.Manifest)(JSON.parse(content))
  const { integritySha256, ...draft } = manifest
  if ((await sha256(draft)) !== integritySha256) throw new Error("玩家世界文稿完整性校验失败。")
  if (
    manifest.worldMaterializationIntegritySha256 !== worldMaterializationIntegritySha256 ||
    manifest.worldVisualIntegritySha256 !== worldVisualIntegritySha256
  ) {
    throw new Error("玩家世界文稿与当前世界事实不匹配。")
  }
  return manifest
}

export async function projectNovelXWorldPublication(
  content: string,
  worldMaterializationIntegritySha256: string,
  worldVisualIntegritySha256: string,
): Promise<{ publication?: NovelXWorldPublication.Manifest; warning?: string }> {
  try {
    return {
      publication: await parseNovelXWorldPublication(
        content,
        worldMaterializationIntegritySha256,
        worldVisualIntegritySha256,
      ),
    }
  } catch (error) {
    return { publication: undefined, warning: errorMessage(error) }
  }
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
      const publicationResult = await current.client.file
        .editable({ path: NovelXWorldPublication.MANIFEST_PATH })
        .catch((error) => {
          if (!isNotFound(error)) throw error
          return undefined
        })
      if (version !== loadVersion) return
      const publicationProjection =
        publicationResult?.data && publicationResult.response.status !== 404
          ? await projectNovelXWorldPublication(
              publicationResult.data.content,
              materialization.integritySha256,
              visual.integritySha256,
            )
          : {}
      const publication = publicationProjection.publication
      const publicationEntries = publication
        ? await Promise.all(
            publication.records
              .filter((record) => record.status === "committed")
              .map(async (record) => {
                const response = await current.client.file.editable({ path: record.targetPath })
                if (!response.data) return undefined
                return [record.entityId, record.kind, response.data.content] as const
              }),
          )
        : []
      if (version !== loadVersion) return
      const publicationTexts = publicationEntries.reduce<Record<string, { atlas?: string; travelogue?: string }>>(
        (result, entry) => {
          if (!entry) return result
          result[entry[0]] = { ...result[entry[0]], [entry[1]]: entry[2] }
          return result
        },
        {},
      )
      setState({
        status: "ready",
        blueprint,
        materialization,
        visual,
        visualAssets: Object.fromEntries(assetEntries.filter((entry): entry is NonNullable<typeof entry> => !!entry)),
        publication,
        publicationTexts,
        warnings: publicationProjection.warning ? [publicationProjection.warning] : undefined,
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
      return load(sdk())
    },
  }
}

export function novelXWorldNavigationItems(
  blueprint: NovelXWorld.BlueprintManifest,
  materialization?: NovelXWorld.WorldMaterialization,
): NovelXWorldNavigationItem[] {
  const records = new Map(materialization?.stages.map((stage) => [stage.stageId, stage]) ?? [])
  if (materialization?.status === "completed") {
    return [
      {
        id: `world-atlas:${blueprint.integritySha256}`,
        kind: "root" as const,
        label: `${blueprint.profile.title} · 世界图册`,
        depth: 0 as const,
        stageId: "" as const,
      },
      ...blueprint.stages.flatMap((stage) => [
        { id: stage.id, kind: "stage" as const, label: stage.label, depth: 1 as const, stageId: stage.id },
        ...(records.get(stage.id)?.entities.map((entity) => ({
          id: entity.id,
          kind: "entity" as const,
          label: entity.name,
          depth: 2 as const,
          stageId: stage.id,
          typeLabel: entity.typeLabel,
        })) ?? []),
      ]),
    ]
  }
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
