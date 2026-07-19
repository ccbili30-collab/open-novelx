import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useSDK } from "@/context/sdk"

export function NovelXConversationToggle() {
  const language = useLanguage()
  const layout = useLayout()
  const sdk = useSDK()
  const view = layout.novelx.project(() => sdk().directory)

  return (
    <Show when={view.activeResource() && !view.rightCollapsed()}>
      <button
        type="button"
        class="novelx-conversation-toggle"
        classList={{ "is-collapsed": view.conversationCollapsed() }}
        aria-label={
          view.conversationCollapsed()
            ? language.t("novelx.conversation.expand")
            : language.t("novelx.conversation.collapse")
        }
        aria-expanded={!view.conversationCollapsed()}
        onClick={view.toggleConversation}
      >
        <Icon name={view.conversationCollapsed() ? "layout-left" : "layout-left-full"} size="small" />
      </button>
    </Show>
  )
}
