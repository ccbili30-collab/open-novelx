import { Icon } from "@opencode-ai/ui/icon"
import { baseKeymap } from "prosemirror-commands"
import { history, redo, undo } from "prosemirror-history"
import { keymap } from "prosemirror-keymap"
import { defaultMarkdownParser, defaultMarkdownSerializer } from "prosemirror-markdown"
import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { DocumentEditState } from "@/context/document-edit-state"
import {
  joinFrontMatter,
  markdownVisualSupport,
  preserveMarkdownLineEndings,
  preserveSourceLineEndings,
  splitFrontMatter,
} from "@/context/document-edit-state"
import type { UnsupportedMarkdownReason } from "@/context/document-edit-state"
import { useLanguage } from "@/context/language"

function ProseMirrorDocument(props: {
  value: string
  disabled: boolean
  onInput: (value: string) => void
  onSave: () => void
}) {
  let root: HTMLDivElement | undefined
  let editor: EditorView | undefined
  let emitted = props.value

  const createState = (value: string) => {
    const body = splitFrontMatter(value).body
    return EditorState.create({
      doc: defaultMarkdownParser.parse(body),
      plugins: [
        history(),
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
          "Mod-s": () => {
            props.onSave()
            return true
          },
        }),
        keymap(baseKeymap),
      ],
    })
  }

  onMount(() => {
    if (!root) return
    editor = new EditorView(root, {
      state: createState(props.value),
      editable: () => !props.disabled,
      dispatchTransaction(transaction) {
        if (!editor) return
        const next = editor.state.apply(transaction)
        editor.updateState(next)
        if (!transaction.docChanged) return
        const split = splitFrontMatter(props.value)
        const serialized = defaultMarkdownSerializer.serialize(next.doc)
        emitted = joinFrontMatter(split.frontMatter, preserveMarkdownLineEndings(serialized, split.body))
        props.onInput(emitted)
      },
    })
  })

  createEffect(() => {
    const value = props.value
    if (!editor || value === emitted) return
    emitted = value
    editor.updateState(createState(value))
  })

  createEffect(() => {
    props.disabled
    editor?.setProps({ editable: () => !props.disabled })
  })

  onCleanup(() => editor?.destroy())
  return <div ref={root} class="novelx-prosemirror" />
}

const statusKey = (status: DocumentEditState["status"]) =>
  ({
    loading: "novelx.document.status.loading",
    clean: "novelx.document.status.saved",
    dirty: "novelx.document.status.dirty",
    saving: "novelx.document.status.saving",
    conflict: "novelx.document.status.conflict",
    error: "novelx.document.status.error",
  })[status] as
    | "novelx.document.status.loading"
    | "novelx.document.status.saved"
    | "novelx.document.status.dirty"
    | "novelx.document.status.saving"
    | "novelx.document.status.conflict"
    | "novelx.document.status.error"

const unsupportedKey: Record<UnsupportedMarkdownReason, `novelx.document.unsupported.${UnsupportedMarkdownReason}`> = {
  "raw-html": "novelx.document.unsupported.raw-html",
  table: "novelx.document.unsupported.table",
  "task-list": "novelx.document.unsupported.task-list",
  footnote: "novelx.document.unsupported.footnote",
  math: "novelx.document.unsupported.math",
  directive: "novelx.document.unsupported.directive",
}

export function NovelXDocumentEditor(props: {
  state: DocumentEditState
  locked: boolean
  lockedAgents: string[]
  onInput: (value: string) => void
  onSave: () => void
  onReload: () => void
}) {
  const language = useLanguage()
  const [sourceSelected, setSourceSelected] = createSignal(false)
  const [altSource, setAltSource] = createSignal(false)
  const [composing, setComposing] = createSignal(false)
  const markdown = createMemo(() => /\.md$/i.test(props.state.path))
  const support = createMemo(() => markdownVisualSupport(props.state.draft))
  const unsupportedReason = createMemo(() => {
    const result = support()
    return result.supported ? undefined : result.reason
  })
  const sourceOnly = createMemo(() => !markdown() || !support().supported)
  const showSource = createMemo(() => sourceOnly() || sourceSelected() || altSource())
  const disabled = createMemo(() => props.locked || props.state.status === "loading" || props.state.status === "saving")

  onMount(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== "Alt" || event.repeat || composing()) return
      setAltSource(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === "Alt") setAltSource(false)
    }
    const reset = () => setAltSource(false)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", reset)
    onCleanup(() => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", reset)
    })
  })

  const save = () => {
    if (disabled() || props.state.status !== "dirty") return
    props.onSave()
  }

  return (
    <section class="novelx-document-editor" aria-label={props.state.path}>
      <header class="novelx-document-toolbar">
        <div class="novelx-document-path" title={props.state.path}>
          <Icon name="edit" size="small" />
          <span>{props.state.path}</span>
        </div>
        <div class="novelx-document-actions">
          <Show when={markdown() && !sourceOnly()}>
            <div class="novelx-document-mode" role="group" aria-label={language.t("novelx.document.mode.label")}>
              <button
                type="button"
                classList={{ "is-active": !sourceSelected() }}
                aria-pressed={!sourceSelected()}
                onClick={() => setSourceSelected(false)}
              >
                {language.t("novelx.document.mode.visual")}
              </button>
              <button
                type="button"
                classList={{ "is-active": sourceSelected() }}
                aria-pressed={sourceSelected()}
                onClick={() => setSourceSelected(true)}
              >
                {language.t("novelx.document.mode.source")}
              </button>
            </div>
          </Show>
          <button
            type="button"
            class="novelx-document-reload"
            disabled={props.state.status === "loading" || props.state.status === "saving"}
            onClick={props.onReload}
          >
            {language.t(
              ["dirty", "conflict", "error"].includes(props.state.status)
                ? "novelx.document.discardReload"
                : "novelx.document.reload",
            )}
          </button>
          <button
            type="button"
            class="novelx-document-save"
            disabled={disabled() || props.state.status !== "dirty"}
            onClick={save}
          >
            {language.t("novelx.document.save")}
          </button>
        </div>
      </header>

      <div class="novelx-document-notices" aria-live="polite">
        <Show when={props.locked}>
          <div class="novelx-document-notice is-lock">
            <Icon name="shield" size="small" />
            <span>
              {language.t("novelx.document.locked", {
                agent: props.lockedAgents.length ? props.lockedAgents.join("、") : language.t("novelx.document.agent"),
              })}
            </span>
          </div>
        </Show>
        <Show when={props.state.externalChanged && props.state.status !== "loading"}>
          <div class="novelx-document-notice is-warning">{language.t("novelx.document.externalChanged")}</div>
        </Show>
        <Show when={sourceOnly() && markdown() && unsupportedReason()}>
          <div class="novelx-document-notice">
            {language.t("novelx.document.sourceOnly", {
              reason: language.t(unsupportedKey[unsupportedReason()!]),
            })}
          </div>
        </Show>
        <Show when={props.state.error}>
          <div class="novelx-document-notice is-error">{props.state.error}</div>
        </Show>
      </div>

      <div
        class="novelx-document-canvas"
        classList={{ "is-disabled": disabled() }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
      >
        <Switch>
          <Match when={props.state.status === "loading" && !props.state.draft}>
            <div class="novelx-document-loading">{language.t("common.loading")}</div>
          </Match>
          <Match when={showSource()}>
            <textarea
              class="novelx-document-source"
              value={props.state.draft}
              disabled={disabled()}
              spellcheck={false}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onInput={(event) =>
                props.onInput(preserveSourceLineEndings(event.currentTarget.value, props.state.baseline))
              }
              onKeyDown={(event) => {
                if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return
                event.preventDefault()
                save()
              }}
            />
          </Match>
          <Match when={!showSource()}>
            <ProseMirrorDocument
              value={props.state.draft}
              disabled={disabled()}
              onInput={props.onInput}
              onSave={save}
            />
          </Match>
        </Switch>
      </div>

      <footer class="novelx-document-status" data-status={props.state.status}>
        <span>{language.t(statusKey(props.state.status))}</span>
        <Show when={markdown() && !sourceOnly()}>
          <span>{language.t("novelx.document.altHint")}</span>
        </Show>
      </footer>
    </section>
  )
}
