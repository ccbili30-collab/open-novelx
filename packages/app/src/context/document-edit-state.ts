export type DocumentEditStatus = "loading" | "clean" | "dirty" | "saving" | "conflict" | "error"

export type DocumentEditState = {
  path: string
  baseline: string
  draft: string
  bom: boolean
  status: DocumentEditStatus
  error?: string
  externalChanged: boolean
}

export function createDocumentEditState(path: string): DocumentEditState {
  return {
    path,
    baseline: "",
    draft: "",
    bom: false,
    status: "loading",
    externalChanged: false,
  }
}

export function documentLoaded(state: DocumentEditState, file: { content: string; bom: boolean }): DocumentEditState {
  return {
    ...state,
    baseline: file.content,
    draft: file.content,
    bom: file.bom,
    status: "clean",
    error: undefined,
    externalChanged: false,
  }
}

export function documentEdited(state: DocumentEditState, draft: string): DocumentEditState {
  return {
    ...state,
    draft,
    status: draft === state.baseline ? "clean" : "dirty",
    error: undefined,
  }
}

export function documentSaving(state: DocumentEditState): DocumentEditState {
  return { ...state, status: "saving", error: undefined }
}

export function documentSaved(state: DocumentEditState): DocumentEditState {
  return {
    ...state,
    baseline: state.draft,
    status: "clean",
    error: undefined,
    externalChanged: false,
  }
}

export function documentSaveFailed(state: DocumentEditState, error: string): DocumentEditState {
  return { ...state, status: "error", error }
}

export function documentConflicted(state: DocumentEditState): DocumentEditState {
  return { ...state, status: "conflict", error: undefined, externalChanged: true }
}

export function documentExternalChanged(state: DocumentEditState): DocumentEditState {
  if (state.status === "clean") return { ...state, status: "loading", externalChanged: true }
  if (state.status === "saving") return documentConflicted(state)
  return { ...state, externalChanged: true }
}

export function documentHasUnsavedChanges(state: DocumentEditState | undefined) {
  if (!state) return false
  return state.status === "saving" || state.draft !== state.baseline
}

export function splitFrontMatter(text: string) {
  const first = /^(---)(\r?\n)/.exec(text)
  if (!first) return { frontMatter: "", body: text }

  const line = /^(---|\.\.\.)(\r?\n|$)/gm
  line.lastIndex = first[0].length
  const closing = line.exec(text)
  if (!closing) return { frontMatter: "", body: text }

  const end = closing.index + closing[0].length
  return { frontMatter: text.slice(0, end), body: text.slice(end) }
}

export function joinFrontMatter(frontMatter: string, body: string) {
  return frontMatter + body
}

export function preserveMarkdownLineEndings(serialized: string, template: string) {
  const newline = template.includes("\r\n") ? "\r\n" : "\n"
  const body = newline === "\r\n" ? serialized.replaceAll("\n", "\r\n") : serialized
  const trailing = template.match(/(?:\r?\n)+$/)?.[0] ?? ""
  return body + trailing
}

export function preserveSourceLineEndings(input: string, template: string) {
  const normalized = input.replaceAll("\r\n", "\n")
  return template.includes("\r\n") ? normalized.replaceAll("\n", "\r\n") : normalized
}

export type UnsupportedMarkdownReason = "raw-html" | "table" | "task-list" | "footnote" | "math" | "directive"

const withoutFencedCode = (text: string) => text.replace(/^\s*(`{3,}|~{3,}).*$(?:\r?\n|$)[\s\S]*?^\s*\1\s*$/gm, "")

export function markdownVisualSupport(
  text: string,
): { supported: true } | { supported: false; reason: UnsupportedMarkdownReason } {
  const body = withoutFencedCode(splitFrontMatter(text).body)
  if (/^\s*<\/?[A-Za-z][^>]*>/m.test(body)) return { supported: false, reason: "raw-html" }
  if (/^\s*\|?.+\|.+\r?\n\s*\|?\s*:?-{3,}:?\s*\|/m.test(body)) return { supported: false, reason: "table" }
  if (/^\s*[-+*]\s+\[[ xX]\]\s+/m.test(body)) return { supported: false, reason: "task-list" }
  if (/\[\^[^\]]+\]/.test(body) || /^\s*\[\^[^\]]+\]:/m.test(body)) return { supported: false, reason: "footnote" }
  if (/^\s*\$\$\s*$/m.test(body) || /\\\(|\\\[/.test(body)) return { supported: false, reason: "math" }
  if (/^\s*:::[A-Za-z-]*/m.test(body)) return { supported: false, reason: "directive" }
  return { supported: true }
}
