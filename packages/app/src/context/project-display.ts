import type { Project } from "@opencode-ai/sdk/v2"
import type { ProjectMeta } from "./global-sync/types"

type ProjectEntry = Partial<Project> & { worktree: string; expanded: boolean }

export function projectDisplayMetadata(input: {
  project: { worktree: string; expanded: boolean }
  metadata?: Project
  local?: ProjectMeta
  iconOverride?: string
}): ProjectEntry {
  const base: ProjectEntry = { ...input.metadata, ...input.project }
  const local = !base.id || base.id === "global" ? input.local : undefined
  const merged: ProjectEntry = local
    ? {
        ...base,
        ...local,
        icon: { ...base.icon, ...local.icon },
        commands: { ...base.commands, ...local.commands },
      }
    : base

  if (!input.iconOverride) return merged
  return { ...merged, icon: { ...merged.icon, override: input.iconOverride } }
}
