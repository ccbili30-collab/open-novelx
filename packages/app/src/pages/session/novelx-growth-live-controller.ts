import { createComputed, createSignal, type Accessor } from "solid-js"
import { novelXRootSessionID } from "./novelx-workspace-model"
import {
  projectNovelXLiveGrowth,
  type NovelXLiveGrowthInput,
  type NovelXLiveGrowthProjection,
} from "./novelx-growth-live-projection"

export function createNovelXGrowthLiveController(input: {
  currentSessionId: Accessor<string | undefined>
  source: Accessor<NovelXLiveGrowthInput>
  syncSession: (sessionId: string) => void | Promise<unknown>
  fileSurfaceVisible?: Accessor<boolean>
  refreshDirectory?: (path: string) => void | Promise<unknown>
  expandDirectory?: (path: string) => void
}) {
  const [followMode, setFollowMode] = createSignal<"auto" | "manual">("auto")
  const [selectedArtifactKey, setSelectedArtifactKey] = createSignal<string>()
  const synchronized = new Set<string>()
  const artifactStates = new Map<string, NovelXLiveGrowthProjection["artifacts"][number]["state"]>()
  const revealing = new Set<string>()
  let observedMaterialization = false

  const project = (): NovelXLiveGrowthProjection => {
    const source = input.source()
    const current = input.currentSessionId()
    if (!current) return { artifacts: [] }
    const root = novelXRootSessionID(source.sessions, current)
    if (!root) return { artifacts: [] }
    if (source.materialization?.growthSessionId && source.materialization.growthSessionId !== root) {
      return { artifacts: [] }
    }
    return projectNovelXLiveGrowth(source)
  }

  const synchronize = (current: NovelXLiveGrowthProjection) => {
    const primary = current.artifacts.find((artifact) => artifact.key === current.primaryArtifactKey)
    const sessionId = primary?.writerSessionId
    if (!sessionId || synchronized.has(sessionId)) return
    synchronized.add(sessionId)
    Promise.resolve(input.syncSession(sessionId)).catch(() => synchronized.delete(sessionId))
  }

  const revealCommitted = (current: NovelXLiveGrowthProjection) => {
    if (!current.stage && !current.artifacts.length) return
    if (!observedMaterialization) {
      observedMaterialization = true
      for (const artifact of current.artifacts) artifactStates.set(artifact.key, artifact.state)
      return
    }
    for (const artifact of current.artifacts) {
      const previous = artifactStates.get(artifact.key)
      artifactStates.set(artifact.key, artifact.state)
      if (artifact.state !== "committed" || previous === "committed") continue
      if (!input.refreshDirectory || revealing.has(artifact.targetPath)) continue
      revealing.add(artifact.targetPath)
      void revealCommittedPath(artifact.targetPath, input)
        .catch(() => artifactStates.set(artifact.key, previous ?? "registered"))
        .finally(() => revealing.delete(artifact.targetPath))
    }
  }

  const projection = () => {
    const current = project()
    synchronize(current)
    revealCommitted(current)
    if (followMode() === "auto") setSelectedArtifactKey(current.primaryArtifactKey)
    return current
  }

  createComputed(() => void projection())

  return {
    projection,
    followMode,
    selectedArtifactKey,
    selectArtifact(key: string) {
      setFollowMode("manual")
      setSelectedArtifactKey(key)
    },
    pauseFollow() {
      setFollowMode("manual")
      setSelectedArtifactKey(undefined)
    },
    resumeFollow() {
      setFollowMode("auto")
      setSelectedArtifactKey(project().primaryArtifactKey)
    },
  }
}

async function revealCommittedPath(
  targetPath: string,
  input: {
    fileSurfaceVisible?: Accessor<boolean>
    refreshDirectory?: (path: string) => void | Promise<unknown>
    expandDirectory?: (path: string) => void
  },
) {
  const segments = targetPath.replaceAll("\\", "/").split("/").filter(Boolean).slice(0, -1)
  const parents = ["", ...segments.map((_, index) => segments.slice(0, index + 1).join("/"))]
  for (const parent of parents) {
    await input.refreshDirectory?.(parent)
    if (input.fileSurfaceVisible?.()) input.expandDirectory?.(parent)
  }
}
