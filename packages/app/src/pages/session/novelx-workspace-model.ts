export type ProjectSessionSummary = {
  parentID?: string
  time: {
    created: number
    updated: number
    archived?: number
  }
}

type ResourceWithProjectPath = "files" | "world" | "characters" | "story" | "graph" | "package"

export function novelXResourceOwnsDocument(resource: ResourceWithProjectPath, path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//u, "").toLowerCase()
  if (!normalized) return false
  if (resource === "files") return true
  if (resource === "world") return normalized.startsWith("world/")
  if (resource === "characters") {
    return normalized.startsWith("characters/") || normalized.startsWith("world/characters/")
  }
  if (resource === "story") return normalized.startsWith("stories/") || normalized.startsWith("story/")
  return false
}

export function resolveNovelXResourcePath(resource: ResourceWithProjectPath, existingDirectories: readonly string[]) {
  const normalized = new Set(existingDirectories.map((path) => path.replaceAll("\\", "/").toLowerCase()))
  const firstExisting = (...candidates: string[]) =>
    candidates.find((candidate) => normalized.has(candidate.toLowerCase()))

  if (resource === "files") return ""
  if (resource === "world") return firstExisting("World")
  if (resource === "characters") return firstExisting("Characters", "World/characters")
  if (resource === "story") return firstExisting("Stories", "Story")
  return undefined
}

export function projectMonogram(name: string) {
  const first = Array.from(name.trim())[0]
  return first ? first.toLocaleUpperCase() : "?"
}

export function selectProjectSessions<T extends ProjectSessionSummary>(sessions: readonly T[], limit = 30) {
  return sessions
    .filter((session) => !session.parentID && !session.time.archived)
    .toSorted((a, b) => (b.time.updated || b.time.created) - (a.time.updated || a.time.created))
    .slice(0, Math.max(0, limit))
}

type StudyProjectSessionSummary = {
  parentID?: string
  agent?: string
  directory?: string
  time?: {
    created?: number
    updated?: number
    archived?: number
  }
}

const projectDirectoryKey = (directory: string) =>
  directory.replaceAll("\\", "/").replace(/\/+$/u, "").toLocaleLowerCase("en-US")

export function selectNovelXStudyProjectDirectories(
  sessions: readonly StudyProjectSessionSummary[],
  existingDirectories: readonly string[],
) {
  const known = new Set(existingDirectories.map(projectDirectoryKey))
  const result: string[] = []
  const candidates = sessions
    .filter((session) => session.agent === "study" && !session.parentID && !session.time?.archived)
    .toSorted((a, b) => (b.time?.updated ?? b.time?.created ?? 0) - (a.time?.updated ?? a.time?.created ?? 0))

  for (const session of candidates) {
    const directory = session.directory?.trim()
    if (!directory) continue
    const key = projectDirectoryKey(directory)
    if (!key || known.has(key)) continue
    known.add(key)
    result.push(directory)
  }
  return result
}

type DraftMessage = { id: string; role: string }
type DraftPart = { type: string; text?: string; synthetic?: boolean; ignored?: boolean }

type NovelXSessionSummary = { parentID?: string; agent?: string }
type NovelXMessageSummary = { role: string; agent?: string }

export function isNovelXInternalSession(
  session: NovelXSessionSummary | undefined,
): session is NovelXSessionSummary & { parentID: string; agent: string } {
  return !!session?.parentID && !!session.agent?.startsWith("novelx-")
}

export function isNovelXGrowthSession(
  session: NovelXSessionSummary | undefined,
  messages: readonly NovelXMessageSummary[],
) {
  return (
    session?.agent === "growth" || messages.some((message) => message.role === "user" && message.agent === "growth")
  )
}

export function sanitizeNovelXAssistantText(input: string) {
  const transportBoundary = /^\s*(?:(?:to|recipient)=|[({]?\s*["']?subagent_type["']?\s*:)/u
  const internal = /\bnovelx_[a-z0-9_]+\b|\bWORLD_VISUALS\b|\bContext Epoch\b|\bSHA-256\b/u
  const reportHeading = /^(?:#{1,6}\s*)?(?:Active|Blocked|Next Move|Relevant Files)\s*:?\s*$/iu
  const lines = input.split(/\r?\n/u)
  const privateStart = lines.findIndex((line) => transportBoundary.test(line) || reportHeading.test(line.trim()))
  return lines
    .slice(0, privateStart < 0 ? undefined : privateStart)
    .filter((line) => !internal.test(line))
    .join("\n")
    .trim()
}

function isLegacyNovelXGrowthPrompt(text: string) {
  const value = text.trimStart()
  return (
    value.startsWith("为当前 NovelX 项目启动 Growth（生长）") &&
    value.includes("用户补充要求：") &&
    value.includes("蓝图注册完成不是终点")
  )
}

export function projectNovelXTimelineParts<T extends DraftPart>(role: string, parts: readonly T[]) {
  if (role === "assistant") {
    return parts.flatMap((part) => {
      if (part.type !== "text" || part.synthetic || part.ignored) return []
      const text = sanitizeNovelXAssistantText(part.text ?? "")
      return text ? [{ ...part, text }] : []
    })
  }
  if (role === "user") {
    return parts.filter(
      (part) =>
        (part.type === "text" && !part.synthetic && !isLegacyNovelXGrowthPrompt(part.text ?? "")) ||
        part.type === "file",
    )
  }
  return []
}

export function projectNovelXDraftText(
  messages: readonly DraftMessage[],
  parts: Readonly<Record<string, readonly DraftPart[] | undefined>>,
) {
  const latest = messages.findLast((message) => message.role === "assistant")
  if (!latest) return ""
  const text = (parts[latest.id] ?? [])
    .filter(
      (part): part is DraftPart & { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string" && !part.synthetic && !part.ignored,
    )
    .map((part) => part.text)
    .join("\n")
  return sanitizeNovelXAssistantText(text)
}

export function novelXRootSessionID(
  sessions: readonly { id: string; parentID?: string }[],
  sessionID: string,
): string | undefined {
  const byID = new Map(sessions.map((session) => [session.id, session]))
  let current = byID.get(sessionID)
  if (!current) return undefined
  const seen = new Set<string>()
  while (current.parentID) {
    if (seen.has(current.id)) return undefined
    seen.add(current.id)
    const parent = byID.get(current.parentID)
    if (!parent) return current.parentID
    current = parent
  }
  return current.id
}

export type WorldTreeState = {
  loaded?: boolean
  error?: string
}

export function worldTreeStatus(input: {
  root: WorldTreeState | undefined
  world: WorldTreeState | undefined
  hasWorldDirectory: boolean
  childCount: number
}) {
  if (input.root?.error || input.world?.error) return "error" as const
  if (!input.root?.loaded) return "loading" as const
  if (!input.hasWorldDirectory) return "empty" as const
  if (input.world?.loaded && input.childCount === 0) return "empty" as const
  return "tree" as const
}
