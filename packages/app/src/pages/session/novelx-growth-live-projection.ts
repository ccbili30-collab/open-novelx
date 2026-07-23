import { projectNovelXDraftText } from "./novelx-workspace-model"

export type NovelXLiveGrowthStage = {
  id: string
  label: string
  state: "planned" | "registering" | "writing" | "completed" | "failed"
}

export type NovelXLiveGrowthArtifact = {
  key: string
  entityId: string
  stageId: string
  title: string
  targetPath: string
  state: "registered" | "leased" | "drafting" | "reviewing" | "committed" | "failed"
  locked: boolean
  writerSessionId?: string
  text: string
}

export type NovelXLiveGrowthProjection = {
  stage?: NovelXLiveGrowthStage
  artifacts: readonly NovelXLiveGrowthArtifact[]
  primaryArtifactKey?: string
}

type LiveBlueprint = {
  stages: readonly { id: string; label: string }[]
}

type LiveMaterialization = {
  growthSessionId?: string
  status: "running" | "waiting_user" | "completed" | "failed"
  stages: readonly {
    stageId: string
    status: "planned" | "prepared" | "registered" | "reviewing" | "completed" | "waiting_user" | "failed"
    editorSessionId: string | null
    entities: readonly { id: string; name: string }[]
  }[]
  documents: readonly {
    entityId: string
    stageId: string
    targetPath: string
    status: "registered" | "leased" | "drafting" | "submitted" | "reviewing" | "committed" | "failed" | "waiting_user"
    taskSessionId: string | null
    updatedAt: number
  }[]
}

type LiveSession = {
  id: string
  parentID?: string
  agent?: string
  title: string
  time: { created: number; updated: number }
}

type LiveSessionStatus = { type: "idle" | "busy" | "retry" }
type LiveMessage = { id: string; role: string }
type LiveToolStatus = "pending" | "running" | "completed" | "error"
type LivePart = {
  type: string
  text?: string
  synthetic?: boolean
  ignored?: boolean
  tool?: string
  state?: {
    status: LiveToolStatus
    input?: Readonly<Record<string, unknown>>
    title?: string
    metadata?: Readonly<Record<string, unknown>>
  }
}

export type NovelXLiveGrowthInput = {
  blueprint?: LiveBlueprint
  materialization?: LiveMaterialization
  sessions: readonly LiveSession[]
  statuses: Readonly<Record<string, LiveSessionStatus | undefined>>
  messages: Readonly<Record<string, readonly LiveMessage[] | undefined>>
  parts: Readonly<Record<string, readonly LivePart[] | undefined>>
}

export function projectNovelXLiveGrowth(input: NovelXLiveGrowthInput): NovelXLiveGrowthProjection {
  const stages = input.materialization?.stages ?? []
  const active = stages.find((stage) => stage.status !== "completed") ?? stages.at(-1)
  if (!active) return { artifacts: [] }
  const blueprint = input.blueprint?.stages.find((stage) => stage.id === active.stageId)
  const state =
    active.status === "failed"
      ? "failed"
      : active.status === "completed"
        ? "completed"
        : active.status === "planned"
          ? "planned"
          : active.status === "prepared" && active.editorSessionId && active.entities.length === 0
            ? "registering"
            : "writing"
  const sessions = new Map(input.sessions.map((session) => [session.id, session]))
  const artifacts =
    input.materialization?.documents.flatMap((document) => {
      const stage = input.materialization?.stages.find((candidate) => candidate.stageId === document.stageId)
      const entity = stage?.entities.find((candidate) => candidate.id === document.entityId)
      if (!stage || !entity) return []
      const task = writerTask(input, stage, entity.name)
      const writerSessionId = document.taskSessionId ?? task?.sessionId
      const writer = writerSessionId ? sessions.get(writerSessionId) : undefined
      const mappedWriterSessionId =
        writerSessionId && (!writer?.agent || writer.agent === "novelx-world-writer") ? writerSessionId : undefined
      return [
        {
          key: `world:${entity.id}`,
          entityId: entity.id,
          stageId: document.stageId,
          title: entity.name,
          targetPath: document.targetPath,
          state: artifactState(document.status, task?.status),
          locked: document.status !== "committed",
          ...(mappedWriterSessionId ? { writerSessionId: mappedWriterSessionId } : {}),
          text: mappedWriterSessionId
            ? projectNovelXDraftText(input.messages[mappedWriterSessionId] ?? [], input.parts)
            : "",
        } satisfies NovelXLiveGrowthArtifact,
      ]
    }) ?? []
  const primary = artifacts
    .filter((artifact) => artifact.writerSessionId && artifact.locked)
    .toSorted((left, right) => {
      const updated =
        (sessions.get(right.writerSessionId!)?.time.updated ?? 0) -
        (sessions.get(left.writerSessionId!)?.time.updated ?? 0)
      return updated || left.key.localeCompare(right.key)
    })[0]
  return {
    stage: { id: active.stageId, label: blueprint?.label ?? active.stageId, state },
    artifacts,
    ...(primary ? { primaryArtifactKey: primary.key } : {}),
  }
}

function writerTask(input: NovelXLiveGrowthInput, stage: LiveMaterialization["stages"][number], entityName: string) {
  if (!stage.editorSessionId) return
  const part = (input.messages[stage.editorSessionId] ?? [])
    .flatMap((message) => input.parts[message.id] ?? [])
    .findLast((part) => {
      if (part.type !== "tool" || part.tool !== "task" || !part.state) return false
      if (part.state.input?.subagent_type !== "novelx-world-writer") return false
      return part.state.title === `世界：${entityName}`
    })
  const sessionId = part?.state?.metadata?.sessionId
  if (typeof sessionId !== "string" || !part?.state) return
  return { sessionId, status: part.state.status }
}

function artifactState(
  document: LiveMaterialization["documents"][number]["status"],
  task?: LiveToolStatus,
): NovelXLiveGrowthArtifact["state"] {
  if (document === "committed") return "committed"
  if (document === "failed" || task === "error") return "failed"
  if (document === "submitted" || document === "reviewing" || document === "waiting_user" || task === "completed") {
    return "reviewing"
  }
  if (document === "drafting" || task === "pending" || task === "running") return "drafting"
  return document
}
