import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import FileTree from "@/components/file-tree"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { NOVELX_RESOURCES, type NovelXResource } from "@/context/novelx-workspace"
import { useSDK } from "@/context/sdk"
import { For, Match, Show, Switch, createMemo } from "solid-js"
import { createStore } from "solid-js/store"

const resourceIcon: Record<NovelXResource, IconProps["name"]> = {
  files: "file-tree",
  world: "branch",
  characters: "subagent",
  graph: "fork",
  story: "bullet-list",
  package: "archive",
}

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

export function NovelXResourceWorkspace(props: {
  rootPaths: () => string[]
  modified: () => string[]
  kinds: () => Map<string, "add" | "del" | "mix">
  rootEmpty: () => boolean
  worldStatus: () => "error" | "loading" | "empty" | "tree"
  worldError: () => string | undefined
  onOpenFile: (path: string) => void
}) {
  const file = useFile()
  const language = useLanguage()
  const layout = useLayout()
  const sdk = useSDK()
  const view = layout.novelx.project(() => sdk().directory)
  const [store, setStore] = createStore({ selectedPath: undefined as string | undefined })

  const active = view.activeResource
  const title = createMemo(() => {
    const resource = active()
    return resource ? language.t(resourceLabel(resource)) : language.t("novelx.resources.fileContents")
  })

  const select = (path: string) => {
    setStore("selectedPath", path)
    props.onOpenFile(path)
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
      if (file.tree.children("").some((node) => file.normalize(node.path) === file.normalize("Stories"))) return "Stories"
      return "Story"
    }
    return ""
  }

  const renderTree = (resource: NovelXResource) => {
    const path = resourcePath(resource)
    if (resource === "graph" || resource === "package") {
      return <div class="novelx-resource-empty">{language.t("novelx.resource.noStructuredData")}</div>
    }
    return (
      <FileTree
        path={path}
        allowed={path ? undefined : props.rootPaths()}
        modified={props.modified()}
        kinds={props.kinds()}
        active={store.selectedPath}
        onFileClick={(node) => select(node.path)}
      />
    )
  }

  const resourceEmpty = (resource: NovelXResource) => {
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
    if (resource === "files" && props.rootEmpty()) {
      return <div class="novelx-resource-empty">{language.t("session.files.empty")}</div>
    }
  }

  const primary = (resource: NovelXResource) => (
    <div class="novelx-resource-primary">
      <div class="novelx-resource-primary-heading">
        <div>
          <span>{language.t(resourceLabel(resource))}</span>
          <small>{language.t(resourceCopy[resource].summary)}</small>
        </div>
        <Show when={store.selectedPath && !view.inspectorOpen()}>
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
      <div class="novelx-resource-primary-body">
        <Show
          when={store.selectedPath}
          fallback={
            <div class="novelx-resource-blank">
              {resourceScaffold(resource)}
              <Icon name={resourceIcon[resource]} size="large" />
              <strong>{language.t(resourceCopy[resource].emptyTitle)}</strong>
              <span>{language.t(resourceCopy[resource].emptyDescription)}</span>
            </div>
          }
        >
          {(path) => (
            <div class="novelx-resource-selection">
              <Icon name={resourceIcon[resource]} size="large" />
              <strong>{path()}</strong>
              <span>{language.t("novelx.resource.openedInEditor")}</span>
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
              <div class="novelx-compact-files-tree">
                <Show
                  when={!props.rootEmpty()}
                  fallback={<div class="novelx-resource-empty">{language.t("session.files.empty")}</div>}
                >
                  <FileTree
                    path=""
                    allowed={props.rootPaths()}
                    modified={props.modified()}
                    kinds={props.kinds()}
                    active={store.selectedPath}
                    onFileClick={(node) => {
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
              <nav class="novelx-resource-navigator" aria-label={title()}>
                <div class="novelx-resource-page-title">
                  <Icon name={resourceIcon[resource()]} size="normal" />
                  <strong>{title()}</strong>
                </div>
                <div class="novelx-resource-navigator-tree">
                  {resourceEmpty(resource())}
                  {renderTree(resource())}
                </div>
              </nav>
              {primary(resource())}
              <Show when={view.inspectorOpen() && store.selectedPath}>
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
                    <dd>{store.selectedPath}</dd>
                    <dt>{language.t("novelx.resource.state")}</dt>
                    <dd>{language.t("novelx.resource.realFile")}</dd>
                  </dl>
                </aside>
              </Show>
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
              <Icon name={resourceIcon[resource]} size="normal" />
            </button>
          )}
        </For>
      </nav>
    </aside>
  )
}
