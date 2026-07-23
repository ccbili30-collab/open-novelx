import { Icon } from "@opencode-ai/ui/icon"
import type { NovelXGrowth, NovelXWorld } from "@opencode-ai/schema"
import { NovelXResourceIcon } from "@/components/novelx-resource-icon"
import FileTree from "@/components/file-tree"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { NOVELX_RESOURCES, type NovelXResource } from "@/context/novelx-workspace"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { createNovelXDocumentController } from "@/context/novelx-document"
import {
  createNovelXGeographyMaterializationController,
  novelXGeographyStatusLabel,
} from "@/context/novelx-geography-materialization"
import {
  createNovelXGrowthSkeletonController,
  novelXGrowthNavigationItems,
  type NovelXGrowthNavigationItem,
} from "@/context/novelx-growth-skeleton"
import {
  createNovelXWorldGrowthController,
  novelXWorldNavigationItems,
  type NovelXWorldNavigationItem,
} from "@/context/novelx-world-growth"
import {
  createNovelXStoryGrowthController,
  novelXStoryNavigationItems,
  type NovelXStoryNavigationItem,
} from "@/context/novelx-story-growth"
import { createNovelXCharacterGrowthController } from "@/context/novelx-character-growth"
import {
  createNovelXImageQueueController,
  projectNovelXImageTasks,
  type NovelXImageTaskKind,
  type NovelXImageTaskStatus,
} from "@/context/novelx-image-queue"
import { isNovelXHiddenProjectPath } from "@/context/novelx-project-files"
import { createNovelXProjectGraphController } from "@/context/novelx-project-graph"
import { showToast } from "@/utils/toast"
import { NovelXDocumentEditor } from "./novelx-document-editor"
import { projectNovelXGraph, selectNovelXVisibleGraph } from "./novelx-graph-model"
import { NovelXGraphView } from "./novelx-graph-view"
import { NovelXWorldPackageView } from "./novelx-world-package-view"
import { createNovelXWorldPackage } from "@/novelx/world-package"
import { NovelXWorldGrowthInspector, NovelXWorldGrowthPrimary, NovelXWorldGrowthTree } from "./novelx-world-growth-view"
import { createNovelXGrowthLiveController } from "./novelx-growth-live-controller"
import { NovelXGrowthLivePanel, type NovelXGrowthLiveLabelKey } from "./novelx-growth-live-panel"
import "./novelx-document-editor.css"
import { useParams } from "@solidjs/router"
import { For, Match, Show, Switch, createEffect, createMemo, createSignal } from "solid-js"
import { novelXResourceOwnsDocument, projectNovelXDraftText, resolveNovelXResourcePath } from "./novelx-workspace-model"

const resourceLabel = (resource: NovelXResource) =>
  ({
    files: "novelx.resources.files",
    world: "novelx.resources.world",
    characters: "novelx.resources.characters",
    graph: "novelx.resources.graph",
    story: "novelx.resources.story",
    package: "novelx.resources.package",
  })[resource] as
    | "novelx.resources.files"
    | "novelx.resources.world"
    | "novelx.resources.characters"
    | "novelx.resources.graph"
    | "novelx.resources.story"
    | "novelx.resources.package"

const resourceCopy = {
  files: {
    summary: "novelx.resource.files.summary",
    emptyTitle: "novelx.resource.files.emptyTitle",
    emptyDescription: "novelx.resource.files.emptyDescription",
  },
  world: {
    summary: "novelx.resource.world.summary",
    emptyTitle: "novelx.resource.world.emptyTitle",
    emptyDescription: "novelx.resource.world.emptyDescription",
  },
  characters: {
    summary: "novelx.resource.characters.summary",
    emptyTitle: "novelx.resource.characters.emptyTitle",
    emptyDescription: "novelx.resource.characters.emptyDescription",
  },
  graph: {
    summary: "novelx.resource.graph.summary",
    emptyTitle: "novelx.resource.graph.emptyTitle",
    emptyDescription: "novelx.resource.graph.emptyDescription",
  },
  story: {
    summary: "novelx.resource.story.summary",
    emptyTitle: "novelx.resource.story.emptyTitle",
    emptyDescription: "novelx.resource.story.emptyDescription",
  },
  package: {
    summary: "novelx.resource.package.summary",
    emptyTitle: "novelx.resource.package.emptyTitle",
    emptyDescription: "novelx.resource.package.emptyDescription",
  },
} as const

const resourceScaffold = (resource: NovelXResource) => (
  <div class={`novelx-resource-scaffold is-${resource}`} aria-hidden="true">
    <Switch>
      <Match when={resource === "files"}>
        <div class="novelx-scaffold-document">
          <i />
          <i />
          <i />
          <i />
        </div>
      </Match>
      <Match when={resource === "world"}>
        <div class="novelx-scaffold-atlas-axis is-horizontal" />
        <div class="novelx-scaffold-atlas-axis is-vertical" />
      </Match>
      <Match when={resource === "characters"}>
        <div class="novelx-scaffold-character-card" />
        <div class="novelx-scaffold-character-card" />
        <div class="novelx-scaffold-character-card" />
      </Match>
      <Match when={resource === "graph"}>
        <div class="novelx-scaffold-graph-origin" />
      </Match>
      <Match when={resource === "story"}>
        <div class="novelx-scaffold-story-lane" />
        <div class="novelx-scaffold-story-lane" />
        <div class="novelx-scaffold-story-lane" />
      </Match>
      <Match when={resource === "package"}>
        <div class="novelx-scaffold-package-cover" />
        <div class="novelx-scaffold-package-lines">
          <i />
          <i />
          <i />
        </div>
      </Match>
    </Switch>
  </div>
)

const terrainKindLabel = (kind: NovelXGrowth.TerrainKind) =>
  ({
    continent: "大陆",
    ocean: "大洋",
    sea: "海域",
    island: "岛屿",
    archipelago: "群岛",
    mountain_range: "山脉",
    plateau: "高原",
    plain: "平原",
    basin: "盆地",
    valley: "谷地",
    river: "河流",
    lake: "湖泊",
    coast: "海岸",
    pass: "山口",
    canyon: "峡谷",
  })[kind]

const terrainRelationLabel = (kind: NovelXGrowth.TerrainRelationKind) =>
  ({
    adjacent_to: "相邻",
    borders: "接壤",
    crosses: "穿越",
    flows_into: "汇入",
    opens_to: "通向",
  })[kind]

const imageTaskKindLabel = (kind: NovelXImageTaskKind) =>
  ({ map: "地图", scenery: "风貌", portrait: "立绘", cover: "封面" })[kind]

const imageTaskStatusLabel = (status: NovelXImageTaskStatus) =>
  ({ queued: "等待生成", generating: "正在生成", validating: "正在校验", failed: "生成失败" })[status]

export function NovelXResourceWorkspace(props: {
  modified: () => string[]
  kinds: () => Map<string, "add" | "del" | "mix">
  rootEmpty: () => boolean
  worldStatus: () => "error" | "loading" | "empty" | "tree"
  worldError: () => string | undefined
}) {
  const file = useFile()
  const language = useLanguage()
  const layout = useLayout()
  const sdk = useSDK()
  const params = useParams<{ id?: string }>()
  const sync = useSync()
  const view = layout.novelx.project(() => sdk().directory)
  const document = createNovelXDocumentController({ path: view.activeFile })
  const growth = createNovelXGrowthSkeletonController()
  const geography = createNovelXGeographyMaterializationController(() => {
    const state = growth.state()
    return state.status === "ready" ? state.manifest.integritySha256 : undefined
  })
  const worldGrowth = createNovelXWorldGrowthController()
  const storyGrowth = createNovelXStoryGrowthController()
  const characterGrowth = createNovelXCharacterGrowthController()
  const projectGraph = createNovelXProjectGraphController()
  const [plannedSelection, setPlannedSelection] = createSignal<Partial<Record<NovelXResource, string>>>({})
  const [terrainQuery, setTerrainQuery] = createSignal("")
  const [imageQueueOpen, setImageQueueOpen] = createSignal(false)

  const isNovelXInternal = (path: string) => isNovelXHiddenProjectPath(file.normalize(path))
  const rootVisibleEmpty = createMemo(
    () => props.rootEmpty() || file.tree.children("").every((node) => isNovelXInternal(node.path)),
  )
  const hasDirectory = (path: string) => {
    const normalized = file.normalize(path)
    const separator = normalized.lastIndexOf("/")
    const parent = separator === -1 ? "" : normalized.slice(0, separator)
    return file.tree
      .children(parent)
      .some((node) => node.type === "directory" && file.normalize(node.path) === normalized)
  }

  const active = view.activeResource
  const growthManifest = createMemo(() => {
    const state = growth.state()
    return state.status === "ready" ? state.manifest : undefined
  })
  const growthErrorMessage = createMemo(() => {
    const state = growth.state()
    return state.status === "error" ? state.message : "未知错误"
  })
  const worldBlueprint = createMemo(() => {
    const state = worldGrowth.state()
    return state.status === "ready" ? state.blueprint : undefined
  })
  const worldMaterialization = createMemo(() => {
    const state = worldGrowth.state()
    return state.status === "ready" ? state.materialization : undefined
  })
  const worldVisual = createMemo(() => {
    const state = worldGrowth.state()
    return state.status === "ready" ? state.visual : undefined
  })
  const worldVisualAssets = createMemo(() => {
    const state = worldGrowth.state()
    return state.status === "ready" ? state.visualAssets : undefined
  })
  const worldPublication = createMemo(() => {
    const state = worldGrowth.state()
    return state.status === "ready" ? state.publication : undefined
  })
  const worldPublicationTexts = createMemo(() => {
    const state = worldGrowth.state()
    return state.status === "ready" ? state.publicationTexts : undefined
  })
  const worldGrowthErrorMessage = createMemo(() => {
    const state = worldGrowth.state()
    return state.status === "error" ? state.message : "未知错误"
  })
  const liveGrowth = createNovelXGrowthLiveController({
    currentSessionId: () => params.id,
    source: () => ({
      blueprint: worldBlueprint(),
      materialization: worldMaterialization(),
      sessions: sync().data.session,
      statuses: sync().data.session_status,
      messages: sync().data.message,
      parts: sync().data.part,
    }),
    syncSession: (sessionId) => sync().session.sync(sessionId, { force: true }),
  })
  const liveGrowthProjection = createMemo(liveGrowth.projection)
  const liveGrowthVisible = createMemo(() => {
    const projection = liveGrowthProjection()
    return (
      !!projection.stage &&
      (projection.stage.state !== "completed" || projection.artifacts.some((artifact) => artifact.locked))
    )
  })
  const storyMaterialization = createMemo(() => {
    const state = storyGrowth.state()
    return state.status === "ready" ? state.materialization : undefined
  })
  const storyGrowthErrorMessage = createMemo(() => {
    const state = storyGrowth.state()
    return state.status === "error" ? state.message : "未知错误"
  })
  const storyCovers = createMemo(() => {
    const state = storyGrowth.state()
    return state.status === "ready" ? state.covers : undefined
  })
  const storyCoverAssets = createMemo(() => {
    const state = storyGrowth.state()
    return state.status === "ready" ? state.coverAssets : {}
  })
  const storyItems = createMemo(() => {
    const manifest = storyMaterialization()
    return manifest ? novelXStoryNavigationItems(manifest) : []
  })
  const selectedStoryItem = createMemo(() => {
    if (active() !== "story") return
    const selected = plannedSelection().story
    return storyItems().find((item) => item.id === selected)
  })
  const selectedStoryCover = createMemo(() => {
    const item = selectedStoryItem()
    const ownerId = item?.ownerId ?? storyMaterialization()?.novel?.id
    const task = storyCovers()?.tasks.find(
      (candidate) => candidate.ownerId === ownerId && candidate.status === "attached",
    )
    const source = task ? storyCoverAssets()[task.id] : undefined
    return task && source ? { task, source } : undefined
  })
  const storyProgress = createMemo(() => ({
    committed: storyMaterialization()?.documents.filter((record) => record.status === "committed").length ?? 0,
    total: storyMaterialization()?.documents.length ?? 0,
  }))
  const characterMaterialization = createMemo(() => {
    const state = characterGrowth.state()
    return state.status === "ready" ? state.materialization : undefined
  })
  const characterPortrait = createMemo(() => {
    const state = characterGrowth.state()
    return state.status === "ready" ? state.portrait : undefined
  })
  const characterPortraitAsset = createMemo(() => {
    const state = characterGrowth.state()
    return state.status === "ready" ? state.portraitAsset : undefined
  })
  const characterGrowthErrorMessage = createMemo(() => {
    const state = characterGrowth.state()
    return state.status === "error" ? state.message : "未知错误"
  })
  const imageTasks = createMemo(() =>
    projectNovelXImageTasks({
      world: worldVisual(),
      portrait: characterPortrait(),
      covers: storyCovers(),
    }),
  )
  const imageQueue = createNovelXImageQueueController({
    tasks: imageTasks,
    reload: () => Promise.all([worldGrowth.reload(), storyGrowth.reload(), Promise.resolve(characterGrowth.reload())]),
  })
  const imageQueueFailed = createMemo(() => imageTasks().filter((task) => task.status === "failed").length)
  const imageQueueRunning = createMemo(() => {
    const state = imageQueue.state()
    return state.status === "ready" && state.jobs.some((job) => job.status === "running")
  })
  const imageQueuePaused = createMemo(() => {
    const state = imageQueue.state()
    return state.status === "ready" && state.paused
  })
  const imageQueueError = createMemo(() => {
    const state = imageQueue.state()
    return state.status === "error" ? state.message : undefined
  })
  const imageQueueStatus = createMemo(() => {
    const state = imageQueue.state()
    if (state.status === "loading") return "正在连接图片队列"
    if (state.status === "error") return "图片队列连接失败"
    if (state.paused) return "图片队列已暂停"
    if (
      imageQueueRunning() ||
      imageTasks().some((task) => task.status === "generating" || task.status === "validating")
    ) {
      return "图片正在后台生成"
    }
    if (imageQueueFailed()) return `${imageQueueFailed()} 个任务失败`
    return "等待图片 Worker"
  })
  createEffect(() => {
    if (active() !== "files") return
    const queue = [""]
    const seen = new Set<string>()
    while (queue.length) {
      const current = queue.shift()!
      if (seen.has(current)) continue
      seen.add(current)
      for (const node of file.tree.children(current)) {
        if (node.type !== "directory" || isNovelXInternal(node.path)) continue
        queue.push(node.path)
        if (!file.tree.state(node.path)?.expanded) file.tree.expand(node.path)
      }
    }
  })
  const worldStageRecords = createMemo(
    () => new Map(worldMaterialization()?.stages.map((stage) => [stage.stageId, stage]) ?? []),
  )
  const worldDocumentRecords = createMemo(
    () => new Map(worldMaterialization()?.documents.map((record) => [record.entityId, record]) ?? []),
  )
  createEffect(() => {
    for (const stage of worldMaterialization()?.stages ?? []) {
      if (stage.editorSessionId) void sync().session.sync(stage.editorSessionId, { force: true })
    }
  })
  const worldProgress = createMemo(() => ({
    committed: worldMaterialization()?.documents.filter((record) => record.status === "committed").length ?? 0,
    registered: worldMaterialization()?.documents.length ?? 0,
    total: worldBlueprint()?.stages.reduce((sum, stage) => sum + stage.itemCount, 0) ?? 0,
  }))
  const worldItems = createMemo(() => {
    const blueprint = worldBlueprint()
    return blueprint ? novelXWorldNavigationItems(blueprint, worldMaterialization()) : []
  })
  const selectedWorldItem = createMemo(() => {
    if (active() !== "world") return
    const selected = plannedSelection().world
    return worldItems().find((item) => item.id === selected)
  })
  const selectedWorldStage = createMemo(() => {
    const item = selectedWorldItem()
    const blueprint = worldBlueprint()
    return item && blueprint ? blueprint.stages.find((stage) => stage.id === item.stageId) : undefined
  })
  const selectedWorldEntity = createMemo(() => {
    const item = selectedWorldItem()
    if (item?.kind !== "entity") return
    return worldStageRecords()
      .get(item.stageId)
      ?.entities.find((entity) => entity.id === item.id)
  })
  const selectedWorldDocument = createMemo(() => {
    const entity = selectedWorldEntity()
    return entity ? worldDocumentRecords().get(entity.id) : undefined
  })
  const selectedWorldScenery = createMemo(() => {
    const entity = selectedWorldEntity()
    const visual = worldVisual()
    const assets = worldVisualAssets()
    if (!entity || !visual || !assets) return []
    return visual.tasks.flatMap((task) => {
      const source = assets[task.id]
      return task.type === "scenery" && task.ownerEntityId === entity.id && task.status === "attached" && source
        ? [{ task, source }]
        : []
    })
  })
  const geographyManifest = createMemo(() => {
    const state = geography.state()
    return state.status === "ready" ? state.manifest : undefined
  })
  const geographyRecords = createMemo(
    () => new Map(geographyManifest()?.records.map((record) => [record.terrainId, record]) ?? []),
  )
  const geographyProgress = createMemo(() => {
    const records = geographyManifest()?.records
    if (!records) return { committed: 0, total: growthManifest()?.terrain.nodes.length ?? 0 }
    return { committed: records.filter((record) => record.status === "committed").length, total: records.length }
  })
  const graphProjection = createMemo(() =>
    projectNovelXGraph({
      skeleton: growthManifest(),
      geography: geographyManifest(),
      world: worldMaterialization(),
      story: storyMaterialization(),
    }),
  )
  const structuredGraphAvailability = createMemo<"loading" | "ready" | "error">(() => {
    const states = [growth.state(), geography.state(), worldGrowth.state(), storyGrowth.state()]
    if (states.some((state) => state.status === "loading")) return "loading"
    if (states.some((state) => state.status === "error")) return "error"
    return "ready"
  })
  const projectGraphProjection = createMemo(() => {
    const state = projectGraph.state()
    if (state.status === "ready") return state.result.graph
    if (state.status === "loading" || state.status === "error") return state.previous?.graph
    return undefined
  })
  const visibleGraph = createMemo(() =>
    selectNovelXVisibleGraph({
      structured: graphProjection(),
      project: structuredGraphAvailability() === "ready" ? projectGraphProjection() : undefined,
    }),
  )
  const worldPackage = createMemo(() => {
    const skeleton = growthManifest()
    const blueprint = worldBlueprint()
    const visual = worldVisual()
    const world = worldMaterialization()
    const publication = worldPublication()
    const texts = worldPublicationTexts() ?? {}
    const story = storyMaterialization()
    const character = characterMaterialization()
    const mapTask = visual?.tasks.find((task) => task.type === "map" && task.status === "attached")
    const sourcePaths: Record<string, string> = {}
    for (const record of world?.documents ?? []) {
      if (record.status === "committed") sourcePaths[record.entityId] = record.targetPath
    }
    for (const record of geographyManifest()?.records ?? []) {
      if (record.status === "committed") sourcePaths[record.terrainId] = record.targetPath
    }
    return createNovelXWorldPackage({
      title: skeleton?.profile.title ?? blueprint?.profile.title,
      summary: skeleton?.profile.designSummary ?? blueprint?.profile.designSummary,
      cover: mapTask ? { status: "attached", source: worldVisualAssets()?.[mapTask.id] } : { status: "missing" },
      overview: {
        title: skeleton?.profile.genre.label ?? "世界总览",
        text: skeleton?.profile.designSummary,
      },
      map: visual
        ? {
            status: visual.atlas.cells.length ? "ready" : "pending",
            raster: mapTask ? worldVisualAssets()?.[mapTask.id] : undefined,
            atlas: visual.atlas,
            sourcePaths,
          }
        : { status: skeleton ? "pending" : "missing", sourcePaths },
      publications:
        publication?.records
          .filter((record) => record.status === "committed")
          .map((record) => ({
            id: record.id,
            title: record.title,
            kind: record.kind,
            summary: texts[record.entityId]?.[record.kind],
            sourcePath: record.targetPath,
          })) ?? [],
      story: story
        ? {
            status: story.status === "text_completed" ? "ready" : "pending",
            title: story.novel?.title,
            summary: story.novel?.summary,
            chapters: story.documents
              .filter((record) => record.kind === "novel_chapter")
              .map((record) => ({
                id: record.id,
                title: record.title,
                summary: record.brief,
                sourcePath: record.status === "committed" ? record.targetPath : undefined,
              })),
          }
        : { status: "missing" },
      characters: character?.protagonist
        ? [
            {
              id: character.protagonist.id,
              name: character.protagonist.name,
              summary: `${character.protagonist.identity} · ${character.protagonist.desire}`,
              sourcePath: character.document?.status === "committed" ? character.document.targetPath : undefined,
              portrait: characterPortraitAsset(),
            },
          ]
        : [],
      graph: visibleGraph().graph,
    })
  })
  const hasWorldPackageData = createMemo(
    () =>
      !!(
        growthManifest() ||
        worldBlueprint() ||
        worldMaterialization() ||
        worldVisual() ||
        worldPublication() ||
        storyMaterialization() ||
        characterMaterialization() ||
        visibleGraph().graph.nodes.length
      ),
  )
  createEffect(() => {
    if (active() !== "graph") return
    if (structuredGraphAvailability() !== "ready" || graphProjection().nodes.length) return
    if (projectGraph.state().status !== "idle") return
    void projectGraph.reload()
  })
  const refreshGraph = async () => {
    await growth.reload()
    await Promise.all([geography.reload(), worldGrowth.reload(), storyGrowth.reload()])
    if (graphProjection().nodes.length) return
    if (structuredGraphAvailability() === "loading") throw new Error("世界数据仍在刷新，请稍后重试。")
    if (structuredGraphAvailability() === "error") throw new Error("世界数据读取失败，无法安全重建图谱。")
    await projectGraph.reload()
    const result = projectGraph.state()
    if (result.status === "error") throw new Error(result.message)
  }
  const plannedItems = createMemo(() => {
    const resource = active()
    const manifest = growthManifest()
    if (!resource || !manifest) return []
    return novelXGrowthNavigationItems(manifest, resource)
  })
  const selectedPlanned = createMemo(() => {
    const resource = active()
    if (!resource) return
    const selected = plannedSelection()[resource]
    return plannedItems().find((item) => item.id === selected)
  })
  const selectedTerrain = createMemo(() => {
    if (active() !== "world") return
    if (worldBlueprint()) return
    const manifest = growthManifest()
    if (!manifest) return
    const selected = selectedPlanned()?.id
    return (
      manifest.terrain.nodes.find((node) => node.id === selected) ??
      manifest.terrain.nodes.find((node) => node.prominence === "core") ??
      manifest.terrain.nodes[0]
    )
  })
  const selectedGeographyRecord = createMemo(() => {
    const terrain = selectedTerrain()
    return terrain ? geographyRecords().get(terrain.id) : undefined
  })
  const taskPartForTerrain = (terrainId: string) => {
    const root = params.id
    const terrain = growthManifest()?.terrain.nodes.find((item) => item.id === terrainId)
    if (!root || !terrain) return
    return (sync().data.message[root] ?? [])
      .flatMap((message) => sync().data.part[message.id] ?? [])
      .findLast((part) => {
        if (part.type !== "tool" || part.tool !== "task") return false
        const input = "input" in part.state ? part.state.input : undefined
        return input?.subagent_type === "novelx-geography" && input?.description === `地理：${terrain.name}`
      })
  }
  const taskPartForWorldEntity = (entityId: string) => {
    const stage = worldMaterialization()?.stages.find((item) => item.entities.some((entity) => entity.id === entityId))
    const entity = stage?.entities.find((item) => item.id === entityId)
    if (!stage?.editorSessionId || !entity) return
    return (sync().data.message[stage.editorSessionId] ?? [])
      .flatMap((message) => sync().data.part[message.id] ?? [])
      .findLast((part) => {
        if (part.type !== "tool" || part.tool !== "task") return false
        const input = "input" in part.state ? part.state.input : undefined
        return input?.subagent_type === "novelx-world-writer" && input?.description === `世界：${entity.name}`
      })
  }
  const projectedWorldStatus = (entityId: string): NovelXWorld.WorldDocumentStatus => {
    const record = worldDocumentRecords().get(entityId)
    if (!record || record.status !== "leased") return record?.status ?? "registered"
    const task = taskPartForWorldEntity(entityId)
    if (!task || task.type !== "tool") return "leased"
    if (task.state.status === "running" || task.state.status === "pending") return "drafting"
    if (task.state.status === "completed") return "reviewing"
    if (task.state.status === "error") return "failed"
    return "leased"
  }
  const projectedGeographyStatus = (terrainId: string) => {
    const record = geographyRecords().get(terrainId)
    if (!record || record.status !== "leased") return record?.status ?? "registered"
    const task = taskPartForTerrain(terrainId)
    if (!task || task.type !== "tool") return "leased"
    if (task.state.status === "running" || task.state.status === "pending") return "drafting"
    if (task.state.status === "completed") return "reviewing"
    if (task.state.status === "error") return "failed"
    return "leased"
  }
  const selectedChildSessionId = createMemo(() => {
    const worldRecord = selectedWorldDocument()
    if (worldRecord?.taskSessionId) return worldRecord.taskSessionId
    const worldEntity = selectedWorldEntity()
    if (worldEntity) {
      const task = taskPartForWorldEntity(worldEntity.id)
      if (task?.type === "tool" && "metadata" in task.state && typeof task.state.metadata?.sessionId === "string") {
        return task.state.metadata.sessionId
      }
    }
    const record = selectedGeographyRecord()
    if (record?.taskSessionId) return record.taskSessionId
    const terrain = selectedTerrain()
    if (!terrain) return
    const task = taskPartForTerrain(terrain.id)
    if (!task || task.type !== "tool" || !("metadata" in task.state)) return
    return typeof task.state.metadata?.sessionId === "string" ? task.state.metadata.sessionId : undefined
  })
  const [selectedChildText, setSelectedChildText] = createSignal("")
  createEffect(() => {
    const sessionID = selectedChildSessionId()
    if (!sessionID) {
      setSelectedChildText("")
      return
    }
    const text = projectNovelXDraftText(sync().data.message[sessionID] ?? [], sync().data.part)
    setSelectedChildText(text)
  })

  createEffect(() => {
    const sessionID = selectedChildSessionId()
    if (sessionID) void sync().session.sync(sessionID, { force: true })
  })
  const selectedTerrainRelations = createMemo(() => {
    const manifest = growthManifest()
    const selected = selectedTerrain()
    if (!manifest || !selected) return []
    const nodes = new Map(manifest.terrain.nodes.map((node) => [node.id, node]))
    return manifest.terrain.relations.flatMap((relation) => {
      if (relation.fromId !== selected.id && relation.toId !== selected.id) return []
      const other = nodes.get(relation.fromId === selected.id ? relation.toId : relation.fromId)
      if (!other) return []
      return [{ relation, other }]
    })
  })
  const title = createMemo(() => {
    const resource = active()
    return resource ? language.t(resourceLabel(resource)) : language.t("novelx.resources.fileContents")
  })

  const select = (path: string) => {
    const normalized = file.normalize(path)
    if (normalized === file.normalize(view.activeFile())) return true
    if (!document.canLeave()) {
      showToast({
        variant: "default",
        title: language.t("novelx.document.unsaved.title"),
        description: language.t("novelx.document.unsaved.description"),
      })
      return false
    }
    const resource = active()
    if (resource) setPlannedSelection((current) => ({ ...current, [resource]: undefined }))
    view.setActiveFile(normalized)
    return true
  }

  const openGraphSource = (path: string) => {
    if (!select(path)) return
    view.activateResource("files")
  }

  const selectPlanned = (item: NovelXGrowthNavigationItem) => {
    if (!document.canLeave()) {
      showToast({
        variant: "default",
        title: language.t("novelx.document.unsaved.title"),
        description: language.t("novelx.document.unsaved.description"),
      })
      return
    }
    const record = geographyRecords().get(item.id)
    view.setActiveFile(record?.status === "committed" ? record.targetPath : "")
    setPlannedSelection((current) => ({ ...current, [item.resource]: item.id }))
  }

  const selectWorldItem = (item: NovelXWorldNavigationItem) => {
    if (!document.canLeave()) {
      showToast({
        variant: "default",
        title: language.t("novelx.document.unsaved.title"),
        description: language.t("novelx.document.unsaved.description"),
      })
      return false
    }
    const record = item.kind === "entity" ? worldDocumentRecords().get(item.id) : undefined
    const published =
      item.kind === "entity"
        ? worldPublication()?.records.find(
            (candidate) =>
              candidate.entityId === item.id && candidate.kind === "atlas" && candidate.status === "committed",
          )
        : undefined
    view.setActiveFile(
      published?.targetPath ??
        (worldMaterialization()?.status === "completed" ? "" : record?.status === "committed" ? record.targetPath : ""),
    )
    setPlannedSelection((current) => ({ ...current, world: item.id }))
    return true
  }

  const openLiveGrowthArtifact = (artifact: ReturnType<typeof liveGrowthProjection>["artifacts"][number]) => {
    if (artifact.state === "committed") {
      if (select(artifact.targetPath)) view.activateResource("files")
      return
    }
    const item = worldItems().find((candidate) => candidate.kind === "entity" && candidate.id === artifact.entityId)
    if (item && selectWorldItem(item)) view.activateResource("world")
  }

  const liveGrowthLabel = (key: NovelXGrowthLiveLabelKey) =>
    language.t(
      (
        {
          heading: "novelx.liveGrowth.heading",
          planned: "novelx.liveGrowth.planned",
          registering: "novelx.liveGrowth.registering",
          writing: "novelx.liveGrowth.writing",
          completed: "novelx.liveGrowth.completed",
          failed: "novelx.liveGrowth.failed",
          registered: "novelx.liveGrowth.registered",
          leased: "novelx.liveGrowth.leased",
          drafting: "novelx.liveGrowth.drafting",
          reviewing: "novelx.liveGrowth.reviewing",
          committed: "novelx.liveGrowth.committed",
          readonly: "novelx.liveGrowth.readonly",
          waiting: "novelx.liveGrowth.waiting",
          resumeFollow: "novelx.liveGrowth.resumeFollow",
          latest: "novelx.liveGrowth.latest",
        } as const
      )[key],
    )

  const selectStoryItem = (item: NovelXStoryNavigationItem) => {
    if (!document.canLeave()) {
      showToast({
        variant: "default",
        title: language.t("novelx.document.unsaved.title"),
        description: language.t("novelx.document.unsaved.description"),
      })
      return
    }
    view.setActiveFile(item.kind === "document" ? item.targetPath : "")
    setPlannedSelection((current) => ({ ...current, story: item.id }))
  }

  const selectCharacter = () => {
    if (!document.canLeave()) {
      showToast({
        variant: "default",
        title: language.t("novelx.document.unsaved.title"),
        description: language.t("novelx.document.unsaved.description"),
      })
      return
    }
    const record = characterMaterialization()?.document
    view.setActiveFile(record?.status === "committed" ? record.targetPath : "")
    setPlannedSelection((current) => ({ ...current, characters: characterMaterialization()?.protagonist?.id }))
  }

  const resourcePath = (resource: NovelXResource) => {
    const candidates = ["World", "Characters", "World/characters", "Stories", "Story"].filter(hasDirectory)
    return resolveNovelXResourcePath(resource, candidates)
  }

  const renderTree = (resource: NovelXResource) => {
    const path = resourcePath(resource)
    if (resource === "graph") {
      if (visibleGraph().graph.nodes.length) return
      return <div class="novelx-resource-empty">{language.t("novelx.resource.noStructuredData")}</div>
    }
    if (resource === "package") {
      if (hasWorldPackageData()) return
      return <div class="novelx-resource-empty">{language.t("novelx.resource.noStructuredData")}</div>
    }
    if (resource === "story" && storyMaterialization()) return
    if (resource === "characters" && characterMaterialization()) return
    if (path === undefined) {
      return <div class="novelx-resource-empty">{language.t("novelx.resource.noStructuredData")}</div>
    }
    if (growthManifest() || worldBlueprint()) {
      if (resource === "world" && props.worldStatus() !== "tree") return
      if (resource !== "files" && !hasDirectory(path)) return
    }
    return (
      <FileTree
        path={path}
        hidden={(node) => isNovelXInternal(node.path)}
        modified={props.modified()}
        kinds={props.kinds()}
        active={view.activeFile()}
        onFileClick={(node) => {
          if (node.type !== "file") return
          select(node.path)
        }}
      />
    )
  }

  const renderGrowthTree = (resource: NovelXResource) => (
    <Switch>
      <Match when={resource === "characters" && characterGrowth.state().status === "ready"}>
        <section class="novelx-character-tree" aria-label="角色档案">
          <Show when={characterMaterialization()?.protagonist}>
            {(character) => (
              <button
                type="button"
                class="novelx-character-tree-item"
                classList={{ "is-selected": plannedSelection().characters === character().id }}
                aria-pressed={plannedSelection().characters === character().id}
                onClick={selectCharacter}
              >
                <span class="novelx-character-tree-mark" aria-hidden="true" />
                <span>{character().name}</span>
                <small>{characterMaterialization()?.document?.status === "committed" ? "已提交" : "生长中"}</small>
              </button>
            )}
          </Show>
        </section>
      </Match>
      <Match when={resource === "characters" && characterGrowth.state().status === "error"}>
        <div class="novelx-growth-error" role="alert">
          <strong>角色生长状态无法读取</strong>
          <span>{characterGrowthErrorMessage()}</span>
          <button type="button" onClick={characterGrowth.reload}>
            重新读取
          </button>
        </div>
      </Match>
      <Match when={resource === "story" && storyGrowth.state().status === "ready"}>
        <section class="novelx-story-tree" aria-label="故事、历史与文献">
          <For each={storyItems()}>
            {(item) => (
              <button
                type="button"
                class="novelx-story-tree-item"
                classList={{ "is-selected": selectedStoryItem()?.id === item.id, [`is-${item.kind}`]: true }}
                style={{ "--novelx-story-depth": item.depth }}
                title={item.label}
                aria-pressed={selectedStoryItem()?.id === item.id}
                onClick={() => selectStoryItem(item)}
              >
                <span class="novelx-story-tree-mark" aria-hidden="true" />
                <span>{item.label}</span>
                <Show when={item.kind === "document"}>
                  <small>
                    {storyMaterialization()?.documents.find((record) => record.id === item.id)?.status === "committed"
                      ? "已提交"
                      : "生长中"}
                  </small>
                </Show>
              </button>
            )}
          </For>
        </section>
      </Match>
      <Match when={resource === "story" && storyGrowth.state().status === "error"}>
        <div class="novelx-growth-error" role="alert">
          <strong>故事生长状态无法读取</strong>
          <span>{storyGrowthErrorMessage()}</span>
          <button type="button" onClick={storyGrowth.reload}>
            重新读取
          </button>
        </div>
      </Match>
      <Match when={resource === "world" && worldGrowth.state().status === "ready"}>
        <NovelXWorldGrowthTree
          blueprint={worldBlueprint()!}
          materialization={worldMaterialization()}
          items={worldItems()}
          query={terrainQuery()}
          selectedId={plannedSelection().world}
          selectedStage={selectedWorldStage()}
          selectedEntity={selectedWorldEntity()}
          selectedDocument={selectedWorldDocument()}
          selectedChildText={selectedChildText}
          selectedChildSessionId={selectedChildSessionId()}
          status={projectedWorldStatus}
          onQuery={setTerrainQuery}
          onSelect={selectWorldItem}
        />
      </Match>
      <Match when={resource === "world" && worldGrowth.state().status === "error"}>
        <div class="novelx-growth-error" role="alert">
          <strong>世界生长状态无法读取</strong>
          <span>{worldGrowthErrorMessage()}</span>
          <button type="button" onClick={worldGrowth.reload}>
            重新读取
          </button>
        </div>
      </Match>
      <Match when={growth.state().status === "loading" && worldGrowth.state().status === "loading"}>
        <div class="novelx-resource-empty" role="status">
          正在读取世界生长状态…
        </div>
      </Match>
      <Match when={growth.state().status === "error"}>
        <div class="novelx-growth-error" role="alert">
          <strong>生长骨架无法读取</strong>
          <span>{growthErrorMessage()}</span>
          <button type="button" onClick={growth.reload}>
            重新读取
          </button>
        </div>
      </Match>
      <Match when={growth.state().status === "ready"}>
        <Show when={resource === "world"}>
          <section class="novelx-growth-tree" aria-label="已注册世界地形">
            <label class="novelx-terrain-search">
              <Icon name="magnifying-glass" size="small" />
              <input
                type="search"
                value={terrainQuery()}
                placeholder="搜索地点"
                aria-label="搜索地点"
                onInput={(event) => setTerrainQuery(event.currentTarget.value)}
              />
            </label>
            <div class="novelx-growth-tree-heading">
              <strong>主大陆及周边海域</strong>
              <span>
                {geographyProgress().committed}/{geographyProgress().total} 已提交
              </span>
            </div>
            <For
              each={novelXGrowthNavigationItems(growthManifest()!, resource).filter((item) =>
                item.label.toLocaleLowerCase().includes(terrainQuery().trim().toLocaleLowerCase()),
              )}
            >
              {(item) => (
                <button
                  type="button"
                  class="novelx-growth-tree-item"
                  classList={{
                    "is-selected": plannedSelection()[resource] === item.id,
                  }}
                  style={{ "--novelx-growth-depth": item.depth }}
                  aria-pressed={plannedSelection()[resource] === item.id}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => selectPlanned(item)}
                >
                  <span
                    class="novelx-growth-tree-mark"
                    data-kind={growthManifest()!.terrain.nodes.find((node) => node.id === item.id)?.kind}
                    data-status={projectedGeographyStatus(item.id)}
                    aria-hidden="true"
                  />
                  <span class="novelx-growth-tree-label">{item.label}</span>
                  <small>{novelXGeographyStatusLabel(projectedGeographyStatus(item.id))}</small>
                </button>
              )}
            </For>
          </section>
        </Show>
      </Match>
    </Switch>
  )

  const resourceEmpty = (resource: NovelXResource) => {
    if (resource === "characters" && characterGrowth.state().status === "loading") {
      return <div class="novelx-resource-empty">正在读取角色…</div>
    }
    if (resource === "characters" && characterMaterialization()) return
    if (resource === "story" && storyGrowth.state().status === "loading") {
      return <div class="novelx-resource-empty">正在读取故事…</div>
    }
    if (resource === "story" && storyMaterialization()) return
    if (resource === "package" && hasWorldPackageData()) return
    if (resource === "graph" && visibleGraph().graph.nodes.length) return
    if (growthManifest() || worldBlueprint()) return
    if (resource === "world") {
      return (
        <Switch>
          <Match when={props.worldStatus() === "error"}>
            <div class="novelx-resource-empty is-error">
              {language.t("novelx.world.error")}: {props.worldError()}
            </div>
          </Match>
          <Match when={props.worldStatus() === "loading"}>
            <div class="novelx-resource-empty">
              {language.t("common.loading")}
              {language.t("common.loading.ellipsis")}
            </div>
          </Match>
          <Match when={props.worldStatus() === "empty"}>
            <div class="novelx-resource-empty">{language.t("novelx.world.empty")}</div>
          </Match>
        </Switch>
      )
    }
    if (resource === "files" && rootVisibleEmpty()) {
      return <div class="novelx-resource-empty">{language.t("session.files.empty")}</div>
    }
  }

  const characterPortraitStateLabel = createMemo(() => {
    const portrait = characterPortrait()
    if (!portrait) return "立绘尚未注册"
    if (portrait.task.status === "failed") return `立绘生成失败 · 已尝试 ${portrait.task.attempts}/3 次`
    if (portrait.task.status === "attached" && !characterPortraitAsset()) return "立绘文件无法读取"
    if (portrait.task.status === "attached") return "标准立绘已生成"
    return `立绘正在生成 · ${portrait.task.attempts}/3 次`
  })

  const terrainAtlas = () => {
    const manifest = growthManifest()
    if (!manifest) return
    return (
      <div class="novelx-terrain-atlas is-empty" aria-label={`${manifest.profile.title}地图尚未生成`}>
        <div class="novelx-terrain-empty-map-mark" aria-hidden="true">
          <NovelXResourceIcon resource="world" size={30} />
        </div>
        <strong>地图尚未生成</strong>
        <span>地理档案正在生长；本阶段不会用注册坐标绘制示意地图。</span>
        <small>
          {geographyProgress().committed}/{geographyProgress().total} 份地理档案已提交
        </small>
      </div>
    )
  }

  const terrainDraftPanel = () => {
    const terrain = selectedTerrain()
    if (!terrain || !selectedPlanned()) return
    const status = projectedGeographyStatus(terrain.id)
    return (
      <article
        class="novelx-geography-draft"
        data-status={status}
        data-document-locked="true"
        aria-busy={status === "leased" || status === "drafting" || status === "reviewing"}
        aria-readonly="true"
      >
        <header>
          <div>
            <span>{terrainKindLabel(terrain.kind)}</span>
            <h2>{terrain.name}</h2>
          </div>
          <div class="novelx-geography-draft-state">
            <i aria-hidden="true" />
            {novelXGeographyStatusLabel(status)}
          </div>
        </header>
        <Show
          when={selectedChildText()}
          fallback={
            <div class="novelx-geography-draft-waiting" role="status">
              <strong>{status === "registered" ? "等待主编分配" : "正在等待地理 Agent 返回内容"}</strong>
              <p>{terrain.summary}</p>
              <span>正式文件尚未提交，当前内容不可编辑。</span>
            </div>
          }
        >
          {(text) => (
            <div class="novelx-geography-stream">
              <div class="novelx-geography-stream-heading">
                <span>novelx-geography</span>
                <small>流式草稿 · 只读</small>
              </div>
              <pre>{text()}</pre>
            </div>
          )}
        </Show>
      </article>
    )
  }

  const primary = (resource: NovelXResource) => (
    <div class="novelx-resource-primary">
      <div class="novelx-resource-primary-body">
        <Show
          when={novelXResourceOwnsDocument(resource, view.activeFile()) ? document.state() : undefined}
          fallback={
            resource === "graph" ? (
              <NovelXGraphView
                graph={() => visibleGraph().graph}
                storageKey={`novelx:graph-sphere:v2:${sdk().directory}`}
                readSource={async (path) => {
                  const result = await sdk().client.file.editable({ path })
                  return result.data?.content
                }}
                onOpenSource={openGraphSource}
                onRefresh={refreshGraph}
              />
            ) : resource === "package" ? (
              <NovelXWorldPackageView
                package={worldPackage}
                graphStorageKey={`novelx:graph-sphere:v2:${sdk().directory}`}
                readSource={async (path) => {
                  const result = await sdk().client.file.editable({ path })
                  return result.data?.content
                }}
                onRefreshGraph={refreshGraph}
                onOpenSource={openGraphSource}
              />
            ) : resource === "characters" && characterMaterialization() ? (
              <article class="novelx-character-overview">
                <Show
                  when={characterPortraitAsset()}
                  fallback={
                    <div
                      class="novelx-character-portrait-placeholder"
                      data-status={characterPortrait()?.task.status ?? "absent"}
                    >
                      <NovelXResourceIcon resource="characters" size={30} />
                      <strong>{characterPortraitStateLabel()}</strong>
                      <Show when={characterPortrait()?.task.errorCode}>{(code) => <small>{code()}</small>}</Show>
                    </div>
                  }
                >
                  {(source) => (
                    <figure class="novelx-character-portrait">
                      <img src={source()} alt={`${characterMaterialization()!.protagonist?.name ?? "主角"}标准立绘`} />
                    </figure>
                  )}
                </Show>
                <div class="novelx-character-overview-copy">
                  <span>唯一主角</span>
                  <h2>{characterMaterialization()!.protagonist?.name ?? "角色档案"}</h2>
                  <p>{characterMaterialization()!.protagonist?.identity}</p>
                  <dl>
                    <dt>外观识别</dt>
                    <dd>{characterMaterialization()!.protagonist?.visualBrief}</dd>
                    <dt>当前状态</dt>
                    <dd>{characterPortraitStateLabel()}</dd>
                  </dl>
                  <button type="button" onClick={selectCharacter}>
                    打开角色档案
                  </button>
                </div>
              </article>
            ) : resource === "story" && storyMaterialization() ? (
              <div class="novelx-story-overview">
                <Show
                  when={selectedStoryCover()}
                  fallback={
                    <div class="novelx-story-cover-placeholder">
                      <NovelXResourceIcon resource="story" size={30} />
                      <span>{storyCovers() ? "封面正在生成" : "封面尚未生成"}</span>
                    </div>
                  }
                >
                  {(cover) => (
                    <figure classList={{ "is-landscape": cover().task.aspect === "landscape" }}>
                      <img src={cover().source} alt={cover().task.title} />
                      <figcaption>{cover().task.title}</figcaption>
                    </figure>
                  )}
                </Show>
                <div class="novelx-story-overview-copy">
                  <span>
                    {selectedStoryItem()?.kind === "theme"
                      ? "主题"
                      : selectedStoryItem()?.kind === "work"
                        ? "历史书"
                        : "小说"}
                  </span>
                  <h2>{selectedStoryItem()?.label ?? storyMaterialization()!.novel?.title}</h2>
                  <p>
                    {selectedStoryItem()?.kind === "theme"
                      ? storyMaterialization()!.novel?.theme.summary
                      : (storyMaterialization()!.historyBooks.find((book) => book.id === selectedStoryItem()?.id)
                          ?.summary ?? storyMaterialization()!.novel?.summary)}
                  </p>
                  <small>
                    {storyProgress().committed}/{storyProgress().total} 份故事文稿已提交
                  </small>
                </div>
              </div>
            ) : resource === "world" && worldBlueprint() ? (
              <NovelXWorldGrowthPrimary
                blueprint={worldBlueprint()!}
                materialization={worldMaterialization()}
                visual={worldVisual()}
                visualAssets={worldVisualAssets()}
                publication={worldPublication()}
                publicationTexts={worldPublicationTexts()}
                selectedStage={selectedWorldStage()}
                selectedEntity={selectedWorldEntity()}
                selectedDocument={selectedWorldDocument()}
                selectedChildText={selectedChildText}
                selectedChildSessionId={selectedChildSessionId()}
                status={projectedWorldStatus}
                onSelectEntity={(entityId) => {
                  const item = worldItems().find(
                    (candidate) => candidate.kind === "entity" && candidate.id === entityId,
                  )
                  if (item) selectWorldItem(item)
                }}
              />
            ) : resource === "world" && growthManifest() ? (
              selectedPlanned() && selectedGeographyRecord()?.status !== "committed" ? (
                terrainDraftPanel()
              ) : (
                terrainAtlas()
              )
            ) : (
              <div class="novelx-resource-blank">
                {resourceScaffold(resource)}
                <NovelXResourceIcon resource={resource} size={28} />
                <strong>{language.t(resourceCopy[resource].emptyTitle)}</strong>
                <span>{language.t(resourceCopy[resource].emptyDescription)}</span>
              </div>
            )
          }
        >
          {(state) => (
            <div class="novelx-world-document-with-visual">
              <Show when={active() === "story" && selectedStoryCover()}>
                {(cover) => (
                  <figure class="novelx-story-document-cover">
                    <img src={cover().source} alt={cover().task.title} />
                    <figcaption>{cover().task.title}</figcaption>
                  </figure>
                )}
              </Show>
              <Show when={active() === "world" && selectedWorldScenery().length}>
                <div class="novelx-world-document-visuals">
                  <For each={selectedWorldScenery()}>
                    {(item) => (
                      <figure>
                        <img src={item.source} alt={item.task.title} />
                        <figcaption>{item.task.title}</figcaption>
                      </figure>
                    )}
                  </For>
                </div>
              </Show>
              <NovelXDocumentEditor
                state={state()}
                locked={document.locked()}
                lockedAgents={document.lockedAgents()}
                onInput={document.edit}
                onSave={() => void document.save()}
                onReload={document.reload}
              />
            </div>
          )}
        </Show>
      </div>
    </div>
  )

  return (
    <aside
      id="file-tree-panel"
      class="novelx-resource-workspace"
      classList={{ "is-collapsed": view.rightCollapsed(), "is-expanded": !!active() && !view.rightCollapsed() }}
      aria-label={language.t("novelx.resourceDock.label")}
    >
      <Show when={!view.rightCollapsed()}>
        <Show
          when={active()}
          fallback={
            <section class="novelx-compact-files" aria-label={language.t("novelx.resources.fileContents")}>
              <div class="novelx-compact-files-heading">
                <strong>{language.t("novelx.resources.fileContents")}</strong>
              </div>
              <Show when={liveGrowthVisible()}>
                <NovelXGrowthLivePanel
                  projection={liveGrowthProjection}
                  selectedArtifactKey={liveGrowth.selectedArtifactKey}
                  followMode={liveGrowth.followMode}
                  label={liveGrowthLabel}
                  onSelect={liveGrowth.selectArtifact}
                  onOpen={openLiveGrowthArtifact}
                  onResumeFollow={liveGrowth.resumeFollow}
                />
              </Show>
              <div class="novelx-compact-files-tree">
                <Show
                  when={!rootVisibleEmpty()}
                  fallback={<div class="novelx-resource-empty">{language.t("session.files.empty")}</div>}
                >
                  <FileTree
                    path=""
                    hidden={(node) => isNovelXInternal(node.path)}
                    modified={props.modified()}
                    kinds={props.kinds()}
                    active={view.activeFile()}
                    onFileClick={(node) => {
                      if (node.type !== "file") return
                      view.activateResource("files")
                      select(node.path)
                    }}
                  />
                </Show>
              </div>
            </section>
          }
        >
          {(resource) => (
            <div class="novelx-resource-expanded" data-resource={resource()}>
              <header class="novelx-resource-page-heading">
                <div class="novelx-resource-page-identity" title={language.t(resourceCopy[resource()].summary)}>
                  <strong>{title()}</strong>
                  <span>
                    {resource() === "world" && worldBlueprint()
                      ? `${worldBlueprint()!.profile.title} · ${worldProgress().committed}/${worldProgress().total} 份世界档案已提交`
                      : resource() === "world" && growthManifest()
                        ? `${growthManifest()!.profile.title} · ${geographyProgress().committed}/${geographyProgress().total} 份地理档案已提交`
                        : resource() === "graph"
                          ? `${visibleGraph().graph.nodes.length} 个节点 · ${visibleGraph().graph.edges.length} 条关系`
                          : resource() === "story" && storyMaterialization()
                            ? `${storyMaterialization()!.novel?.title ?? "故事"} · ${storyProgress().committed}/${storyProgress().total} 份文稿已提交`
                            : language.t(resourceCopy[resource()].summary)}
                  </span>
                </div>
                <div class="novelx-resource-page-actions">
                  <Show when={resource() === "world" && (growthManifest() || worldBlueprint())}>
                    <button
                      type="button"
                      class="novelx-terrain-add-button"
                      onClick={() =>
                        showToast({
                          variant: "default",
                          title: "当前由 Growth 统一规划世界",
                          description: "新增实体必须读取前序正式事实并经过注册、子 Agent 写作和主编提交。",
                        })
                      }
                    >
                      <Icon name="plus-small" size="small" />
                      新增世界实体
                    </button>
                  </Show>
                  <Show
                    when={
                      (view.activeFile() || selectedTerrain() || selectedWorldStage() || selectedStoryItem()) &&
                      !view.inspectorOpen()
                    }
                  >
                    <button
                      type="button"
                      class="novelx-symbol-button"
                      aria-label={language.t("novelx.resource.openDetails")}
                      onClick={() => view.setInspectorOpen(true)}
                    >
                      <Icon name="sidebar" size="small" />
                    </button>
                  </Show>
                </div>
              </header>
              <div class="novelx-resource-page-columns">
                <nav class="novelx-resource-navigator" aria-label={title()}>
                  <div class="novelx-resource-navigator-tree">
                    {resourceEmpty(resource())}
                    {renderGrowthTree(resource())}
                    {renderTree(resource())}
                  </div>
                </nav>
                {primary(resource())}
                <Show
                  when={
                    view.inspectorOpen() &&
                    (view.activeFile() || selectedTerrain() || selectedWorldStage() || selectedStoryItem())
                  }
                >
                  <aside class="novelx-resource-inspector">
                    <div class="novelx-resource-inspector-heading">
                      <strong>
                        {selectedWorldEntity()?.name ??
                          selectedWorldStage()?.label ??
                          selectedTerrain()?.name ??
                          selectedStoryItem()?.label ??
                          language.t("novelx.resource.details")}
                      </strong>
                      <button
                        type="button"
                        class="novelx-symbol-button"
                        aria-label={language.t("common.close")}
                        onClick={() => view.setInspectorOpen(false)}
                      >
                        <Icon name="close-small" size="small" />
                      </button>
                    </div>
                    <Switch>
                      <Match when={worldBlueprint() && selectedWorldStage()}>
                        <NovelXWorldGrowthInspector
                          blueprint={worldBlueprint()!}
                          materialization={worldMaterialization()}
                          selectedStage={selectedWorldStage()}
                          selectedEntity={selectedWorldEntity()}
                          selectedDocument={selectedWorldDocument()}
                          selectedChildText={selectedChildText}
                          selectedChildSessionId={selectedChildSessionId()}
                          status={projectedWorldStatus}
                        />
                      </Match>
                      <Match when={selectedStoryItem()}>
                        {(item) => (
                          <div class="novelx-story-inspector-body">
                            <p>{item().label}</p>
                            <dl>
                              <dt>类型</dt>
                              <dd>
                                {item().kind === "root"
                                  ? "小说"
                                  : item().kind === "work"
                                    ? "历史书"
                                    : item().kind === "theme"
                                      ? "主题"
                                      : item().kind === "document"
                                        ? "正式文稿"
                                        : "分类"}
                              </dd>
                              <dt>状态</dt>
                              <dd>
                                {item().kind === "document"
                                  ? storyMaterialization()?.documents.find((record) => record.id === item().id)?.status
                                  : storyMaterialization()?.status}
                              </dd>
                              <dt>文件</dt>
                              <dd>{item().kind === "document" ? item().targetPath : "—"}</dd>
                            </dl>
                          </div>
                        )}
                      </Match>
                      <Match when={selectedTerrain()}>
                        {(terrain) => (
                          <div class="novelx-terrain-inspector-body">
                            <p>{terrain().summary}</p>
                            <section>
                              <strong>地貌</strong>
                              <dl>
                                <dt>类型</dt>
                                <dd>{terrainKindLabel(terrain().kind)}</dd>
                                <dt>层级</dt>
                                <dd>
                                  {terrain().prominence === "core"
                                    ? "核心"
                                    : terrain().prominence === "major"
                                      ? "主要"
                                      : "支撑"}
                                </dd>
                                <dt>状态</dt>
                                <dd>{novelXGeographyStatusLabel(projectedGeographyStatus(terrain().id))}</dd>
                                <dt>执行 Agent</dt>
                                <dd>{selectedChildSessionId() ? "novelx-geography" : "尚未分配"}</dd>
                                <dt>文件锁</dt>
                                <dd>
                                  {selectedGeographyRecord()?.status === "committed" ? "已释放" : "只读 / 尚未提交"}
                                </dd>
                              </dl>
                            </section>
                            <section>
                              <strong>形成与作用</strong>
                              <p>{terrain().formation}</p>
                            </section>
                            <Show when={selectedTerrainRelations().length}>
                              <section>
                                <strong>空间关系</strong>
                                <ul>
                                  <For each={selectedTerrainRelations()}>
                                    {(item) => (
                                      <li>
                                        <b>
                                          {terrainRelationLabel(item.relation.kind)} {item.other.name}
                                        </b>
                                        <span>{item.relation.summary}</span>
                                      </li>
                                    )}
                                  </For>
                                </ul>
                              </section>
                            </Show>
                          </div>
                        )}
                      </Match>
                      <Match when={true}>
                        <dl>
                          <dt>{language.t("novelx.resource.path")}</dt>
                          <dd>{view.activeFile()}</dd>
                          <dt>{language.t("novelx.resource.state")}</dt>
                          <dd>{language.t("novelx.resource.realFile")}</dd>
                        </dl>
                      </Match>
                    </Switch>
                  </aside>
                </Show>
              </div>
            </div>
          )}
        </Show>
      </Show>

      <nav class="novelx-resource-dock" aria-label={language.t("novelx.resourceDock.label")}>
        <For each={NOVELX_RESOURCES}>
          {(resource) => (
            <div class="novelx-resource-dock-slot">
              <button
                type="button"
                class="novelx-resource-dock-button"
                classList={{ "is-active": active() === resource }}
                aria-label={language.t(resourceLabel(resource))}
                aria-pressed={active() === resource}
                title={language.t(resourceLabel(resource))}
                onClick={() => view.activateResource(resource)}
              >
                <NovelXResourceIcon resource={resource} size={24} />
              </button>
              <Show when={resource === "files" && imageTasks().length > 0}>
                <button
                  type="button"
                  class="novelx-image-queue-track"
                  classList={{
                    "is-running": imageQueueRunning(),
                    "is-paused": imageQueuePaused(),
                  }}
                  aria-label={`${imageQueueStatus()}，${imageTasks().length} 个未完成任务`}
                  aria-expanded={imageQueueOpen()}
                  title={`${imageQueueStatus()} · ${imageTasks().length} 个未完成任务`}
                  onClick={() => setImageQueueOpen((open) => !open)}
                >
                  <span class="novelx-image-queue-line" />
                  <For each={imageTasks()}>
                    {(task, index) => (
                      <span
                        class={`novelx-image-queue-node is-${task.status}`}
                        style={`--novelx-image-node-position: ${
                          imageTasks().length === 1 ? 50 : 8 + (index() / (imageTasks().length - 1)) * 84
                        }%`}
                      />
                    )}
                  </For>
                  <span class="novelx-image-queue-count">{imageTasks().length}</span>
                </button>
                <Show when={imageQueueOpen()}>
                  <section class="novelx-image-queue-panel" aria-label="图片生成队列">
                    <header>
                      <div>
                        <strong>图片生成</strong>
                        <span>{imageQueueStatus()}</span>
                      </div>
                      <button
                        type="button"
                        class="novelx-symbol-button"
                        aria-label="关闭图片队列"
                        onClick={() => setImageQueueOpen(false)}
                      >
                        <Icon name="close-small" size="small" />
                      </button>
                    </header>
                    <div class="novelx-image-queue-actions">
                      <Show
                        when={imageQueue.state().status === "ready" && !imageQueuePaused() && imageQueueRunning()}
                        fallback={
                          <button type="button" disabled={imageQueue.busy()} onClick={() => void imageQueue.resume()}>
                            <Icon name="arrow-right" size="small" />
                            继续生成
                          </button>
                        }
                      >
                        <button type="button" disabled={imageQueue.busy()} onClick={() => void imageQueue.pause()}>
                          <Icon name="stop" size="small" />
                          完成本张后暂停
                        </button>
                      </Show>
                      <Show when={imageQueueFailed() > 0}>
                        <button
                          type="button"
                          disabled={imageQueue.busy()}
                          onClick={() => void imageQueue.retryFailed()}
                        >
                          重试失败项
                        </button>
                      </Show>
                    </div>
                    <Show when={imageQueueError()}>{(error) => <p class="novelx-image-queue-error">{error()}</p>}</Show>
                    <div class="novelx-image-queue-list">
                      <For each={imageTasks()}>
                        {(task) => (
                          <div class={`novelx-image-queue-item is-${task.status}`}>
                            <i />
                            <div>
                              <strong>{task.title}</strong>
                              <span>
                                {imageTaskKindLabel(task.kind)} · {imageTaskStatusLabel(task.status)}
                              </span>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </section>
                </Show>
              </Show>
            </div>
          )}
        </For>
      </nav>
    </aside>
  )
}
