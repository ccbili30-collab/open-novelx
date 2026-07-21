export const NOVELX_RESOURCES = ["files", "world", "story", "graph", "characters", "package"] as const

export type NovelXResource = (typeof NOVELX_RESOURCES)[number]

export type NovelXProjectLayout = {
  leftExpanded: boolean
  homeLeftExpanded: boolean
  rightCollapsed: boolean
  activeResource?: NovelXResource
  conversationCollapsed: boolean
  inspectorOpen: boolean
  activeFile: string
}

export type NovelXShortcut =
  | { type: "project"; directory: string }
  | { type: "session"; directory: string; sessionID: string }

export const DEFAULT_NOVELX_PROJECT_LAYOUT: NovelXProjectLayout = {
  leftExpanded: true,
  homeLeftExpanded: true,
  rightCollapsed: false,
  activeResource: undefined,
  conversationCollapsed: false,
  inspectorOpen: true,
  activeFile: "",
}

export function normalizeNovelXProjectLayout(value: Partial<NovelXProjectLayout> | undefined): NovelXProjectLayout {
  return {
    leftExpanded: value?.leftExpanded ?? DEFAULT_NOVELX_PROJECT_LAYOUT.leftExpanded,
    homeLeftExpanded: value?.homeLeftExpanded ?? value?.leftExpanded ?? DEFAULT_NOVELX_PROJECT_LAYOUT.homeLeftExpanded,
    rightCollapsed: value?.rightCollapsed ?? DEFAULT_NOVELX_PROJECT_LAYOUT.rightCollapsed,
    activeResource: NOVELX_RESOURCES.includes(value?.activeResource as NovelXResource)
      ? value?.activeResource
      : undefined,
    conversationCollapsed: value?.conversationCollapsed ?? DEFAULT_NOVELX_PROJECT_LAYOUT.conversationCollapsed,
    inspectorOpen: value?.inspectorOpen ?? DEFAULT_NOVELX_PROJECT_LAYOUT.inspectorOpen,
    activeFile: typeof value?.activeFile === "string" ? value.activeFile : DEFAULT_NOVELX_PROJECT_LAYOUT.activeFile,
  }
}

export function activateNovelXResource(layout: NovelXProjectLayout, resource: NovelXResource): NovelXProjectLayout {
  if (layout.activeResource === resource) {
    return {
      ...layout,
      leftExpanded: layout.homeLeftExpanded,
      activeResource: undefined,
      rightCollapsed: false,
      conversationCollapsed: false,
    }
  }
  if (layout.activeResource) return { ...layout, activeResource: resource, rightCollapsed: false }
  return {
    ...layout,
    homeLeftExpanded: layout.leftExpanded,
    leftExpanded: false,
    activeResource: resource,
    rightCollapsed: false,
  }
}

export function toggleNovelXRight(layout: NovelXProjectLayout): NovelXProjectLayout {
  return { ...layout, rightCollapsed: !layout.rightCollapsed }
}

export function shortcutKey(shortcut: NovelXShortcut) {
  if (shortcut.type === "project") return `project:${shortcut.directory}`
  return `session:${shortcut.directory}:${shortcut.sessionID}`
}

export function toggleNovelXShortcut(shortcuts: readonly NovelXShortcut[], shortcut: NovelXShortcut) {
  const key = shortcutKey(shortcut)
  if (shortcuts.some((item) => shortcutKey(item) === key)) {
    return shortcuts.filter((item) => shortcutKey(item) !== key)
  }
  return [...shortcuts, shortcut]
}

export function reorderNovelXItems(ids: readonly string[], id: string, toIndex: number) {
  const current = ids.indexOf(id)
  if (current === -1) return [...ids]
  const next = [...ids]
  const [item] = next.splice(current, 1)
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item)
  return next
}

export function mergeNovelXOrder(ids: readonly string[], preferred: readonly string[]) {
  const available = new Set(ids)
  const ordered = preferred.filter((id) => available.delete(id))
  return [...ordered, ...ids.filter((id) => available.has(id))]
}
