import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"

export function NewSessionView(_props: { worktree: string }) {
  const language = useLanguage()

  return (
    <div data-component="novelx-new-session" class="novelx-empty-session-canvas">
      <div class="novelx-conversation-label">
        <Icon name="branch" size="small" />
        <span>{language.t("command.session.new")}</span>
      </div>
    </div>
  )
}
