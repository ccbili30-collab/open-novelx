export function navigableTaskSessionID(input: Record<string, unknown>, sessionID: string | undefined) {
  if (!sessionID) return
  const agent = input.subagent_type
  if (typeof agent === "string" && agent.startsWith("novelx-")) return
  return sessionID
}
