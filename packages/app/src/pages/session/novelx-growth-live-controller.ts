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
}) {
  const [followMode, setFollowMode] = createSignal<"auto" | "manual">("auto")
  const [selectedArtifactKey, setSelectedArtifactKey] = createSignal<string>()
  const synchronized = new Set<string>()

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

  const projection = () => {
    const current = project()
    synchronize(current)
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
    resumeFollow() {
      setFollowMode("auto")
      setSelectedArtifactKey(project().primaryArtifactKey)
    },
  }
}
