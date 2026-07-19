import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js"
import { useParams } from "@solidjs/router"
import { activeFileMutations } from "./active-file-mutations"
import {
  createDocumentEditState,
  documentConflicted,
  documentEdited,
  documentExternalChanged,
  documentHasUnsavedChanges,
  documentLoaded,
  documentSaveFailed,
  documentSaved,
  documentSaving,
  type DocumentEditState,
} from "./document-edit-state"
import { useFile } from "./file"
import { useSDK } from "./sdk"
import { useSync } from "./sync"

const errorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

const isConflictError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false
  if (error instanceof Response) return error.status === 409
  const value = error as Record<string, unknown>
  if (value._tag === "FileEditConflictError" || value.status === 409 || value.statusCode === 409) return true
  if (isConflictError(value.body)) return true
  return isConflictError(value.cause)
}

export function createNovelXDocumentController(input: { path: Accessor<string> }) {
  const sdk = useSDK()
  const sync = useSync()
  const file = useFile()
  const params = useParams<{ id?: string }>()
  const [state, setState] = createSignal<DocumentEditState>()
  let loadVersion = 0

  const sessionParts = createMemo(() => {
    const id = params.id
    if (!id) return []
    return Object.values(sync().data.part)
      .flatMap((parts) => parts ?? [])
      .filter((part) => part.sessionID === id)
  })

  const lockedParts = createMemo(() => {
    const path = file.normalize(input.path())
    if (!path) return []
    return sessionParts().filter((part) => activeFileMutations([part]).some((item) => file.normalize(item) === path))
  })

  const lockedAgents = createMemo(() => {
    const id = params.id
    if (!id) return []
    const messages = sync().data.message[id] ?? []
    const byID = new Map(messages.map((message) => [message.id, message]))
    return [
      ...new Set(
        lockedParts().flatMap((part) => {
          const message = byID.get(part.messageID)
          return message?.role === "assistant" && message.agent ? [message.agent] : []
        }),
      ),
    ]
  })

  const load = async (path: string) => {
    const normalized = file.normalize(path)
    if (!normalized) {
      setState(undefined)
      return
    }
    const version = ++loadVersion
    const previous = state()
    setState(
      previous?.path === normalized
        ? { ...previous, status: "loading", error: undefined }
        : createDocumentEditState(normalized),
    )
    try {
      const result = await sdk().client.file.editable({ path: normalized })
      if (version !== loadVersion || file.normalize(input.path()) !== normalized) return
      if (!result.data) {
        const current = state() ?? createDocumentEditState(normalized)
        setState(documentSaveFailed(current, errorMessage(result.error, "Unable to read this file")))
        return
      }
      setState(documentLoaded(createDocumentEditState(normalized), result.data))
    } catch (error) {
      if (version !== loadVersion || file.normalize(input.path()) !== normalized) return
      const current = state() ?? createDocumentEditState(normalized)
      setState(documentSaveFailed(current, errorMessage(error, "Unable to read this file")))
    }
  }

  createEffect(
    on(
      () => file.normalize(input.path()),
      (path) => {
        if (!path) {
          loadVersion += 1
          setState(undefined)
          return
        }
        void load(path)
      },
      { defer: false },
    ),
  )

  const stop = sdk().event.listen((event) => {
    if (event.details.type !== "file.watcher.updated") return
    const properties = event.details.properties as { file?: unknown } | undefined
    if (typeof properties?.file !== "string") return
    const current = state()
    if (!current || file.normalize(properties.file) !== file.normalize(current.path)) return
    if (current.status === "saving") return
    const changed = documentExternalChanged(current)
    setState(changed)
    if (changed.status === "loading") void load(changed.path)
  })
  onCleanup(stop)

  return {
    state,
    locked: createMemo(() => lockedParts().length > 0),
    lockedAgents,
    edit(content: string) {
      const current = state()
      if (!current || lockedParts().length > 0) return
      setState(documentEdited(current, content))
    },
    async save() {
      const current = state()
      if (!current || current.status !== "dirty" || lockedParts().length > 0) return
      setState(documentSaving(current))
      try {
        const result = await sdk().client.file.write({
          path: current.path,
          fileEditableWrite: {
            content: current.draft,
            expectedContent: current.baseline,
            expectedBom: current.bom,
          },
        })
        const latest = state()
        if (!latest || latest.path !== current.path) return
        if (result.response.status === 409) {
          setState(documentConflicted(latest))
          return
        }
        if (!result.data) {
          setState(documentSaveFailed(latest, errorMessage(result.error, "Unable to save this file")))
          return
        }
        setState(documentSaved(latest))
      } catch (error) {
        const latest = state()
        if (!latest || latest.path !== current.path) return
        if (isConflictError(error)) {
          setState(documentConflicted(latest))
          return
        }
        setState(documentSaveFailed(latest, errorMessage(error, "Unable to save this file")))
      }
    },
    reload() {
      const current = state()
      if (!current) return
      void load(current.path)
    },
    canLeave() {
      return !documentHasUnsavedChanges(state())
    },
  }
}
