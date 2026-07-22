export type GrowthSession = {
  id: string
  parentID?: string
  title: string
}

export type GrowthSessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }

export type ActiveGrowth = {
  rootID: string
  sessionID: string
  title: string
  status: Exclude<GrowthSessionStatus, { type: "idle" }>
}

const NOVELX_GROWTH_CHILD = /\(@novelx-(?:stage|world|visual|character|story|publication)[\w-]* subagent\)$/i

function rootOf(id: string, sessions: Record<string, GrowthSession | undefined>) {
  let current = sessions[id]
  const seen = new Set<string>()
  while (current?.parentID && !seen.has(current.parentID)) {
    seen.add(current.id)
    const parent = sessions[current.parentID]
    if (!parent) break
    current = parent
  }
  return current
}

function depthFromRoot(session: GrowthSession, rootID: string, sessions: Record<string, GrowthSession | undefined>) {
  let depth = 0
  let current: GrowthSession | undefined = session
  const seen = new Set<string>()
  while (current && current.id !== rootID && current.parentID && !seen.has(current.id)) {
    seen.add(current.id)
    depth += 1
    current = sessions[current.parentID]
  }
  return current?.id === rootID ? depth : -1
}

export function growthTitle(title: string) {
  const clean = title.replace(/\s*\(@novelx-[\w-]+ subagent\)\s*$/i, "").replace(/^阶段[：:]\s*/, "").trim()
  return clean || "当前任务"
}

export function activeGrowth(input: {
  currentID?: string
  sessions: Record<string, GrowthSession | undefined>
  statuses: Record<string, GrowthSessionStatus | undefined>
}): ActiveGrowth | undefined {
  if (!input.currentID) return undefined
  const root = rootOf(input.currentID, input.sessions)
  if (!root) return undefined

  const descendants = Object.values(input.sessions).flatMap((session) => {
    if (!session) return []
    const depth = depthFromRoot(session, root.id, input.sessions)
    return depth >= 0 ? [{ session, depth }] : []
  })
  if (!descendants.some(({ session }) => NOVELX_GROWTH_CHILD.test(session.title))) return undefined

  const active = descendants
    .flatMap(({ session, depth }) => {
      const status = input.statuses[session.id]
      return status && status.type !== "idle" ? [{ session, depth, status }] : []
    })
    .sort((a, b) => {
      if (a.status.type === "retry" && b.status.type !== "retry") return -1
      if (a.status.type !== "retry" && b.status.type === "retry") return 1
      return b.depth - a.depth
    })[0]
  if (!active) return undefined

  return {
    rootID: root.id,
    sessionID: active.session.id,
    title: active.session.id === root.id ? "当前任务" : growthTitle(active.session.title),
    status: active.status,
  }
}
