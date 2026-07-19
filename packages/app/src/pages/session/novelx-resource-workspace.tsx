import { Icon } from "@opencode-ai/ui/icon"
import type { NovelXGrowth } from "@opencode-ai/schema"
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
import { showToast } from "@/utils/toast"
import { NovelXDocumentEditor } from "./novelx-document-editor"
import "./novelx-document-editor.css"
import { useParams } from "@solidjs/router"
import { For, Match, Show, Switch, createEffect, createMemo, createSignal } from "solid-js"

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
  const [plannedSelection, setPlannedSelection] = createSignal<Partial<Record<NovelXResource, string>>>({})
  const [terrainQuery, setTerrainQuery] = createSignal("")

  const isNovelXInternal = (path: string) => {
    const normalized = file.normalize(path).replaceAll("\\", "/")
    return normalized === ".novelx" || normalized.startsWith(".novelx/")
  }
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
    const record = selectedGeographyRecord()
    if (record?.taskSessionId) return record.taskSessionId
    const terrain = selectedTerrain()
    if (!terrain) return
    const task = taskPartForTerrain(terrain.id)
    if (!task || task.type !== "tool" || !("metadata" in task.state)) return
    return typeof task.state.metadata?.sessionId === "string" ? task.state.metadata.sessionId : undefined
  })
  const selectedChildText = createMemo(() => {
    const sessionID = selectedChildSessionId()
    if (!sessionID) return ""
    return (sync().data.message[sessionID] ?? [])
      .filter((message) => message.role === "assistant")
      .flatMap((message) => sync().data.part[message.id] ?? [])
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim()
  })

  createEffect(() => {
    const sessionID = selectedChildSessionId()
    if (sessionID) void sync().session.sync(sessionID)
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
    if (normalized === file.normalize(view.activeFile())) return
    if (!document.canLeave()) {
      showToast({
        variant: "default",
        title: language.t("novelx.document.unsaved.title"),
        description: language.t("novelx.document.unsaved.description"),
      })
      return
    }
    const resource = active()
    if (resource) setPlannedSelection((current) => ({ ...current, [resource]: undefined }))
    view.setActiveFile(normalized)
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

  const resourcePath = (resource: NovelXResource) => {
    if (resource === "world") return "World"
    if (resource === "characters") {
      if (file.tree.children("").some((node) => file.normalize(node.path) === file.normalize("Characters"))) {
        return "Characters"
      }
      return "World/characters"
    }
    if (resource === "story") {
      if (file.tree.children("").some((node) => file.normalize(node.path) === file.normalize("Stories")))
        return "Stories"
      return "Story"
    }
    return ""
  }

  const renderTree = (resource: NovelXResource) => {
    const path = resourcePath(resource)
    if (resource === "graph" || resource === "package") {
      if (growthManifest()) return
      return <div class="novelx-resource-empty">{language.t("novelx.resource.noStructuredData")}</div>
    }
    if (growthManifest()) {
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
      <Match when={growth.state().status === "loading"}>
        <div class="novelx-resource-empty" role="status">
          正在读取生长骨架…
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
    if (growthManifest()) return
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
      <article class="novelx-geography-draft" data-status={status}>
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
          when={document.state()}
          fallback={
            resource === "world" && growthManifest() ? (
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
            <NovelXDocumentEditor
              state={state()}
              locked={document.locked()}
              lockedAgents={document.lockedAgents()}
              onInput={document.edit}
              onSave={() => void document.save()}
              onReload={document.reload}
            />
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
                    {resource() === "world" && growthManifest()
                      ? `${growthManifest()!.profile.title} · ${geographyProgress().committed}/${geographyProgress().total} 份地理档案已提交`
                      : language.t(resourceCopy[resource()].summary)}
                  </span>
                </div>
                <div class="novelx-resource-page-actions">
                  <Show when={resource() === "world" && growthManifest()}>
                    <button
                      type="button"
                      class="novelx-terrain-add-button"
                      onClick={() =>
                        showToast({
                          variant: "default",
                          title: "当前由 Growth 统一规划地形",
                          description: "第一阶段只接受 /growth 的整体验证与注册，暂不单独创建无因果地点。",
                        })
                      }
                    >
                      <Icon name="plus-small" size="small" />
                      新增地点
                    </button>
                  </Show>
                  <Show when={(view.activeFile() || selectedTerrain()) && !view.inspectorOpen()}>
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
                <Show when={view.inspectorOpen() && (view.activeFile() || selectedTerrain())}>
                  <aside class="novelx-resource-inspector">
                    <div class="novelx-resource-inspector-heading">
                      <strong>{selectedTerrain()?.name ?? language.t("novelx.resource.details")}</strong>
                      <button
                        type="button"
                        class="novelx-symbol-button"
                        aria-label={language.t("common.close")}
                        onClick={() => view.setInspectorOpen(false)}
                      >
                        <Icon name="close-small" size="small" />
                      </button>
                    </div>
                    <Show
                      when={selectedTerrain()}
                      fallback={
                        <dl>
                          <dt>{language.t("novelx.resource.path")}</dt>
                          <dd>{view.activeFile()}</dd>
                          <dt>{language.t("novelx.resource.state")}</dt>
                          <dd>{language.t("novelx.resource.realFile")}</dd>
                        </dl>
                      }
                    >
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
                    </Show>
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
          )}
        </For>
      </nav>
    </aside>
  )
}
