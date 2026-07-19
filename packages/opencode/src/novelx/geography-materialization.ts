import { createHash } from "node:crypto"
import { NovelXGrowth } from "@opencode-ai/schema"
import { verifyNovelXGrowthSkeleton } from "./growth-skeleton"

const REQUIRED_SECTIONS = ["事实依据", "因果推演", "地貌与空间", "气候与生态", "资源与通行", "风险与限制", "关系"]

export class GeographyMaterializationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function createGeographyMaterialization(input: {
  skeleton: NovelXGrowth.Manifest
  growthSessionId: string
  now: number
}): NovelXGrowth.GeographyMaterialization {
  const skeleton = verifyNovelXGrowthSkeleton(input.skeleton)
  const draft = {
    schemaVersion: 1 as const,
    stage: "geography_materialization" as const,
    status: "running" as const,
    skeletonIntegritySha256: skeleton.integritySha256,
    growthSessionId: input.growthSessionId,
    startedAt: input.now,
    updatedAt: input.now,
    records: skeleton.terrain.nodes.map((node) => ({
      terrainId: node.id,
      targetPath: geographyTargetPath(node.name),
      draftPath: `${NovelXGrowth.GEOGRAPHY_DRAFT_DIRECTORY}/${node.id}.md`,
      status: "registered" as const,
      lease: null,
      taskSessionId: null,
      draftSha256: null,
      committedSha256: null,
      updatedAt: input.now,
      errorCode: null,
    })),
  }
  return withIntegrity(draft)
}

export function verifyGeographyMaterialization(input: {
  manifest: NovelXGrowth.GeographyMaterialization
  skeleton: NovelXGrowth.Manifest
}) {
  const skeleton = verifyNovelXGrowthSkeleton(input.skeleton)
  const { integritySha256, ...draft } = input.manifest
  if (sha256(draft) !== integritySha256) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_MATERIALIZATION_INTEGRITY_INVALID",
      "Geography materialization integrity check failed.",
    )
  }
  if (input.manifest.skeletonIntegritySha256 !== skeleton.integritySha256) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_SKELETON_MISMATCH",
      "Geography materialization belongs to a different terrain skeleton.",
    )
  }
  const expected = new Map(skeleton.terrain.nodes.map((node) => [node.id, geographyTargetPath(node.name)]))
  if (input.manifest.records.length !== expected.size) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_RECORD_SET_INVALID",
      "Geography materialization does not cover every registered terrain node.",
    )
  }
  for (const record of input.manifest.records) {
    if (expected.get(record.terrainId) !== record.targetPath) {
      throw new GeographyMaterializationError(
        "NOVELX_GEOGRAPHY_RECORD_INVALID",
        `Unexpected geography document record for ${record.terrainId}.`,
      )
    }
  }
  return input.manifest
}

export function prepareGeographyDocument(input: {
  manifest: NovelXGrowth.GeographyMaterialization
  skeleton: NovelXGrowth.Manifest
  terrainId: string
  ownerSessionId: string
  ownerMessageId: string
  now: number
}) {
  const current = verifyGeographyMaterialization(input)
  if (current.growthSessionId !== input.ownerSessionId) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_EDITOR_SESSION_INVALID",
      "Only the Growth editor session that owns this run may prepare geography documents.",
    )
  }
  const record = current.records.find((item) => item.terrainId === input.terrainId)
  if (!record) {
    throw new GeographyMaterializationError("NOVELX_GEOGRAPHY_TERRAIN_UNKNOWN", "Unknown registered terrain node.")
  }
  if (record.status === "committed") {
    return {
      manifest: current,
      record,
      context: geographyContextPacket(input.skeleton, input.terrainId),
      replayed: true,
    }
  }
  if (record.lease && record.lease.ownerSessionId !== input.ownerSessionId) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_LEASE_CONFLICT",
      `Geography document ${record.targetPath} is already leased by another session.`,
    )
  }
  const lease =
    record.lease ??
    ({
      id: `nx-lease-${sha256([input.terrainId, input.ownerSessionId, input.ownerMessageId, input.now]).slice(0, 20)}`,
      ownerSessionId: input.ownerSessionId,
      ownerMessageId: input.ownerMessageId,
      acquiredAt: input.now,
    } as const)
  const nextRecord = {
    ...record,
    status: "leased" as const,
    lease,
    errorCode: null,
    updatedAt: input.now,
  }
  const next = updateRecord(current, nextRecord, input.now)
  return {
    manifest: next,
    record: nextRecord,
    context: geographyContextPacket(input.skeleton, input.terrainId),
    replayed: false,
  }
}

export function commitGeographyDocument(input: {
  manifest: NovelXGrowth.GeographyMaterialization
  skeleton: NovelXGrowth.Manifest
  terrainId: string
  ownerSessionId: string
  taskSessionId: string
  draft: string
  now: number
}) {
  const current = verifyGeographyMaterialization(input)
  if (current.growthSessionId !== input.ownerSessionId) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_EDITOR_SESSION_INVALID",
      "Only the owning Growth editor may commit geography documents.",
    )
  }
  const record = current.records.find((item) => item.terrainId === input.terrainId)
  const node = input.skeleton.terrain.nodes.find((item) => item.id === input.terrainId)
  if (!record || !node) {
    throw new GeographyMaterializationError("NOVELX_GEOGRAPHY_TERRAIN_UNKNOWN", "Unknown registered terrain node.")
  }
  if (record.status === "committed") {
    if (record.committedSha256 !== sha256(normalizeGeographyDraft(node.name, input.draft))) {
      throw new GeographyMaterializationError(
        "NOVELX_GEOGRAPHY_COMMIT_CONFLICT",
        `Geography document ${record.targetPath} was already committed with different content.`,
      )
    }
    return { manifest: current, record, draft: normalizeGeographyDraft(node.name, input.draft), replayed: true }
  }
  if (!record.lease || record.lease.ownerSessionId !== input.ownerSessionId) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_LEASE_REQUIRED",
      `Geography document ${record.targetPath} must be leased before commit.`,
    )
  }
  const draft = normalizeGeographyDraft(node.name, input.draft)
  const hash = sha256(draft)
  const nextRecord = {
    ...record,
    status: "committed" as const,
    lease: null,
    taskSessionId: input.taskSessionId,
    draftSha256: hash,
    committedSha256: hash,
    errorCode: null,
    updatedAt: input.now,
  }
  return { manifest: updateRecord(current, nextRecord, input.now), record: nextRecord, draft, replayed: false }
}

export function abortGeographyDocument(input: {
  manifest: NovelXGrowth.GeographyMaterialization
  skeleton: NovelXGrowth.Manifest
  terrainId: string
  ownerSessionId: string
  taskSessionId?: string
  now: number
  errorCode?: string
}) {
  const current = verifyGeographyMaterialization(input)
  const record = current.records.find((item) => item.terrainId === input.terrainId)
  if (!record || current.growthSessionId !== input.ownerSessionId) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_ABORT_FORBIDDEN",
      "Only the owning Growth editor may stop a geography document task.",
    )
  }
  if (record.status === "committed") return current
  return updateRecord(
    current,
    {
      ...record,
      status: "waiting_user",
      lease: null,
      taskSessionId: input.taskSessionId ?? record.taskSessionId,
      errorCode: input.errorCode ?? "NOVELX_GEOGRAPHY_STOPPED_BY_USER",
      updatedAt: input.now,
    },
    input.now,
    "waiting_user",
  )
}

export function finishGeographyMaterialization(input: {
  manifest: NovelXGrowth.GeographyMaterialization
  skeleton: NovelXGrowth.Manifest
  ownerSessionId: string
  now: number
}) {
  const current = verifyGeographyMaterialization(input)
  if (current.growthSessionId !== input.ownerSessionId) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_EDITOR_SESSION_INVALID",
      "Only the owning Growth editor may finish geography materialization.",
    )
  }
  const pending = current.records.filter((record) => record.status !== "committed")
  if (pending.length) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_DOCUMENTS_INCOMPLETE",
      `${pending.length} registered geography documents are not committed.`,
    )
  }
  const { integritySha256: _, ...draft } = current
  return withIntegrity({ ...draft, status: "completed" as const, updatedAt: input.now })
}

export function geographyContextPacket(skeleton: NovelXGrowth.Manifest, terrainId: string) {
  const verified = verifyNovelXGrowthSkeleton(skeleton)
  const terrain = verified.terrain.nodes.find((node) => node.id === terrainId)
  if (!terrain) {
    throw new GeographyMaterializationError("NOVELX_GEOGRAPHY_TERRAIN_UNKNOWN", "Unknown registered terrain node.")
  }
  const nodes = new Map(verified.terrain.nodes.map((node) => [node.id, node]))
  const parent = terrain.parentId ? (nodes.get(terrain.parentId) ?? null) : null
  const children = verified.terrain.nodes.filter((node) => node.parentId === terrain.id)
  const relations = verified.terrain.relations.flatMap((relation) => {
    if (relation.fromId !== terrain.id && relation.toId !== terrain.id) return []
    const other = nodes.get(relation.fromId === terrain.id ? relation.toId : relation.fromId)
    return other
      ? [
          {
            kind: relation.kind,
            other: { id: other.id, name: other.name, kind: other.kind },
            summary: relation.summary,
          },
        ]
      : []
  })
  return {
    world: {
      title: verified.profile.title,
      genre: verified.profile.genre,
      designSummary: verified.profile.designSummary,
    },
    terrain,
    parent,
    children,
    relations,
  }
}

export function normalizeGeographyDraft(name: string, value: string) {
  const normalized = value.replaceAll("\r\n", "\n").trim() + "\n"
  if (normalized.length < 500 || normalized.length > 20_000) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_DRAFT_LENGTH_INVALID",
      "Geography draft must contain 500 to 20000 characters of concrete content.",
    )
  }
  if (!normalized.startsWith(`# ${name}\n`)) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_DRAFT_TITLE_INVALID",
      `Geography draft must start with '# ${name}'.`,
    )
  }
  const missing = REQUIRED_SECTIONS.filter((section) => !normalized.includes(`\n## ${section}\n`))
  if (missing.length) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_DRAFT_SECTION_MISSING",
      `Geography draft is missing required sections: ${missing.join(", ")}.`,
    )
  }
  if (/(?:待填充|待补充|TODO|TBD|作为AI|无法确定)/iu.test(normalized)) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_DRAFT_PLACEHOLDER",
      "Geography draft contains placeholder or model-disclaimer text.",
    )
  }
  return normalized
}

function geographyTargetPath(name: string) {
  if (/[<>:"/\\|?*\u0000-\u001f]|[. ]$/u.test(name)) {
    throw new GeographyMaterializationError(
      "NOVELX_GEOGRAPHY_TARGET_PATH_INVALID",
      `Terrain name cannot be used as a Windows document path: ${name}`,
    )
  }
  return `World/地理/${name}.md`
}

function updateRecord(
  current: NovelXGrowth.GeographyMaterialization,
  record: NovelXGrowth.GeographyDocumentRecord,
  now: number,
  status: "running" | "waiting_user" | "completed" | "failed" = "running",
) {
  const { integritySha256: _, ...draft } = current
  return withIntegrity({
    ...draft,
    status,
    updatedAt: now,
    records: current.records.map((item) => (item.terrainId === record.terrainId ? record : item)),
  })
}

function withIntegrity<T extends Omit<NovelXGrowth.GeographyMaterialization, "integritySha256">>(draft: T) {
  return { ...draft, integritySha256: sha256(draft) }
}

export function geographySha256(value: unknown) {
  return sha256(value)
}

function sha256(value: unknown) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value), "utf8")
    .digest("hex")
}
