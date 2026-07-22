import { createHash } from "node:crypto"
import { NovelXWorld, NovelXWorldPublication, NovelXWorldVisual } from "@opencode-ai/schema"
import { worldSha256 } from "./world-blueprint"
import { worldVisualRegistrationSha256 } from "./world-visual"

export class WorldPublicationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function createWorldPublication(input: {
  materialization: NovelXWorld.WorldMaterialization
  visual: NovelXWorldVisual.Manifest
  now: number
}) {
  if (input.materialization.status !== "completed") {
    throw new WorldPublicationError(
      "NOVELX_PUBLICATION_WORLD_INCOMPLETE",
      "World publication requires a completed world.",
    )
  }
  if (input.visual.worldMaterializationIntegritySha256 !== input.materialization.integritySha256) {
    throw new WorldPublicationError(
      "NOVELX_PUBLICATION_VISUAL_STALE",
      "World publication requires current visual facts.",
    )
  }
  const documents = new Map(input.materialization.documents.map((document) => [document.entityId, document]))
  const entities = input.materialization.stages.flatMap((stage) => stage.entities)
  const atlas = entities.map((entity) => publicationRecord(entity, documents, "atlas", input.now))
  const wonderEntityIds = [
    ...new Set(
      input.visual.tasks.flatMap((task) =>
        task.type === "scenery" && task.subtype === "wonder" && task.ownerEntityId ? [task.ownerEntityId] : [],
      ),
    ),
  ]
  const travelogues = wonderEntityIds.map((entityId) => {
    const entity = entities.find((candidate) => candidate.id === entityId)
    if (!entity) {
      throw new WorldPublicationError("NOVELX_PUBLICATION_WONDER_UNKNOWN", "A wonder references an unknown entity.")
    }
    return publicationRecord(entity, documents, "travelogue", input.now)
  })
  const draft = {
    schemaVersion: 1 as const,
    stage: "world_publication" as const,
    status: "writing" as const,
    worldMaterializationIntegritySha256: input.materialization.integritySha256,
    worldVisualIntegritySha256: worldVisualRegistrationSha256(input.visual),
    records: [...atlas, ...travelogues],
    createdAt: input.now,
    updatedAt: input.now,
  }
  return { ...draft, integritySha256: worldSha256(draft) } satisfies NovelXWorldPublication.Manifest
}

export function commitWorldPublication(input: {
  manifest: NovelXWorldPublication.Manifest
  entityId: string
  kind: NovelXWorldPublication.RecordKind
  sourceSha256: string
  markdown: string
  now: number
}) {
  const current = verifyWorldPublication(input.manifest)
  const record = current.records.find(
    (candidate) => candidate.entityId === input.entityId && candidate.kind === input.kind,
  )
  if (!record) throw new WorldPublicationError("NOVELX_PUBLICATION_RECORD_UNKNOWN", "Unknown publication record.")
  if (record.sourceSha256 !== input.sourceSha256) {
    throw new WorldPublicationError("NOVELX_PUBLICATION_SOURCE_DRIFT", "Publication source hash has changed.")
  }
  const markdown = input.markdown.trim() + "\n"
  validatePublishedMarkdown(markdown, input.kind)
  const committedSha256 = createHash("sha256").update(markdown).digest("hex")
  if (record.status === "committed") {
    if (record.committedSha256 !== committedSha256) {
      throw new WorldPublicationError(
        "NOVELX_PUBLICATION_ALREADY_COMMITTED",
        "Publication record is already committed.",
      )
    }
    return { manifest: current, record, markdown, replayed: true }
  }
  const records = current.records.map(
    (candidate): NovelXWorldPublication.PublicationRecord =>
      candidate.id === record.id
        ? { ...candidate, status: "committed", committedSha256, updatedAt: input.now }
        : candidate,
  )
  const status: NovelXWorldPublication.Manifest["status"] = records.every(
    (candidate) => candidate.status === "committed",
  )
    ? "ready"
    : "writing"
  const draft = { ...current, status, records, updatedAt: input.now, integritySha256: undefined }
  const { integritySha256: _ignored, ...withoutIntegrity } = draft
  const manifest = {
    ...withoutIntegrity,
    integritySha256: worldSha256(withoutIntegrity),
  } satisfies NovelXWorldPublication.Manifest
  return {
    manifest,
    record: manifest.records.find((candidate) => candidate.id === record.id)!,
    markdown,
    replayed: false,
  }
}

export function verifyWorldPublication(
  manifest: NovelXWorldPublication.Manifest,
  sources?: { materializationSha256: string; visualSha256: string },
) {
  const { integritySha256, ...draft } = manifest
  if (worldSha256(draft) !== integritySha256) {
    throw new WorldPublicationError("NOVELX_PUBLICATION_INTEGRITY_INVALID", "World publication integrity failed.")
  }
  if (
    sources &&
    (manifest.worldMaterializationIntegritySha256 !== sources.materializationSha256 ||
      manifest.worldVisualIntegritySha256 !== sources.visualSha256)
  ) {
    throw new WorldPublicationError("NOVELX_PUBLICATION_SOURCE_DRIFT", "World publication belongs to stale facts.")
  }
  const keys = new Set(manifest.records.map((record) => `${record.entityId}:${record.kind}`))
  if (keys.size !== manifest.records.length) {
    throw new WorldPublicationError("NOVELX_PUBLICATION_RECORD_DUPLICATE", "Publication records must be unique.")
  }
  if (manifest.status === "ready" && manifest.records.some((record) => record.status !== "committed")) {
    throw new WorldPublicationError("NOVELX_PUBLICATION_STATUS_INVALID", "A ready publication has pending records.")
  }
  return manifest
}

function publicationRecord(
  entity: NovelXWorld.RegisteredEntity,
  documents: Map<string, NovelXWorld.WorldDocumentRecord>,
  kind: NovelXWorldPublication.RecordKind,
  now: number,
) {
  const source = documents.get(entity.id)
  if (source?.status !== "committed" || !source.committedSha256) {
    throw new WorldPublicationError("NOVELX_PUBLICATION_SOURCE_UNCOMMITTED", `Source ${entity.id} is not committed.`)
  }
  return {
    id: stableId(entity.id, kind, source.committedSha256),
    entityId: entity.id,
    kind,
    title: kind === "atlas" ? entity.name : `${entity.name}纪行`,
    status: "pending" as const,
    sourcePath: source.targetPath,
    sourceSha256: source.committedSha256,
    targetPath: `${NovelXWorldPublication.PUBLICATION_DIRECTORY}/${entity.id}/${kind === "atlas" ? "图志" : "纪行"}.md`,
    committedSha256: null,
    updatedAt: now,
  } satisfies NovelXWorldPublication.PublicationRecord
}

function validatePublishedMarkdown(markdown: string, kind: NovelXWorldPublication.RecordKind) {
  if (markdown.length < 300 || !markdown.startsWith("# ")) {
    throw new WorldPublicationError(
      "NOVELX_PUBLICATION_CONTENT_INVALID",
      "Published prose requires a title and at least 300 characters.",
    )
  }
  const forbidden = [
    "## 事实依据",
    "## 因果推演",
    "注册事实",
    "阶段主编",
    "执行 Agent",
    "执行Agent",
    "来源 SHA-256",
    "sourceSha256",
    "taskSessionId",
    ".novelx/",
    "世界层 0",
  ]
  if (forbidden.some((token) => markdown.includes(token))) {
    throw new WorldPublicationError(
      "NOVELX_PUBLICATION_INTERNAL_LEAK",
      "Published prose contains internal production vocabulary.",
    )
  }
  if (kind === "travelogue" && !/^署名：.+$/mu.test(markdown)) {
    throw new WorldPublicationError("NOVELX_PUBLICATION_BYLINE_REQUIRED", "Travelogue prose requires a byline.")
  }
}

function stableId(...parts: string[]) {
  return `nx-publication-${createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16)}`
}
