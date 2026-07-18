import { getFilename } from "@opencode-ai/core/util/path"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Show, createEffect, createMemo } from "solid-js"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { useTabs } from "@/context/tabs"
import { useSessionKey } from "@/pages/session/session-layout"
import { sessionTitle } from "@/utils/session-title"
import { selectProjectSessions } from "./novelx-workspace-model"

export function NovelXWorkspaceSidebar() {
  const command = useCommand()
  const language = useLanguage()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const sync = useSync()
  const tabs = useTabs()
  const route = useSessionKey()

  const server = createMemo(() => ServerConnection.key(serverSDK().server))
  const projectName = createMemo(() => sync().data.projectMeta?.name || getFilename(sdk().directory))
  const sessions = createMemo(() => selectProjectSessions(sync().data.session))

  createEffect(() => {
    void serverSync().project.loadSessions(sdk().directory, { limit: 30 })
  })

  const newTask = () => {
    void tabs.newDraft({ server: server(), directory: sdk().directory })
  }

  const openSession = (sessionId: string) => {
    const tab = tabs.addSessionTab({ server: server(), sessionId })
    tabs.select(tab)
  }

  return (
    <aside aria-label={language.t("novelx.sidebar.label")} class="novelx-project-rail hidden md:flex">
      <div class="flex size-full min-w-0 flex-col">
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

        <div class="novelx-project-row">
          <Icon name="folder" size="small" class="shrink-0" />
          <span class="min-w-0 flex-1 truncate" title={projectName()}>
            {projectName()}
          </span>
          <button
            type="button"
            class="novelx-symbol-button"
            aria-label={language.t("novelx.sidebar.newTask")}
            title={language.t("novelx.sidebar.newTask")}
            onClick={newTask}
          >
            <Icon name="plus-small" size="small" />
          </button>
          <button
            type="button"
            class="novelx-symbol-button"
            aria-label={language.t("novelx.sidebar.projectActions")}
            title={language.t("novelx.sidebar.openProject")}
            onClick={() => command.trigger("project.open")}
          >
            <Icon name="dot-grid" size="small" />
          </button>
        </div>

        <nav class="novelx-session-tree" aria-label={language.t("novelx.sidebar.sessions")}>
          <Show when={!route.params.id}>
            <button type="button" aria-current="page" class="novelx-session-row" onClick={newTask}>
              <Icon name="prompt" size="small" class="shrink-0" />
              <span class="min-w-0 flex-1 truncate">{language.t("command.session.new")}</span>
            </button>
          </Show>

          <Show
            when={sessions().length > 0}
            fallback={<div class="novelx-session-empty">{language.t("novelx.sidebar.noSessions")}</div>}
          >
            <For each={sessions()}>
              {(session) => {
                const selected = () => route.params.id === session.id
                const running = () => sync().data.session_working(session.id)
                return (
                  <button
                    type="button"
                    aria-current={selected() ? "page" : undefined}
                    class="novelx-session-row"
                    onClick={() => openSession(session.id)}
                  >
                    <Icon name="prompt" size="small" class="shrink-0" />
                    <span class="min-w-0 flex-1 truncate">
                      {sessionTitle(session.title) || language.t("command.session.new")}
                    </span>
                    <Show when={running()}>
                      <span class="novelx-running-dot" aria-label={language.t("novelx.sidebar.running")} />
                    </Show>
                  </button>
                )
              }}
            </For>
          </Show>
        </nav>
      </div>
    </aside>
  )
}
