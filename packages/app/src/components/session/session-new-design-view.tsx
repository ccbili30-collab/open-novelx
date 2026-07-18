import type { JSX } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useCommand } from "@/context/command"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  const language = useLanguage()
  const command = useCommand()

  return (
    <div data-component="session-new-design" class="novelx-new-session-design">
      <div class="novelx-conversation-label">
        <Icon name="branch" size="small" />
        <span>{language.t("command.session.new")}</span>
      </div>
      <div class="novelx-new-session-spacer" />
      <div class="novelx-new-session-composer">
        <div class="novelx-composer-modebar" role="group" aria-label={language.t("novelx.composer.modes")}>
          <button type="button" aria-pressed="true" onClick={() => command.trigger("input.focus")}>
            {language.t("novelx.composer.assist")}
          </button>
          <button type="button" disabled title={language.t("novelx.composer.freeUnavailable")}>
            {language.t("novelx.composer.free")}
          </button>
        </div>
        {props.children}
      </div>
    </div>
  )
}
