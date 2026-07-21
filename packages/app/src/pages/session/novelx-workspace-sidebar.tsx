import { getFilename } from "@opencode-ai/core/util/path"
import { Icon } from "@opencode-ai/ui/icon"
import { ContextMenu } from "@opencode-ai/ui/context-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { produce } from "solid-js/store"
import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import { DialogCreateProject } from "@/components/dialog-create-project"
import { openCreatedProject } from "@/components/project-create-flow"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout, type LocalProject } from "@/context/layout"
import { shortcutKey, type NovelXShortcut } from "@/context/novelx-workspace"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { usePlatform } from "@/context/platform"
import { tabKey, useTabs } from "@/context/tabs"
import { showToast } from "@/utils/toast"
import { sessionTitle } from "@/utils/session-title"
import { pathKey } from "@/utils/path-key"
import { projectMonogram, selectProjectSessions } from "./novelx-workspace-model"
import { useSessionKey } from "./session-layout"
import { assertCompleteSessionList, requestSessionDeletion, sessionExistsFromGetResult } from "./session-delete"

type DragItem =
  | { type: "project"; id: string }
  | { type: "session"; id: string; directory: string }
  | { type: "shortcut"; id: string }

export function NovelXWorkspaceSidebar() {
  const command = useCommand()
  const dialog = useDialog()
  const language = useLanguage()
  const layout = useLayout()
  const platform = usePlatform()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const tabs = useTabs()
  const route = useSessionKey()

  const server = createMemo(() => ServerConnection.key(serverSDK().server))
  const projects = createMemo(() => layout.projects.list())
  const currentDirectory = createMemo(() => sdk().directory)
  const currentProject = createMemo(() => {
    const directory = pathKey(currentDirectory())
    return projects().find(
      (project) =>
        pathKey(project.worktree) === directory || project.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
    )
  })
  const view = layout.novelx.project(currentDirectory)
  const resourceOpen = createMemo(() => !!view.activeResource())
  const shortcuts = layout.novelx.shortcuts

  const [drag, setDrag] = createSignal<DragItem>()
  const [pending, setPending] = createSignal<ReadonlySet<string>>(new Set())

  const canCreateProject = createMemo(
    () =>
      platform.platform === "desktop" &&
      !!platform.createProjectDirectory &&
      ServerConnection.local(serverSDK().server),
  )

  const setPendingKey = (key: string, value: boolean) => {
    setPending((current) => {
      const next = new Set(current)
      if (value) next.add(key)
      if (!value) next.delete(key)
      return next
    })
  }

  const errorText = (error: unknown) => (error instanceof Error && error.message ? error.message : String(error))

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
  const pinned = (shortcut: NovelXShortcut) => shortcuts().some((item) => shortcutKey(item) === shortcutKey(shortcut))

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

  const activateCreatedProject = async (directory: string, expectedProjectID: string) => {
    const client = serverSDK().createClient({ directory, throwOnError: true })
    await openCreatedProject({
      directory,
      verify: async () => {
        const project = (await client.project.current()).data
        return project?.id === expectedProjectID && pathKey(project.worktree) === pathKey(directory)
      },
      register: (value) => layout.projects.open(value),
      unregister: (value) => layout.projects.remove(value),
      activate: async (value) => {
        await tabs.newDraft({ server: server(), directory: value })
      },
    })
  }

  const showCreateProject = () => {
    if (!canCreateProject()) {
      showToast({ title: language.t("novelx.project.create.unavailable") })
      return
    }
    dialog.show(() => <DialogCreateProject openProject={activateCreatedProject} />)
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
    setDrag(item)
    event.dataTransfer?.setData("text/plain", item.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"
  }
  const stopDrag = () => {
    setDrag(undefined)
  }
  const allowDrop = (event: DragEvent) => {
    if (!drag()) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
  }
  const dropProject = (project: LocalProject, index: number, event: DragEvent) => {
    event.preventDefault()
    const item = drag()
    if (item?.type !== "project") return
    layout.projects.move(item.id, index)
    setDrag(undefined)
  }
  const dropSession = (project: LocalProject, sessionID: string, index: number, event: DragEvent) => {
    event.preventDefault()
    const item = drag()
    if (item?.type !== "session" || item.directory !== project.worktree) return
    layout.novelx.moveSession(
      project.worktree,
      projectSessions(project).map((session) => session.id),
      item.id,
      index,
    )
    setDrag(undefined)
  }
  const pinDraggedItem = (event: DragEvent, toIndex?: number) => {
    event.preventDefault()
    const item = drag()
    if (!item) return
    if (item.type === "shortcut") {
      if (toIndex !== undefined) layout.novelx.moveShortcut(item.id, toIndex)
      setDrag(undefined)
      return
    }
    const shortcut: NovelXShortcut =
      item.type === "project"
        ? { type: "project", directory: item.id }
        : { type: "session", directory: item.directory, sessionID: item.id }
    layout.novelx.pinShortcut(shortcut)
    setDrag(undefined)
  }

  const removeProjectTabs = (project: LocalProject, sessionIDs: ReadonlySet<string>) => {
    for (let index = tabs.store.length - 1; index >= 0; index--) {
      const tab = tabs.store[index]
      if (!tab) continue
      if (tab.type === "draft") {
        if (pathKey(tab.directory) === pathKey(project.worktree)) tabs.removeTab(index)
        continue
      }
      const directory = tabs.info[tabKey(tab)]?.directory
      if (
        (directory && pathKey(directory) === pathKey(project.worktree)) ||
        (!directory && sessionIDs.has(tab.sessionId))
      ) {
        tabs.removeTab(index)
      }
    }
  }

  const deleteSession = async (project: LocalProject, sessionID: string) => {
    const key = `session:${project.worktree}:${sessionID}`
    if (pending().has(key)) return
    const [projectStore, setProjectStore] = serverSync().child(project.worktree, { bootstrap: false })
    const session = projectStore.session.find((item) => item.id === sessionID)
    if (!session) return
    const title = sessionTitle(session.title) || language.t("command.session.new")
    if (!window.confirm(`永久删除会话“${title}”？此操作无法撤销。`)) return

    setPendingKey(key, true)
    const client = serverSDK().createClient({ directory: project.worktree, throwOnError: true })
    const verifier = serverSDK().createClient({ directory: project.worktree })
    try {
      const removed = await requestSessionDeletion({
        sessionID,
        children: async (id) => (await client.session.children({ sessionID: id })).data ?? [],
        abort: async (id) => {
          await client.session.abort({ sessionID: id })
        },
        remove: async (id) => Boolean((await client.session.delete({ sessionID: id })).data),
        exists: async (id) => sessionExistsFromGetResult(await verifier.session.get({ sessionID: id })),
      })
      const removedSet = new Set(removed)
      setProjectStore(
        "session",
        produce((sessions) => {
          for (let index = sessions.length - 1; index >= 0; index--) {
            if (removedSet.has(sessions[index].id)) sessions.splice(index, 1)
          }
        }),
      )
      layout.novelx.removeSessions(project.worktree, removed)
      notifySessionTabsRemoved({ server: server(), directory: project.worktree, sessionIDs: removed })
    } catch (error) {
      showToast({ title: "删除会话失败", description: errorText(error) })
    } finally {
      setPendingKey(key, false)
    }
  }

  const trashProject = async (project: LocalProject) => {
    const key = `project:${project.worktree}`
    if (pending().has(key)) return
    if (
      !ServerConnection.local(serverSDK().server) ||
      !platform.authorizeProjectDirectoryTrash ||
      !platform.trashProjectDirectory
    ) {
      showToast({ title: "无法移入回收站", description: "只有本机 NovelX 项目支持此操作。" })
      return
    }

    setPendingKey(key, true)
    const client = serverSDK().createClient({ directory: project.worktree, throwOnError: true })
    try {
      const authorization = await platform.authorizeProjectDirectoryTrash(project.worktree)
      if (!authorization) return
      const sessionLimit = 10_000
      const listedSessions = (await client.session.list({ scope: "project", roots: false, limit: sessionLimit })).data
      const sessions = listedSessions && assertCompleteSessionList(listedSessions, sessionLimit)
      if (!sessions) throw new Error("无法确认项目会话，项目文件夹未移动")
      for (const session of sessions) {
        await client.session.abort({ sessionID: session.id })
      }
      await platform.trashProjectDirectory(authorization)
      const sessionIDs = new Set(sessions.map((session) => session.id))
      removeProjectTabs(project, sessionIDs)
      layout.novelx.removeProject(project.worktree)
      layout.projects.remove(project.worktree)
      showToast({ title: "已移入回收站", description: projectName(project) })
    } catch (error) {
      showToast({ title: "项目未删除", description: errorText(error) })
    } finally {
      setPendingKey(key, false)
    }
  }

  const dropTrash = (event: DragEvent) => {
    event.preventDefault()
    const item = drag()
    setDrag(undefined)
    if (!item) return
    if (item.type === "shortcut") {
      const shortcut = shortcuts().find((candidate) => shortcutKey(candidate) === item.id)
      if (shortcut) layout.novelx.removeShortcut(shortcut)
      return
    }
    if (item.type === "project") {
      const project = projects().find((candidate) => pathKey(candidate.worktree) === pathKey(item.id))
      if (project) void trashProject(project)
      return
    }
    const project = projects().find((candidate) => pathKey(candidate.worktree) === pathKey(item.directory))
    if (project) void deleteSession(project, item.id)
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
    <aside
      class="novelx-project-rail"
      classList={{ "is-dragging": !!drag() }}
      aria-label={language.t("novelx.sidebar.projects")}
    >
      <div
        class="novelx-shortcut-dock"
        classList={{ "is-pin-target": !!drag() && drag()?.type !== "shortcut" }}
        aria-label="固定快捷方式"
        onDragOver={allowDrop}
        onDrop={pinDraggedItem}
      >
        <For each={shortcuts()}>
          {(shortcut, index) => {
            const id = () => shortcutKey(shortcut)
            const label = () => shortcutLabel(shortcut)
            return (
              <ContextMenu>
                <ContextMenu.Trigger
                  as="button"
                  type="button"
                  draggable={true}
                  class="novelx-project-tile novelx-shortcut-tile"
                  aria-label={`快捷方式：${label()}`}
                  title={label()}
                  onClick={() => openShortcut(shortcut)}
                  onDragStart={(event: DragEvent) => startDrag({ type: "shortcut", id: id() }, event)}
                  onDragEnd={stopDrag}
                  onDragOver={allowDrop}
                  onDrop={(event: DragEvent) => pinDraggedItem(event, index())}
                >
                  <Show
                    when={shortcut.type === "session"}
                    fallback={
                      <span class="novelx-project-monogram" aria-hidden="true">
                        {projectMonogram(label())}
                      </span>
                    }
                  >
                    <Icon name="prompt" size="small" />
                  </Show>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content>
                    <ContextMenu.Item onSelect={() => layout.novelx.removeShortcut(shortcut)}>
                      <ContextMenu.ItemLabel>取消固定</ContextMenu.ItemLabel>
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu>
            )
          }}
        </For>
        <div class="novelx-pin-drop-target" aria-hidden="true">
          <Icon name="link" size="small" />
        </div>
      </div>

      <div class="novelx-project-tiles">
        <For each={projects()}>
          {(project, index) => (
            <ContextMenu>
              <ContextMenu.Trigger
                as="button"
                type="button"
                draggable={true}
                class="novelx-project-tile"
                classList={{ "is-current": project === currentProject() }}
                aria-current={project === currentProject() ? "page" : undefined}
                aria-label={projectName(project)}
                title={projectName(project)}
                disabled={pending().has(`project:${project.worktree}`)}
                onClick={() => openProject(project)}
                onDragStart={(event: DragEvent) => startDrag({ type: "project", id: project.worktree }, event)}
                onDragEnd={stopDrag}
                onDragOver={allowDrop}
                onDrop={(event: DragEvent) => dropProject(project, index(), event)}
              >
                <span class="novelx-project-monogram" aria-hidden="true">
                  {projectMonogram(projectName(project))}
                </span>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content>
                  <ContextMenu.Item onSelect={() => void trashProject(project)}>
                    <ContextMenu.ItemLabel>将项目文件夹移入回收站</ContextMenu.ItemLabel>
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu>
          )}
        </For>
        <MenuV2 modal={false} placement="right-start" gutter={4}>
          <MenuV2.Trigger
            as="button"
            type="button"
            class="novelx-project-tile is-add"
            aria-label={language.t("session.new.project.add")}
            title={language.t("session.new.project.add")}
          >
            <Icon name="plus" size="small" />
          </MenuV2.Trigger>
          <MenuV2.Portal>
            <MenuV2.Content>
              <MenuV2.Item disabled={!canCreateProject()} onSelect={showCreateProject}>
                <Icon name="plus" size="small" />
                {language.t("session.new.project.new")}
              </MenuV2.Item>
              <MenuV2.Item onSelect={() => command.trigger("project.open")}>
                <Icon name="folder" size="small" />
                {language.t("novelx.sidebar.openProject")}
              </MenuV2.Item>
            </MenuV2.Content>
          </MenuV2.Portal>
        </MenuV2>
      </div>

      <div
        class="novelx-trash-drop-target"
        classList={{ "is-active": !!drag() }}
        aria-label="垃圾桶"
        title={drag()?.type === "shortcut" ? "取消固定" : "拖到这里删除"}
        onDragOver={allowDrop}
        onDrop={dropTrash}
      >
        <Icon name="trash" size="small" />
      </div>
    </aside>
  )

  const projectPanel = () => (
    <aside
      class="novelx-project-sidebar"
      classList={{ "is-overlay": resourceOpen() }}
      aria-label={language.t("novelx.sidebar.label")}
    >
      <Show
        when={currentProject()}
        keyed
        fallback={
          <div class="novelx-project-heading">
            <h2>{getFilename(currentDirectory()) || language.t("novelx.sidebar.projects")}</h2>
          </div>
        }
      >
        {(project) => {
          const sessions = () => projectSessions(project)
          const projectShortcut = { type: "project" as const, directory: project.worktree }
          return (
            <>
              <div class="novelx-project-heading">
                <div class="novelx-current-project-title">
                  <h2 title={projectName(project)}>{projectName(project)}</h2>
                </div>
                <div class="novelx-project-heading-actions">
                  <button
                    type="button"
                    class="novelx-symbol-button"
                    aria-label={
                      pinned(projectShortcut) ? language.t("novelx.sidebar.unpin") : language.t("novelx.sidebar.pin")
                    }
                    aria-pressed={pinned(projectShortcut)}
                    title={
                      pinned(projectShortcut) ? language.t("novelx.sidebar.unpin") : language.t("novelx.sidebar.pin")
                    }
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
              </div>

              <div class="novelx-project-list">
                <div class="novelx-section-label">{language.t("novelx.sidebar.sessions")}</div>
                <nav
                  class="novelx-session-tree is-current-project"
                  aria-label={`${projectName(project)} · ${language.t("novelx.sidebar.sessions")}`}
                >
                  <Show
                    when={sessions().length > 0}
                    fallback={<div class="novelx-session-empty">{language.t("novelx.sidebar.noSessions")}</div>}
                  >
                    <For each={sessions()}>
                      {(session, index) => {
                        const selected = () => route.params.id === session.id
                        const [projectStore] = serverSync().child(project.worktree, { bootstrap: false })
                        const running = () => projectStore.session_working(session.id)
                        const shortcut = {
                          type: "session" as const,
                          directory: project.worktree,
                          sessionID: session.id,
                        }
                        return (
                          <ContextMenu>
                            <ContextMenu.Trigger
                              as="div"
                              class="novelx-session-row"
                              classList={{ "is-selected": selected() }}
                              draggable={true}
                              onDragStart={(event: DragEvent) =>
                                startDrag({ type: "session", id: session.id, directory: project.worktree }, event)
                              }
                              onDragEnd={stopDrag}
                              onDragOver={allowDrop}
                              onDrop={(event: DragEvent) => dropSession(project, session.id, index(), event)}
                            >
                              <button
                                type="button"
                                class="novelx-session-open"
                                disabled={pending().has(`session:${project.worktree}:${session.id}`)}
                                onClick={() => openSession(session.id)}
                              >
                                <Icon name="prompt" size="small" />
                                <span>{sessionTitle(session.title) || language.t("command.session.new")}</span>
                                <Show when={running()}>
                                  <span class="novelx-running-dot" aria-label={language.t("novelx.sidebar.running")} />
                                </Show>
                              </button>
                              <button
                                type="button"
                                class="novelx-symbol-button"
                                aria-label={
                                  pinned(shortcut)
                                    ? language.t("novelx.sidebar.unpin")
                                    : language.t("novelx.sidebar.pin")
                                }
                                aria-pressed={pinned(shortcut)}
                                onClick={() => layout.novelx.toggleShortcut(shortcut)}
                              >
                                <Icon name="link" size="small" />
                              </button>
                            </ContextMenu.Trigger>
                            <ContextMenu.Portal>
                              <ContextMenu.Content>
                                <ContextMenu.Item onSelect={() => void deleteSession(project, session.id)}>
                                  <ContextMenu.ItemLabel>删除会话</ContextMenu.ItemLabel>
                                </ContextMenu.Item>
                              </ContextMenu.Content>
                            </ContextMenu.Portal>
                          </ContextMenu>
                        )
                      }}
                    </For>
                  </Show>
                </nav>
              </div>
            </>
          )
        }}
      </Show>
    </aside>
  )

  return (
    <div
      class="novelx-project-navigation hidden md:flex"
      classList={{ "is-expanded": view.leftExpanded() && !resourceOpen(), "has-resource": resourceOpen() }}
    >
      {projectRail()}
      <Show when={view.leftExpanded()}>{projectPanel()}</Show>
    </div>
  )
}
