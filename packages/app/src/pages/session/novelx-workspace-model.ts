export type ProjectSessionSummary = {
  parentID?: string
  time: {
    created: number
    updated: number
    archived?: number
  }
}

export function selectProjectSessions<T extends ProjectSessionSummary>(sessions: readonly T[], limit = 30) {
  return sessions
    .filter((session) => !session.parentID && !session.time.archived)
    .toSorted((a, b) => (b.time.updated || b.time.created) - (a.time.updated || a.time.created))
    .slice(0, Math.max(0, limit))
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
