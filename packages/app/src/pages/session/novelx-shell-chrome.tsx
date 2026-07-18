import { getFilename } from "@opencode-ai/core/util/path"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo } from "solid-js"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"

export function NovelXShellToolbar() {
  const command = useCommand()
  const language = useLanguage()
  const layout = useLayout()
  const sdk = useSDK()
  const sync = useSync()
  const projectName = createMemo(() => sync().data.projectMeta?.name || getFilename(sdk().directory))

  const focusConversation = () => command.trigger("input.focus")
  const openFiles = () => {
    layout.fileTree.setTab("all")
    layout.fileTree.open()
  }

  return (
    <header data-component="novelx-shell-toolbar" class="novelx-shell-toolbar">
      <div class="novelx-shell-project">
        <strong>novelx</strong>
        <span title={projectName()}>{projectName()}</span>
      </div>
      <nav class="novelx-shell-actions" aria-label={language.t("novelx.toolbar.label")}>
        <div class="novelx-mode-switch" role="group" aria-label={language.t("novelx.toolbar.modes")}>
          <button
            type="button"
            class="novelx-mode-button"
            disabled
            title={language.t("novelx.toolbar.playerUnavailable")}
          >
            <Icon name="glasses" size="small" />
            <span>{language.t("novelx.toolbar.player")}</span>
          </button>
          <button type="button" class="novelx-mode-button is-active" aria-current="page" onClick={focusConversation}>
            <Icon name="prompt" size="small" />
            <span>{language.t("novelx.toolbar.companion")}</span>
          </button>
          <button type="button" class="novelx-mode-button" onClick={openFiles}>
            <Icon name="code" size="small" />
            <span>{language.t("novelx.toolbar.ide")}</span>
          </button>
        </div>
        <button type="button" class="novelx-toolbar-button" onClick={() => command.trigger("project.open")}>
          <Icon name="download" size="small" />
          <span>{language.t("novelx.toolbar.import")}</span>
        </button>
        <button
          type="button"
          class="novelx-toolbar-icon-button"
          aria-label={language.t("novelx.toolbar.settings")}
          title={language.t("novelx.toolbar.settings")}
          onClick={() => command.trigger("settings.open")}
        >
          <Icon name="settings-gear" size="small" />
        </button>
      </nav>
    </header>
  )
}

export function NovelXStatusbar() {
  const language = useLanguage()
  const local = useLocal()
  const sdk = useSDK()
  const sync = useSync()
  const projectName = createMemo(() => sync().data.projectMeta?.name || getFilename(sdk().directory))

  return (
    <footer data-component="novelx-statusbar" class="novelx-statusbar">
      <span class="truncate">{language.t("novelx.status.project", { project: projectName() })}</span>
      <span class="truncate">
        {language.t("novelx.status.agent", { agent: local.agent.current()?.name ?? language.t("common.loading") })}
      </span>
    </footer>
  )
}
