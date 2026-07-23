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
  return novelXPrivateCommandMessageParts({ command: "growth", ...input })
}

export function novelXDyMessageParts<T extends MessagePartInput>(input: {
  arguments: string
  templateParts: readonly T[]
  attachmentParts?: readonly T[]
}): Array<(T & { synthetic?: boolean }) | NovelXVisibleCommandPart> {
  return novelXPrivateCommandMessageParts({ command: "dy", ...input })
}

function novelXPrivateCommandMessageParts<T extends MessagePartInput>(input: {
  command: string
  arguments: string
  templateParts: readonly T[]
  attachmentParts?: readonly T[]
}): Array<(T & { synthetic?: boolean }) | NovelXVisibleCommandPart> {
  const args = input.arguments.trim()
  const visible: NovelXVisibleCommandPart = {
    type: "text",
    text: args ? `/${input.command} ${args}` : `/${input.command}`,
    ignored: true,
  }
  const internal = input.templateParts.map((part) =>
    part.type === "text" ? ({ ...part, synthetic: true } as T & { synthetic: true }) : part,
  )
  return [visible, ...internal, ...(input.attachmentParts ?? [])]
}
