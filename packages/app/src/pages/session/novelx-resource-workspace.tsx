import { Icon } from "@opencode-ai/ui/icon"
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

const plannedKindLabel = (kind: NovelXGrowthNavigationItem["kind"]) =>
  ({
    group: "结构层",
    slot: "待填充槽位",
    view: "空图谱视图",
    chapter: "标准空章节",
    section: "世界包区段",
    file: "待物化文件",
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
  const view = layout.novelx.project(() => sdk().directory)
  const document = createNovelXDocumentController({ path: view.activeFile })
  const growth = createNovelXGrowthSkeletonController()
  const [plannedSelection, setPlannedSelection] = createSignal<Partial<Record<NovelXResource, string>>>({})

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
        <section class="novelx-growth-tree" aria-label="生长骨架">
          <div class="novelx-growth-tree-heading">
            <strong>生长骨架</strong>
            <span>待填充</span>
          </div>
          <For each={novelXGrowthNavigationItems(growthManifest()!, resource)}>
            {(item) => (
              <button
                type="button"
                class="novelx-growth-tree-item"
                classList={{
                  "is-group": item.kind === "group",
                  "is-selected": plannedSelection()[resource] === item.id,
                }}
                style={{ "--novelx-growth-depth": item.depth }}
                aria-pressed={plannedSelection()[resource] === item.id}
                title={item.path ?? item.label}
                onClick={() => selectPlanned(item)}
              >
                <span class="novelx-growth-tree-mark" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            )}
          </For>
        </section>
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

  const growthOverview = (resource: NovelXResource) => {
    const manifest = growthManifest()
    if (!manifest) return
    const counts = {
      files: manifest.surfaces.files.items.length,
      world: manifest.surfaces.world.layers.reduce((total, layer) => total + layer.slots.length, 0),
      characters: manifest.surfaces.characters.groups.reduce((total, group) => total + group.slots.length, 0),
      graph: manifest.surfaces.graph.views.length,
      story: manifest.surfaces.story.chapters.length,
      package: manifest.surfaces.package.sections.length,
    }
    return (
      <div class="novelx-growth-overview">
        <NovelXResourceIcon resource={resource} size={28} />
        <span class="novelx-growth-state">生长骨架已注册 · 尚未生成正式内容</span>
        <h2>{manifest.profile.title}</h2>
        <p>
          {manifest.profile.genre.label} · {manifest.profile.genre.scale}
        </p>
        <dl>
          <div>
            <dt>当前工作面</dt>
            <dd>{counts[resource]} 个待填充项</dd>
          </div>
          <div>
            <dt>世界结构</dt>
            <dd>{manifest.profile.worldLayers.length} 层</dd>
          </div>
          <div>
            <dt>标准章节</dt>
            <dd>{manifest.profile.chapterCount} 章</dd>
          </div>
        </dl>
        <small>从左侧选择一个空槽位查看它的后续职责。Growth 只注册道路，不会把计划冒充成世界事实。</small>
      </div>
    )
  }

  const plannedPrimary = (resource: NovelXResource) => {
    const item = selectedPlanned()
    if (!item) return growthOverview(resource)
    return (
      <div class="novelx-resource-selection">
        <NovelXResourceIcon resource={resource} size={28} />
        <span class="novelx-growth-state">{plannedKindLabel(item.kind)} · 待填充</span>
        <strong>{item.label}</strong>
        <span>这是 Growth 注册的空骨架节点。后续 Agent 可以沿此道路创建内容；当前没有正文、事实或已应用修改。</span>
        <Show when={item.path}>
          <code>{item.path}</code>
        </Show>
      </div>
    )
  }

  const primary = (resource: NovelXResource) => (
    <div class="novelx-resource-primary">
      <div class="novelx-resource-primary-body">
        <Show
          when={!selectedPlanned() && document.state()}
          fallback={
            plannedPrimary(resource) ?? (
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
                  <Show when={growthManifest()}>
                    <span>（生长·骨架已注册）</span>
                  </Show>
                </div>
                <Show when={(view.activeFile() || selectedPlanned()) && !view.inspectorOpen()}>
                  <button
                    type="button"
                    class="novelx-symbol-button"
                    aria-label={language.t("novelx.resource.openDetails")}
                    onClick={() => view.setInspectorOpen(true)}
                  >
                    <Icon name="sidebar" size="small" />
                  </button>
                </Show>
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
                <Show when={view.inspectorOpen() && (view.activeFile() || selectedPlanned())}>
                  <aside class="novelx-resource-inspector">
                    <div class="novelx-resource-inspector-heading">
                      <strong>{language.t("novelx.resource.details")}</strong>
                      <button
                        type="button"
                        class="novelx-symbol-button"
                        aria-label={language.t("common.close")}
                        onClick={() => view.setInspectorOpen(false)}
                      >
                        <Icon name="close-small" size="small" />
                      </button>
                    </div>
                    <dl>
                      <dt>{language.t("novelx.resource.path")}</dt>
                      <dd>{selectedPlanned()?.path ?? (view.activeFile() || "尚未物化")}</dd>
                      <dt>{language.t("novelx.resource.state")}</dt>
                      <dd>
                        {selectedPlanned()
                          ? `${plannedKindLabel(selectedPlanned()!.kind)} · 待填充`
                          : language.t("novelx.resource.realFile")}
                      </dd>
                      <Show when={selectedPlanned()?.parentLabel}>
                        <dt>所属结构</dt>
                        <dd>{selectedPlanned()?.parentLabel}</dd>
                      </Show>
                    </dl>
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
