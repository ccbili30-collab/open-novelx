import { getFilename } from "@opencode-ai/core/util/path"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { For, Show, createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
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
  const language = useLanguage()
  const local = useLocal()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const sync = useSync()
  const tabs = useTabs()
  const route = useSessionKey()
  const [state, setState] = createStore({ expanded: true })

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
    <aside
      aria-label={language.t("novelx.sidebar.label")}
      class="novelx-project-rail hidden md:flex shrink-0 min-h-0 border-r border-border-weaker-base transition-[width] duration-200 motion-reduce:transition-none"
      classList={{ "w-64": state.expanded, "w-14": !state.expanded }}
    >
      <Show
        when={state.expanded}
        fallback={
          <div class="flex size-full flex-col items-center py-2">
            <div class="novelx-collapsed-mark" aria-hidden="true">
              <Icon name="models" size="small" />
            </div>
            <IconButton
              icon="layout-left-partial"
              variant="ghost"
              size="large"
              aria-label={language.t("novelx.sidebar.expand")}
              onClick={() => setState("expanded", true)}
            />
          </div>
        }
      >
        <div class="flex size-full min-w-0 flex-col">
          <div class="novelx-sidebar-brand flex h-14 shrink-0 items-center gap-2 px-3">
            <div class="novelx-brand-symbol" aria-hidden="true">
              <Icon name="models" size="small" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="novelx-brand-name truncate text-text-strong">NovelX</div>
              <div class="truncate text-10-regular text-text-weaker" title={projectName()}>
                {projectName()}
              </div>
            </div>
            <IconButton
              icon="chevron-left"
              variant="ghost"
              size="normal"
              aria-label={language.t("novelx.sidebar.collapse")}
              onClick={() => setState("expanded", false)}
            />
          </div>

          <div class="px-2 pb-4">
            <ButtonV2 class="novelx-new-task w-full justify-center" variant="contrast" icon="plus" onClick={newTask}>
              {language.t("novelx.sidebar.newTask")}
            </ButtonV2>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            <section aria-labelledby="novelx-agents-heading" class="mb-4">
              <h2 id="novelx-agents-heading" class="novelx-section-heading px-2 pb-1 text-11-medium text-text-weaker">
                {language.t("novelx.sidebar.agents")}
              </h2>
              <div class="flex flex-col gap-0.5">
                <For each={local.agent.list()}>
                  {(agent) => {
                    const selected = () => local.agent.current()?.name === agent.name
                    return (
                      <button
                        type="button"
                        aria-pressed={selected()}
                        class="novelx-agent-row flex h-9 min-w-0 items-center gap-2 rounded-lg px-2 text-left text-12-medium transition-colors hover:bg-surface-raised-base-hover"
                        classList={{
                          "bg-surface-base-active text-text-strong": selected(),
                          "text-text-weak": !selected(),
                        }}
                        onClick={() => local.agent.set(agent.name)}
                      >
                        <span class="novelx-agent-symbol" aria-hidden="true">
                          <Icon name="brain" size="small" />
                        </span>
                        <span class="min-w-0 flex-1 truncate">{agent.name}</span>
                        <Show when={selected()}>
                          <span class="novelx-selected-mark" aria-hidden="true" />
                        </Show>
                      </button>
                    )
                  }}
                </For>
              </div>
            </section>

            <section aria-labelledby="novelx-sessions-heading">
              <div class="flex items-center gap-2 px-2 pb-1">
                <h2
                  id="novelx-sessions-heading"
                  class="novelx-section-heading min-w-0 flex-1 truncate text-11-medium text-text-weaker"
                >
                  {language.t("novelx.sidebar.sessions")}
                </h2>
                <span class="max-w-20 truncate text-11-regular text-text-weaker" title={projectName()}>
                  {projectName()}
                </span>
              </div>
              <Show
                when={sessions().length > 0}
                fallback={
                  <div class="px-2 py-2 text-12-regular text-text-weaker">
                    {language.t("novelx.sidebar.noSessions")}
                  </div>
                }
              >
                <div class="flex flex-col gap-0.5">
                  <For each={sessions()}>
                    {(session) => {
                      const selected = () => route.params.id === session.id
                      const running = () => sync().data.session_working(session.id)
                      return (
                        <button
                          type="button"
                          aria-current={selected() ? "page" : undefined}
                          class="novelx-session-row flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-raised-base-hover"
                          classList={{
                            "bg-surface-base-active text-text-strong": selected(),
                            "text-text-weak": !selected(),
                          }}
                          onClick={() => openSession(session.id)}
                        >
                          <Icon name="speech-bubble" size="small" class="shrink-0 text-icon-weak" />
                          <span class="min-w-0 flex-1 truncate text-12-medium">
                            {sessionTitle(session.title) || language.t("command.session.new")}
                          </span>
                          <Show when={running()}>
                            <span class="shrink-0 text-10-medium text-text-weak">
                              {language.t("novelx.sidebar.running")}
                            </span>
                          </Show>
                        </button>
                      )
                    }}
                  </For>
                </div>
              </Show>
            </section>
          </div>
        </div>
      </Show>
    </aside>
  )
}
