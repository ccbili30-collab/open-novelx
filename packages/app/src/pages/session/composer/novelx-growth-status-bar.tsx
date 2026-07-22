import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { activeGrowth } from "./novelx-growth-status"

export function NovelXGrowthStatusBar(props: { sessionID?: string }) {
  const language = useLanguage()
  const sdk = useSDK()
  const sync = useSync()
  const [now, setNow] = createSignal(Date.now())
  const [stopping, setStopping] = createSignal(false)
  let timer: number | undefined

  onMount(() => {
    timer = window.setInterval(() => setNow(Date.now()), 1000)
  })
  onCleanup(() => {
    if (timer !== undefined) window.clearInterval(timer)
  })

  const growth = createMemo(() => {
    const target = sync()
    const statuses = target.data.session_status
    const sessions: Record<string, ReturnType<typeof target.session.get>> = {}
    const collectLineage = (sessionID: string | undefined) => {
      const seen = new Set<string>()
      let current = sessionID ? target.session.get(sessionID) : undefined
      while (current && !seen.has(current.id)) {
        seen.add(current.id)
        sessions[current.id] = current
        current = current.parentID ? target.session.get(current.parentID) : undefined
      }
    }
    collectLineage(props.sessionID)
    Object.keys(statuses).forEach(collectLineage)
    return activeGrowth({ currentID: props.sessionID, sessions, statuses })
  })
  const retrySeconds = createMemo(() => {
    const status = growth()?.status
    if (!status || status.type !== "retry") return 0
    return Math.max(0, Math.ceil((status.next - now()) / 1000))
  })
  const stop = async () => {
    const rootID = growth()?.rootID
    if (!rootID || stopping()) return
    setStopping(true)
    try {
      await sdk().client.session.abort({ sessionID: rootID })
    } finally {
      setStopping(false)
    }
  }

  return (
    <Show when={growth()} keyed>
      {(current) => (
        <div
          data-component="novelx-growth-status"
          class="mt-2 min-h-9 w-full flex items-center gap-2 rounded-md border border-border-weak-base bg-background-base px-3 py-2 pointer-events-auto"
          role="status"
          aria-live="polite"
        >
          <span class="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-icon-info-base opacity-40" />
            <span class="relative inline-flex h-2 w-2 rounded-full bg-icon-info-base" />
          </span>
          <span class="min-w-0 truncate text-13-medium text-text-strong">
            {language.t("novelx.growth.running", { title: current.title })}
          </span>
          <Show when={current.status.type === "retry"}>
            <span class="min-w-0 truncate text-12-regular text-text-weak">
              {language.t("novelx.growth.retry", {
                attempt: current.status.type === "retry" ? current.status.attempt : 1,
                seconds: retrySeconds(),
              })}
            </span>
          </Show>
          <button
            type="button"
            class="ml-auto shrink-0 rounded px-2 py-1 text-12-medium text-text-base transition-colors hover:bg-background-stronger hover:text-text-strong disabled:opacity-50"
            disabled={stopping()}
            onClick={stop}
          >
            {language.t("novelx.growth.stop")}
          </button>
        </div>
      )}
    </Show>
  )
}
