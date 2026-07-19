export const NOVELX_GROWTH_AGENT = "growth"
export const NOVELX_GROWTH_TOOL = "novelx_finish_geography"

type TurnMessage = {
  info: {
    role: string
    parentID?: string
  }
  parts: ReadonlyArray<{
    type: string
    tool?: string
    state?: { status?: string }
  }>
}

export function novelXGrowthToolCompleted(messages: ReadonlyArray<TurnMessage>, userMessageId: string) {
  return messages.some(
    (message) =>
      message.info.role === "assistant" &&
      message.info.parentID === userMessageId &&
      message.parts.some(
        (part) => part.type === "tool" && part.tool === NOVELX_GROWTH_TOOL && part.state?.status === "completed",
      ),
  )
}

export function restrictNovelXGrowthTools<T>(input: {
  agent: string
  completedThisTurn: boolean
  tools: Record<string, T>
}) {
  if (input.agent !== NOVELX_GROWTH_AGENT || !input.completedThisTurn) return input.tools
  return {} as Record<string, T>
}
