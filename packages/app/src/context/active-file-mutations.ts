const ACTIVE_TOOL_STATES = new Set(["pending", "running"])
const PATH_TOOL_NAMES = new Set(["write", "edit"])
const PATCH_PATH = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm

const normalize = (path: string) => path.replaceAll("\\", "/").replace(/^\.\//, "")

export function activeFileMutations(parts: readonly unknown[]) {
  const files: string[] = []
  const seen = new Set<string>()
  const add = (path: unknown) => {
    if (typeof path !== "string" || !path) return
    const value = normalize(path)
    if (!value || seen.has(value)) return
    seen.add(value)
    files.push(value)
  }

  for (const part of parts) {
    if (!part || typeof part !== "object") continue
    const value = part as {
      type?: unknown
      tool?: unknown
      state?: { status?: unknown; input?: Record<string, unknown> }
    }
    if (value.type !== "tool" || typeof value.tool !== "string") continue
    if (!ACTIVE_TOOL_STATES.has(String(value.state?.status))) continue
    const input = value.state?.input
    if (!input) continue

    if (PATH_TOOL_NAMES.has(value.tool)) {
      add(input.filePath ?? input.path)
      continue
    }
    if (value.tool !== "apply_patch" || typeof input.patchText !== "string") continue

    PATCH_PATH.lastIndex = 0
    for (const match of input.patchText.matchAll(PATCH_PATH)) add(match[1]?.trim())
  }
  return files
}
