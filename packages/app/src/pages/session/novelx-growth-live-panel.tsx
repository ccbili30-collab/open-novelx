import { For, Show, createEffect, createMemo, createSignal, type Accessor } from "solid-js"
import type { NovelXLiveGrowthArtifact, NovelXLiveGrowthProjection } from "./novelx-growth-live-projection"

export type NovelXGrowthLiveLabelKey =
  | "heading"
  | "planned"
  | "registering"
  | "writing"
  | "completed"
  | "failed"
  | "registered"
  | "leased"
  | "drafting"
  | "reviewing"
  | "committed"
  | "readonly"
  | "waiting"
  | "resumeFollow"
  | "latest"

export function NovelXGrowthLivePanel(props: {
  projection: Accessor<NovelXLiveGrowthProjection>
  selectedArtifactKey: Accessor<string | undefined>
  followMode: Accessor<"auto" | "manual">
  label: (key: NovelXGrowthLiveLabelKey) => string
  onSelect: (key: string) => void
  onOpen: (artifact: NovelXLiveGrowthArtifact) => void
  onResumeFollow: () => void
}) {
  const [awayFromLatest, setAwayFromLatest] = createSignal(false)
  let preview: HTMLDivElement | undefined
  const selected = createMemo(() => {
    const projection = props.projection()
    const key = props.selectedArtifactKey() ?? projection.primaryArtifactKey
    return projection.artifacts.find((artifact) => artifact.key === key)
  })

  const scrollToLatest = () => {
    if (!preview) return
    preview.scrollTop = preview.scrollHeight
    setAwayFromLatest(false)
  }

  createEffect(() => {
    selected()?.text
    if (awayFromLatest()) return
    globalThis.requestAnimationFrame?.(scrollToLatest)
  })

  const select = (artifact: NovelXLiveGrowthArtifact) => {
    props.onSelect(artifact.key)
    props.onOpen(artifact)
  }

  return (
    <section class="novelx-live-growth" aria-label={props.label("heading")}>
      <header class="novelx-live-growth-heading">
        <div>
          <strong>{props.label("heading")}</strong>
          <Show when={props.projection().stage}>
            {(stage) => (
              <span>
                {stage().label} · {props.label(stage().state)}
              </span>
            )}
          </Show>
        </div>
        <Show
          when={
            props.followMode() === "manual" &&
            props.projection().primaryArtifactKey &&
            props.selectedArtifactKey() !== props.projection().primaryArtifactKey
          }
        >
          <button type="button" onClick={props.onResumeFollow}>
            {props.label("resumeFollow")}
          </button>
        </Show>
      </header>

      <div class="novelx-live-growth-rows">
        <For each={props.projection().artifacts}>
          {(artifact) => (
            <button
              type="button"
              class="novelx-live-growth-row"
              classList={{
                "is-selected": selected()?.key === artifact.key,
                "is-failed": artifact.state === "failed",
                "is-committed": artifact.state === "committed",
              }}
              data-artifact-key={artifact.key}
              data-locked={artifact.locked ? "true" : "false"}
              aria-pressed={selected()?.key === artifact.key}
              title={fileName(artifact.targetPath)}
              onClick={() => select(artifact)}
            >
              <span class="novelx-live-growth-lock" aria-hidden="true" data-locked={artifact.locked} />
              <span class="novelx-live-growth-file">{fileName(artifact.targetPath)}</span>
              <small>{props.label(artifact.state)}</small>
            </button>
          )}
        </For>
      </div>

      <Show when={selected() && selected()!.locked}>
        <div class="novelx-live-growth-preview-shell">
          <div class="novelx-live-growth-preview-heading">
            <span>{selected()!.title}</span>
            <small>{props.label("readonly")}</small>
          </div>
          <div
            ref={preview}
            class="novelx-live-growth-preview"
            onScroll={() => {
              if (!preview) return
              setAwayFromLatest(preview.scrollHeight - preview.scrollTop - preview.clientHeight > 24)
            }}
          >
            <Show when={selected()!.text} fallback={<p>{props.label("waiting")}</p>}>
              <pre>{selected()!.text}</pre>
            </Show>
          </div>
          <Show when={awayFromLatest()}>
            <button type="button" class="novelx-live-growth-latest" onClick={scrollToLatest}>
              {props.label("latest")}
            </button>
          </Show>
        </div>
      </Show>
    </section>
  )
}

function fileName(path: string) {
  return path.replaceAll("\\", "/").split("/").at(-1) ?? path
}
