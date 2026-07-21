type MessagePartInput = { type: string; [key: string]: unknown }

export type NovelXVisibleCommandPart = {
  type: "text"
  text: string
  ignored: true
}

export function novelXGrowthMessageParts<T extends MessagePartInput>(input: {
  arguments: string
  templateParts: readonly T[]
  attachmentParts?: readonly T[]
}): Array<(T & { synthetic?: boolean }) | NovelXVisibleCommandPart> {
  const args = input.arguments.trim()
  const visible: NovelXVisibleCommandPart = {
    type: "text",
    text: args ? `/growth ${args}` : "/growth",
    ignored: true,
  }
  const internal = input.templateParts.map((part) =>
    part.type === "text" ? ({ ...part, synthetic: true } as T & { synthetic: true }) : part,
  )
  return [visible, ...internal, ...(input.attachmentParts ?? [])]
}
