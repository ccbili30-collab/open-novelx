import { getFilename } from "@opencode-ai/core/util/path"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Show, createEffect, createMemo, onCleanup } from "solid-js"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout, type LocalProject } from "@/context/layout"
import { shortcutKey, type NovelXShortcut } from "@/context/novelx-workspace"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { tabKey, useTabs } from "@/context/tabs"
import { ProjectIcon } from "@/pages/layout/sidebar-items"
import { sessionTitle } from "@/utils/session-title"
import { pathKey } from "@/utils/path-key"
import { selectProjectSessions } from "./novelx-workspace-model"
import { useSessionKey } from "./session-layout"

type DragItem =
  | { type: "project"; id: string }
  | { type: "session"; id: string; directory: string }
  | { type: "shortcut"; id: string }

export function NovelXWorkspaceSidebar() {
  const command = useCommand()
  const language = useLanguage()
  const layout = useLayout()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const tabs = useTabs()
  const route = useSessionKey()

  const server = createMemo(() => ServerConnection.key(serverSDK().server))
  const projects = createMemo(() => layout.projects.list())
  const currentDirectory = createMemo(() => sdk().directory)
  const currentProject = createMemo(() =>
    projects().find((project) => pathKey(project.worktree) === pathKey(currentDirectory())),
  )
  const view = layout.novelx.project(currentDirectory)
  const resourceOpen = createMemo(() => !!view.activeResource())
  const shortcuts = layout.novelx.shortcuts

  let drag: DragItem | undefined

  const projectName = (project: LocalProject) => project.name || getFilename(project.worktree)
  const projectSessions = (project: LocalProject) => {
    const [projectStore] = serverSync().child(project.worktree, { bootstrap: false })
    const sessions = selectProjectSessions(projectStore.session)
    const byID = new Map(sessions.map((session) => [session.id, session]))
    return layout.novelx
      .sessionOrder(
        project.worktree,
        sessions.map((session) => session.id),
      )
      .flatMap((id) => {
        const session = byID.get(id)
        return session ? [session] : []
      })
  }
  const pinned = (shortcut: NovelXShortcut) =>
    shortcuts().some((item) => shortcutKey(item) === shortcutKey(shortcut))

  const newTask = (directory = currentDirectory()) => {
    void tabs.newDraft({ server: server(), directory })
  }

  const openSession = (sessionID: string) => {
    const tab = tabs.addSessionTab({ server: server(), sessionId: sessionID })
    tabs.select(tab)
  }

  const openProject = (project: LocalProject) => {
    const sessions = projectSessions(project)
    const sessionIDs = new Set(sessions.map((session) => session.id))
    const opened = [...tabs.store].reverse().find((tab) => {
      if (tab.type === "draft") return pathKey(tab.directory) === pathKey(project.worktree)
      const directory = tabs.info[tabKey(tab)]?.directory
      if (directory) return pathKey(directory) === pathKey(project.worktree)
      return sessionIDs.has(tab.sessionId)
    })
    if (opened) {
      tabs.select(opened)
      return
    }
    const latest = sessions[0]
    if (latest) {
      openSession(latest.id)
      return
    }
    newTask(project.worktree)
  }

  const shortcutLabel = (shortcut: NovelXShortcut) => {
    const project = projects().find((item) => pathKey(item.worktree) === pathKey(shortcut.directory))
    if (shortcut.type === "project") return project ? projectName(project) : getFilename(shortcut.directory)
    const session = project ? projectSessions(project).find((item) => item.id === shortcut.sessionID) : undefined
    return sessionTitle(session?.title) || language.t("command.session.new")
  }

  const openShortcut = (shortcut: NovelXShortcut) => {
    if (shortcut.type === "session") {
      openSession(shortcut.sessionID)
      return
    }
    const project = projects().find((item) => pathKey(item.worktree) === pathKey(shortcut.directory))
    if (project) openProject(project)
  }

  const startDrag = (item: DragItem, event: DragEvent) => {
    drag = item
    event.dataTransfer?.setData("text/plain", item.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"
  }
  const stopDrag = () => {
    drag = undefined
  }
  const allowDrop = (event: DragEvent) => {
    if (!drag) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
  }
  const dropProject = (project: LocalProject, index: number, event: DragEvent) => {
    event.preventDefault()
    if (drag?.type !== "project") return
    layout.projects.move(drag.id, index)
    drag = undefined
  }
  const dropSession = (project: LocalProject, sessionID: string, index: number, event: DragEvent) => {
    event.preventDefault()
    if (drag?.type !== "session" || drag.directory !== project.worktree) return
    layout.novelx.moveSession(
      project.worktree,
      projectSessions(project).map((session) => session.id),
      drag.id,
      index,
    )
    drag = undefined
  }
  const dropShortcut = (id: string, index: number, event: DragEvent) => {
    event.preventDefault()
    if (drag?.type !== "shortcut") return
    layout.novelx.moveShortcut(drag.id, index)
    drag = undefined
  }

  createEffect(() => {
    if (!resourceOpen() || !view.leftExpanded()) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      view.setLeftExpanded(false)
    }
    window.addEventListener("keydown", close)
    onCleanup(() => window.removeEventListener("keydown", close))
  })

  const projectRail = () => (
    <aside class="novelx-project-rail" aria-label={language.t("novelx.sidebar.projects")}>
      <div class="novelx-project-tiles">
        <For each={projects()}>
          {(project, index) => (
            <button
              type="button"
              draggable={true}
              class="novelx-project-tile"
              classList={{ "is-current": project === currentProject() }}
              aria-label={projectName(project)}
              title={projectName(project)}
              onClick={() => openProject(project)}
              onDragStart={(event) => startDrag({ type: "project", id: project.worktree }, event)}
              onDragEnd={stopDrag}
              onDragOver={allowDrop}
              onDrop={(event) => dropProject(project, index(), event)}
            >
              <ProjectIcon project={project} />
            </button>
          )}
        </For>
        <button
          type="button"
          class="novelx-project-tile is-add"
          aria-label={language.t("novelx.sidebar.openProject")}
          title={language.t("novelx.sidebar.openProject")}
          onClick={() => command.trigger("project.open")}
        >
          <Icon name="plus" size="small" />
        </button>
      </div>
    </aside>
  )

  const projectPanel = () => (
    <aside
      class="novelx-project-sidebar"
      classList={{ "is-overlay": resourceOpen() }}
      aria-label={language.t("novelx.sidebar.label")}
    >
      <div class="novelx-project-heading">
        <h2>{language.t("novelx.sidebar.projects")}</h2>
        <button
          type="button"
          class="novelx-symbol-button"
          aria-label={language.t("novelx.sidebar.openProject")}
          title={language.t("novelx.sidebar.openProject")}
          onClick={() => command.trigger("project.open")}
        >
          <Icon name="folder" size="small" />
        </button>
      </div>

      <Show when={shortcuts().length > 0}>
        <div class="novelx-shortcut-section">
          <div class="novelx-section-label">{language.t("novelx.sidebar.shortcuts")}</div>
          <For each={shortcuts()}>
            {(shortcut, index) => {
              const id = () => shortcutKey(shortcut)
              return (
                <div
                  class="novelx-shortcut-row"
                  draggable={true}
                  onDragStart={(event) => startDrag({ type: "shortcut", id: id() }, event)}
                  onDragEnd={stopDrag}
                  onDragOver={allowDrop}
                  onDrop={(event) => dropShortcut(id(), index(), event)}
                >
                  <button type="button" class="novelx-shortcut-open" onClick={() => openShortcut(shortcut)}>
                    <Icon name={shortcut.type === "project" ? "folder" : "prompt"} size="small" />
                    <span>{shortcutLabel(shortcut)}</span>
                  </button>
                  <button
                    type="button"
                    class="novelx-symbol-button"
                    aria-label={language.t("novelx.sidebar.unpin")}
                    title={language.t("novelx.sidebar.unpin")}
                    onClick={() => layout.novelx.toggleShortcut(shortcut)}
                  >
                    <Icon name="link" size="small" />
                  </button>
                </div>
              )
            }}
          </For>
        </div>
      </Show>

      <div class="novelx-project-list">
        <For each={projects()}>
          {(project, projectIndex) => {
            const expanded = () => project.expanded
            const sessions = () => projectSessions(project)
            const projectShortcut = { type: "project" as const, directory: project.worktree }
            return (
              <section
                class="novelx-project-group"
                onDragOver={allowDrop}
                onDrop={(event) => dropProject(project, projectIndex(), event)}
              >
                <div
                  class="novelx-project-row"
                  classList={{ "is-current": project === currentProject() }}
                  draggable={true}
                  onDragStart={(event) => startDrag({ type: "project", id: project.worktree }, event)}
                  onDragEnd={stopDrag}
                >
                  <button
                    type="button"
                    class="novelx-project-expand"
                    aria-label={expanded() ? language.t("common.collapse") : language.t("common.expand")}
                    aria-expanded={expanded()}
                    onClick={() =>
                      expanded() ? layout.projects.collapse(project.worktree) : layout.projects.expand(project.worktree)
                    }
                  >
                    <Icon name="chevron-down" size="small" classList={{ "-rotate-90": !expanded() }} />
                  </button>
                  <button type="button" class="novelx-project-open" onClick={() => openProject(project)}>
                    <Icon name="folder" size="small" />
                    <span title={projectName(project)}>{projectName(project)}</span>
                  </button>
                  <button
                    type="button"
                    class="novelx-symbol-button"
                    aria-label={pinned(projectShortcut) ? language.t("novelx.sidebar.unpin") : language.t("novelx.sidebar.pin")}
                    aria-pressed={pinned(projectShortcut)}
                    onClick={() => layout.novelx.toggleShortcut(projectShortcut)}
                  >
                    <Icon name="link" size="small" />
                  </button>
                  <button
                    type="button"
                    class="novelx-symbol-button"
                    aria-label={language.t("novelx.sidebar.newTask")}
                    title={language.t("novelx.sidebar.newTask")}
                    onClick={() => newTask(project.worktree)}
                  >
                    <Icon name="plus-small" size="small" />
                  </button>
                </div>

                <Show when={expanded()}>
                  <nav class="novelx-session-tree" aria-label={`${projectName(project)} · ${language.t("novelx.sidebar.sessions")}`}>
                    <Show
                      when={sessions().length > 0}
                      fallback={<div class="novelx-session-empty">{language.t("novelx.sidebar.noSessions")}</div>}
                    >
                      <For each={sessions()}>
                        {(session, index) => {
                          const selected = () => route.params.id === session.id
                          const [projectStore] = serverSync().child(project.worktree, { bootstrap: false })
                          const running = () => projectStore.session_working(session.id)
                          const shortcut = { type: "session" as const, directory: project.worktree, sessionID: session.id }
                          return (
                            <div
                              class="novelx-session-row"
                              classList={{ "is-selected": selected() }}
                              draggable={true}
                              onDragStart={(event) =>
                                startDrag({ type: "session", id: session.id, directory: project.worktree }, event)
                              }
                              onDragEnd={stopDrag}
                              onDragOver={allowDrop}
                              onDrop={(event) => dropSession(project, session.id, index(), event)}
                            >
                              <button type="button" class="novelx-session-open" onClick={() => openSession(session.id)}>
                                <Icon name="prompt" size="small" />
                                <span>{sessionTitle(session.title) || language.t("command.session.new")}</span>
                                <Show when={running()}>
                                  <span class="novelx-running-dot" aria-label={language.t("novelx.sidebar.running")} />
                                </Show>
                              </button>
                              <button
                                type="button"
                                class="novelx-symbol-button"
                                aria-label={pinned(shortcut) ? language.t("novelx.sidebar.unpin") : language.t("novelx.sidebar.pin")}
                                aria-pressed={pinned(shortcut)}
                                onClick={() => layout.novelx.toggleShortcut(shortcut)}
                              >
                                <Icon name="link" size="small" />
                              </button>
                            </div>
                          )
                        }}
                      </For>
                    </Show>
                  </nav>
                </Show>
              </section>
            )
          }}
        </For>
      </div>
    </aside>
  )

  return (
    <div
      class="novelx-project-navigation hidden md:block"
      classList={{ "is-expanded": view.leftExpanded() && !resourceOpen(), "has-resource": resourceOpen() }}
    >
      <Show when={!view.leftExpanded() || resourceOpen()}>{projectRail()}</Show>
      <Show when={view.leftExpanded()}>{projectPanel()}</Show>
    </div>
  )
}
