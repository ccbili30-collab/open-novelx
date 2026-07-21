export type SessionDeletionNode = {
  id: string
  parentID?: string
}

export function collectSessionDeletionIDs(sessions: readonly SessionDeletionNode[], sessionID: string) {
  const children = new Map<string, string[]>()
  for (const session of sessions) {
    if (!session.parentID) continue
    const current = children.get(session.parentID)
    if (current) current.push(session.id)
    if (!current) children.set(session.parentID, [session.id])
  }

  const removed: string[] = []
  const seen = new Set<string>()
  const pending = [sessionID]
  while (pending.length) {
    const id = pending.shift()
    if (!id || seen.has(id)) continue
    seen.add(id)
    removed.push(id)
    pending.unshift(...(children.get(id) ?? []))
  }
  return removed
}

export async function discoverSessionDeletionNodes(input: {
  sessionID: string
  children: (sessionID: string) => Promise<readonly SessionDeletionNode[]>
}) {
  const result: SessionDeletionNode[] = [{ id: input.sessionID }]
  const seen = new Set<string>()
  const pending = [input.sessionID]
  while (pending.length) {
    const parentID = pending.shift()
    if (!parentID || seen.has(parentID)) continue
    seen.add(parentID)
    const children = await input.children(parentID)
    for (const child of children) {
      if (seen.has(child.id) || result.some((candidate) => candidate.id === child.id)) continue
      result.push(child)
      pending.push(child.id)
    }
  }
  return result
}

export function sessionExistsFromGetResult(result: { data?: unknown; error?: unknown }) {
  if (result.data) return true
  if (
    result.error &&
    typeof result.error === "object" &&
    "name" in result.error &&
    result.error.name === "NotFoundError"
  )
    return false
  throw new Error("Unable to verify that the session was deleted")
}

export function assertCompleteSessionList<T>(sessions: readonly T[], limit: number) {
  if (sessions.length >= limit) throw new Error("Unable to prove the project session list is complete")
  return sessions
}

export async function requestSessionDeletion(input: {
  sessionID: string
  children: (sessionID: string) => Promise<readonly SessionDeletionNode[]>
  abort: (sessionID: string) => Promise<void>
  remove: (sessionID: string) => Promise<boolean>
  exists: (sessionID: string) => Promise<boolean>
}) {
  const nodes = await discoverSessionDeletionNodes({ sessionID: input.sessionID, children: input.children })
  const removed = nodes.map((node) => node.id)
  for (const sessionID of removed) {
    await input.abort(sessionID)
  }
  if (!(await input.remove(input.sessionID))) throw new Error("Session delete was rejected")
  for (const sessionID of removed) {
    if (await input.exists(sessionID)) throw new Error(`Session still exists after deletion: ${sessionID}`)
  }
  return removed
}
