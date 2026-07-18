import type { JSX } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  const language = useLanguage()

  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-v2-background-bg-deep">
      <div class="absolute inset-x-0 top-[22%] flex justify-center px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          <div class="novelx-new-session-masthead">
            <div class="novelx-welcome-symbol" aria-hidden="true">
              <Icon name="models" size="large" />
            </div>
            <div class="min-w-0">
              <div class="novelx-new-session-brand">NovelX</div>
              <div class="novelx-new-session-tagline">{language.t("novelx.workspace.tagline")}</div>
            </div>
          </div>
          <div class="mt-8">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
