import { Icon } from "@opencode-ai/ui/icon"
import type { NovelXGrowth } from "@opencode-ai/schema"
import { NovelXResourceIcon } from "@/components/novelx-resource-icon"
import FileTree from "@/components/file-tree"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { NOVELX_RESOURCES, type NovelXResource } from "@/context/novelx-workspace"
import { useSDK } from "@/context/sdk"
import { createNovelXDocumentController } from "@/context/novelx-document"
import {
  createNovelXGrowthSkeletonController,
  novelXGrowthNavigationItems,
  type NovelXGrowthNavigationItem,
} from "@/context/novelx-growth-skeleton"
import { showToast } from "@/utils/toast"
import { NovelXDocumentEditor } from "./novelx-document-editor"
import "./novelx-document-editor.css"
import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js"

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

const terrainAreaPath = (map: NovelXGrowth.RegisteredTerrainNode["map"]) => {
  const left = map.x
  const top = map.y
  const right = map.x + map.width
  const bottom = map.y + map.height
  return [
    `M ${left + map.width * 0.12} ${top + map.height * 0.08}`,
    `C ${left + map.width * 0.32} ${top - map.height * 0.03}, ${right - map.width * 0.24} ${top + map.height * 0.02}, ${right - map.width * 0.08} ${top + map.height * 0.2}`,
    `C ${right + map.width * 0.03} ${top + map.height * 0.4}, ${right - map.width * 0.02} ${bottom - map.height * 0.2}, ${right - map.width * 0.16} ${bottom - map.height * 0.06}`,
    `C ${right - map.width * 0.38} ${bottom + map.height * 0.03}, ${left + map.width * 0.26} ${bottom - map.height * 0.02}, ${left + map.width * 0.08} ${bottom - map.height * 0.18}`,
    `C ${left - map.width * 0.03} ${bottom - map.height * 0.42}, ${left + map.width * 0.01} ${top + map.height * 0.28}, ${left + map.width * 0.12} ${top + map.height * 0.08} Z`,
  ].join(" ")
}

const terrainLinePath = (node: NovelXGrowth.RegisteredTerrainNode) => {
  const map = node.map
  if (map.width >= map.height) {
    return `M ${map.x} ${map.y + map.height * 0.62} C ${map.x + map.width * 0.25} ${map.y + map.height * 0.18}, ${map.x + map.width * 0.65} ${map.y + map.height * 0.82}, ${map.x + map.width} ${map.y + map.height * 0.38}`
  }
  return `M ${map.x + map.width * 0.42} ${map.y} C ${map.x + map.width * 0.82} ${map.y + map.height * 0.26}, ${map.x + map.width * 0.18} ${map.y + map.height * 0.64}, ${map.x + map.width * 0.56} ${map.y + map.height}`
}

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
  const view = layout.novelx.project(() => sdk().directory)
  const document = createNovelXDocumentController({ path: view.activeFile })
  const growth = createNovelXGrowthSkeletonController()
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
    if (active() !== "world" || view.activeFile()) return
    const manifest = growthManifest()
    if (!manifest) return
    const selected = selectedPlanned()?.id
    return (
      manifest.terrain.nodes.find((node) => node.id === selected) ??
      manifest.terrain.nodes.find((node) => node.prominence === "core") ??
      manifest.terrain.nodes[0]
    )
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
    view.setActiveFile("")
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
              <span>已注册</span>
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
                  title={item.label}
                  onClick={() => selectPlanned(item)}
                >
                  <span
                    class="novelx-growth-tree-mark"
                    data-kind={growthManifest()!.terrain.nodes.find((node) => node.id === item.id)?.kind}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
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
    const nodes = new Map(manifest.terrain.nodes.map((node) => [node.id, node]))
    return (
      <div class="novelx-terrain-atlas" aria-label={`${manifest.profile.title}地形总览`}>
        <div class="novelx-terrain-atlas-wash" aria-hidden="true" />
        <svg viewBox="0 0 100 100" role="img" aria-label="按已注册空间坐标生成的地形总览">
          <g class="novelx-terrain-relations" aria-hidden="true">
            <For each={manifest.terrain.relations}>
              {(relation) => {
                const from = nodes.get(relation.fromId)
                const to = nodes.get(relation.toId)
                if (!from || !to) return
                return (
                  <line
                    x1={from.map.x + from.map.width / 2}
                    y1={from.map.y + from.map.height / 2}
                    x2={to.map.x + to.map.width / 2}
                    y2={to.map.y + to.map.height / 2}
                  />
                )
              }}
            </For>
          </g>
          <For each={manifest.terrain.nodes}>
            {(node) => (
              <g
                class="novelx-terrain-node"
                classList={{
                  "is-selected": selectedTerrain()?.id === node.id,
                  "is-water": node.kind === "ocean" || node.kind === "sea",
                  "is-linear": node.kind === "river" || node.kind === "mountain_range" || node.kind === "coast",
                }}
                data-kind={node.kind}
                role="button"
                tabindex="0"
                aria-label={`${node.name}，${terrainKindLabel(node.kind)}`}
                onClick={() =>
                  selectPlanned({ id: node.id, label: node.name, resource: "world", kind: "terrain", depth: 0 })
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  selectPlanned({ id: node.id, label: node.name, resource: "world", kind: "terrain", depth: 0 })
                }}
              >
                <rect
                  class="novelx-terrain-hit"
                  x={node.map.x}
                  y={node.map.y}
                  width={node.map.width}
                  height={node.map.height}
                />
                <Show
                  when={node.kind === "river" || node.kind === "mountain_range" || node.kind === "coast"}
                  fallback={<path class="novelx-terrain-shape" d={terrainAreaPath(node.map)} />}
                >
                  <path class="novelx-terrain-line" d={terrainLinePath(node)} />
                </Show>
                <Show when={node.kind === "mountain_range"}>
                  <path
                    class="novelx-terrain-ridge"
                    d={`M ${node.map.x + node.map.width * 0.18} ${node.map.y + node.map.height * 0.72} l ${node.map.width * 0.12} ${-node.map.height * 0.42} l ${node.map.width * 0.11} ${node.map.height * 0.38} l ${node.map.width * 0.14} ${-node.map.height * 0.5} l ${node.map.width * 0.13} ${node.map.height * 0.46}`}
                  />
                </Show>
                <Show
                  when={
                    selectedTerrain()?.id === node.id ||
                    node.parentId === null ||
                    node.prominence === "core" ||
                    node.map.width * node.map.height >= 180
                  }
                >
                  <text
                    x={node.kind === "river" ? node.map.x + node.map.width * 0.74 : node.map.x + node.map.width / 2}
                    y={
                      node.kind === "mountain_range"
                        ? node.map.y + node.map.height * 0.16
                        : node.map.y + node.map.height / 2
                    }
                  >
                    {node.name}
                  </text>
                </Show>
              </g>
            )}
          </For>
        </svg>
        <div class="novelx-terrain-compass" aria-hidden="true">
          <span>北</span>
          <i />
        </div>
      </div>
    )
  }

  const primary = (resource: NovelXResource) => (
    <div class="novelx-resource-primary">
      <div class="novelx-resource-primary-body">
        <Show
          when={document.state()}
          fallback={
            resource === "world" && growthManifest() ? (
              terrainAtlas()
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
                      ? `${growthManifest()!.profile.title}的地理与区域`
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
                              <dd>已注册</dd>
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
