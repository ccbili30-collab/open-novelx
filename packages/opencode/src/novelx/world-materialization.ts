import { NovelXWorld } from "@opencode-ai/schema"
import { verifyWorldBlueprint, worldSha256 } from "./world-blueprint"

export class WorldMaterializationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function createWorldMaterialization(input: {
  blueprint: NovelXWorld.BlueprintManifest
  growthSessionId: string
  now: number
}): NovelXWorld.WorldMaterialization {
  const blueprint = verifyWorldBlueprint(input.blueprint)
  return withIntegrity({
    schemaVersion: 2 as const,
    stage: "world_materialization" as const,
    status: "running" as const,
    blueprintIntegritySha256: blueprint.integritySha256,
    growthSessionId: input.growthSessionId,
    startedAt: input.now,
    updatedAt: input.now,
    stages: blueprint.stages.map((stage) => ({
      stageId: stage.id,
      status: "planned" as const,
      editorSessionId: null,
      sourceReads: [],
      preparedContextSha256: null,
      preparedAt: null,
      registeredAt: null,
      entities: [],
      relations: [],
      handoff: null,
    })),
    documents: [],
    memoryCheckpoints: [],
  })
}

export function verifyWorldMaterialization(input: {
  manifest: NovelXWorld.WorldMaterialization
  blueprint: NovelXWorld.BlueprintManifest
}) {
  const blueprint = verifyWorldBlueprint(input.blueprint)
  const { integritySha256, ...draft } = input.manifest
  if (worldSha256(draft) !== integritySha256) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_MATERIALIZATION_INTEGRITY_INVALID",
      "World materialization integrity check failed.",
    )
  }
  if (input.manifest.blueprintIntegritySha256 !== blueprint.integritySha256) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_BLUEPRINT_MISMATCH",
      "World materialization belongs to a different blueprint.",
    )
  }
  if (
    input.manifest.stages.length !== blueprint.stages.length ||
    input.manifest.stages.some((record, index) => record.stageId !== blueprint.stages[index]?.id)
  ) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_SET_INVALID",
      "World materialization does not match every blueprint stage in order.",
    )
  }
  const entities = new Map(
    input.manifest.stages.flatMap((stage) => stage.entities.map((entity) => [entity.id, entity])),
  )
  if (entities.size !== input.manifest.stages.reduce((sum, stage) => sum + stage.entities.length, 0)) {
    throw new WorldMaterializationError("NOVELX_WORLD_ENTITY_DUPLICATE", "World entity IDs must be unique.")
  }
  for (const record of input.manifest.stages) {
    const stage = requireBlueprintStage(blueprint, record.stageId)
    if (
      (record.status === "planned" || record.status === "prepared") &&
      (record.entities.length || record.relations.length)
    ) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_STAGE_CONTENT_PREMATURE",
        `World stage ${stage.label} contains entities before registration.`,
      )
    }
    if (
      (record.status === "registered" || record.status === "reviewing" || record.status === "completed") &&
      record.entities.length !== stage.itemCount
    ) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_STAGE_ENTITY_COUNT_INVALID",
        `World stage ${stage.label} does not contain its registered entity count.`,
      )
    }
    if (record.status !== "planned" && !record.editorSessionId) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_STAGE_EDITOR_SESSION_INVALID",
        `World stage ${stage.label} has work without a bound stage editor.`,
      )
    }
    if (record.status === "completed") {
      if (!record.handoff) {
        throw new WorldMaterializationError(
          "NOVELX_WORLD_STAGE_HANDOFF_REQUIRED",
          `Completed world stage ${stage.label} has no sealed handoff.`,
        )
      }
      const { integritySha256: handoffIntegrity, ...handoffDraft } = record.handoff
      if (worldSha256(handoffDraft) !== handoffIntegrity || record.handoff.editorSessionId !== record.editorSessionId) {
        throw new WorldMaterializationError(
          "NOVELX_WORLD_STAGE_HANDOFF_INVALID",
          `World stage ${stage.label} has an invalid sealed handoff.`,
        )
      }
    } else if (record.handoff) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_STAGE_HANDOFF_PREMATURE",
        `World stage ${stage.label} has a handoff before completion.`,
      )
    }
    if (
      record.relations.some(
        (relation) =>
          entities.get(relation.fromEntityId)?.stageId !== record.stageId ||
          entities.get(relation.toEntityId)?.stageId !== record.stageId ||
          relation.fromEntityId === relation.toEntityId,
      )
    ) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_ENTITY_RELATION_INVALID",
        `World stage ${stage.label} contains an invalid relation.`,
      )
    }
  }
  const documents = new Map(input.manifest.documents.map((document) => [document.entityId, document]))
  if (documents.size !== input.manifest.documents.length || documents.size !== entities.size) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_DOCUMENT_SET_INVALID",
      "World materialization must contain exactly one document for every registered entity.",
    )
  }
  if (
    input.manifest.documents.some((document) => {
      const entity = entities.get(document.entityId)
      const stage = entity ? requireBlueprintStage(blueprint, entity.stageId) : undefined
      return (
        entity?.stageId !== document.stageId ||
        !stage ||
        document.targetPath !== worldTargetPath(stage, entity.name) ||
        document.draftPath !== `${NovelXWorld.DRAFT_DIRECTORY}/${entity.id}.md` ||
        !safeRelativePath(document.targetPath)
      )
    })
  ) {
    throw new WorldMaterializationError("NOVELX_WORLD_DOCUMENT_SET_INVALID", "World document set is invalid.")
  }
  for (const stage of input.manifest.stages) {
    const stageDocuments = input.manifest.documents.filter((document) => document.stageId === stage.stageId)
    if (
      (stage.status === "reviewing" || stage.status === "completed") &&
      stageDocuments.some((document) => document.status !== "committed")
    ) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_STAGE_REVIEW_INCOMPLETE",
        `World stage ${stage.stageId} is reviewing or completed with unfinished dossiers.`,
      )
    }
    for (const read of stage.sourceReads) {
      const source = documents.get(read.entityId)
      if (source?.status !== "committed" || source.committedSha256 !== read.sourceSha256) {
        throw new WorldMaterializationError(
          "NOVELX_WORLD_SOURCE_HASH_DRIFT",
          `World stage ${stage.stageId} contains a stale source read.`,
        )
      }
    }
    for (const entity of stage.entities) {
      for (const binding of entity.upstreamBindings) {
        const source = documents.get(binding.entityId)
        if (
          source?.status !== "committed" ||
          source.committedSha256 !== binding.sourceSha256 ||
          !stage.sourceReads.some(
            (read) => read.entityId === binding.entityId && read.sourceSha256 === binding.sourceSha256,
          )
        ) {
          throw new WorldMaterializationError(
            "NOVELX_WORLD_SOURCE_BINDING_INVALID",
            `World entity ${entity.id} has an unverified upstream source binding.`,
          )
        }
      }
    }
  }
  unique(
    input.manifest.memoryCheckpoints.map((checkpoint) => checkpoint.stageId),
    "Growth memory checkpoint stage",
  )
  for (const checkpoint of input.manifest.memoryCheckpoints) {
    const stage = requireStageRecord(input.manifest, checkpoint.stageId)
    if (stage.status !== "completed" || stage.handoff?.integritySha256 !== checkpoint.handoffIntegritySha256) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_CHECKPOINT_INVALID",
        `Growth memory checkpoint for ${checkpoint.stageId} does not match a sealed stage.`,
      )
    }
  }
  return input.manifest
}

export function prepareWorldStage(input: {
  manifest: NovelXWorld.WorldMaterialization
  blueprint: NovelXWorld.BlueprintManifest
  stageId: string
  ownerSessionId: string
  ownerParentSessionId: string | null
  now: number
}) {
  const current = verifyWorldMaterialization(input)
  if (input.ownerParentSessionId !== current.growthSessionId || input.ownerSessionId === current.growthSessionId) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_EDITOR_REQUIRED",
      "A world stage must be prepared by a clean stage editor child of the owning Growth session.",
    )
  }
  const stage = requireBlueprintStage(input.blueprint, input.stageId)
  const record = requireStageRecord(current, stage.id)
  if (record.editorSessionId && record.editorSessionId !== input.ownerSessionId) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_EDITOR_CONFLICT",
      `World stage ${stage.label} is already bound to another stage editor session.`,
    )
  }
  const dependencies = stage.dependsOnStageIds.map((dependencyId) => {
    const dependencyStage = requireBlueprintStage(input.blueprint, dependencyId)
    const dependencyRecord = requireStageRecord(current, dependencyId)
    if (dependencyRecord.status !== "completed") {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_STAGE_DEPENDENCY_INCOMPLETE",
        `World stage ${stage.label} requires completed stage ${dependencyStage.label}.`,
      )
    }
    return {
      stage: dependencyStage,
      entities: dependencyRecord.entities.map((entity) => ({
        entity,
        targetPath: requireDocument(current, entity.id).targetPath,
        sourceSha256: requireDocument(current, entity.id).committedSha256!,
      })),
    }
  })
  const context = {
    world: {
      title: input.blueprint.profile.title,
      genre: input.blueprint.profile.genre,
      designSummary: input.blueprint.profile.designSummary,
    },
    stage,
    dependencies,
  }
  const contextSha256 = worldSha256(context)
  const boundRecord = record.editorSessionId ? record : { ...record, editorSessionId: input.ownerSessionId }
  if (
    boundRecord.status === "registered" ||
    boundRecord.status === "reviewing" ||
    boundRecord.status === "completed"
  ) {
    const manifest = record.editorSessionId ? current : updateStage(current, boundRecord, input.now)
    return { manifest, stage: boundRecord, context, contextSha256, replayed: true }
  }
  if (boundRecord.status === "prepared" && boundRecord.preparedContextSha256 === contextSha256) {
    const manifest = record.editorSessionId ? current : updateStage(current, boundRecord, input.now)
    return { manifest, stage: boundRecord, context, contextSha256, replayed: true }
  }
  const nextRecord = {
    ...boundRecord,
    status: "prepared" as const,
    preparedContextSha256: contextSha256,
    preparedAt: input.now,
  }
  return {
    manifest: updateStage(current, nextRecord, input.now),
    stage: nextRecord,
    context,
    contextSha256,
    replayed: record.status === "prepared" && record.preparedContextSha256 === contextSha256,
  }
}

export function readWorldSources(input: {
  manifest: NovelXWorld.WorldMaterialization
  blueprint: NovelXWorld.BlueprintManifest
  stageId: string
  ownerSessionId: string
  entityIds: readonly string[]
  committedDocuments: Record<string, string>
  now: number
}) {
  const current = verifyWorldMaterialization(input)
  const blueprintStage = requireBlueprintStage(input.blueprint, input.stageId)
  const stage = requireStageRecord(current, input.stageId)
  assertStageEditor(stage, input.ownerSessionId)
  if (stage.status !== "prepared") {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_PREPARE_REQUIRED",
      `World stage ${blueprintStage.label} must be prepared before reading sources.`,
    )
  }
  unique([...input.entityIds], "world source entity")
  const allowed = new Set(
    current.stages
      .filter((record) => blueprintStage.dependsOnStageIds.includes(record.stageId) && record.status === "completed")
      .flatMap((record) => record.entities.map((entity) => entity.id)),
  )
  const sources = input.entityIds.map((entityId) => {
    if (!allowed.has(entityId)) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_SOURCE_INVALID",
        `Source ${entityId} is not a completed dependency of stage ${blueprintStage.label}.`,
      )
    }
    const located = requireEntity(current, input.blueprint, entityId)
    const dossier = requireCommittedDocument(current, entityId, input.committedDocuments)
    const sourceSha256 = worldSha256(dossier)
    return { entity: located.entity, sourceSha256, dossier }
  })
  const reads = new Map(stage.sourceReads.map((read) => [read.entityId, read]))
  for (const source of sources) {
    const existing = reads.get(source.entity.id)
    if (existing && existing.sourceSha256 !== source.sourceSha256) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_SOURCE_HASH_DRIFT",
        `Source ${source.entity.id} changed after this stage editor read it.`,
      )
    }
    reads.set(source.entity.id, existing ?? { entityId: source.entity.id, sourceSha256: source.sourceSha256, readAt: input.now })
  }
  const nextStage = { ...stage, sourceReads: [...reads.values()] }
  return { manifest: updateStage(current, nextStage, input.now), stage: nextStage, sources }
}

export function registerWorldStage(input: {
  manifest: NovelXWorld.WorldMaterialization
  blueprint: NovelXWorld.BlueprintManifest
  profile: NovelXWorld.StageRegistrationProfile
  ownerSessionId: string
  now: number
}) {
  const current = verifyWorldMaterialization(input)
  const blueprintStage = requireBlueprintStage(input.blueprint, input.profile.stageId)
  const stage = requireStageRecord(current, blueprintStage.id)
  assertStageEditor(stage, input.ownerSessionId)
  if (stage.status === "registered" || stage.status === "reviewing" || stage.status === "completed") {
    const profile = normalizeStageRegistration(input.profile, blueprintStage, current)
    if (stage.preparedContextSha256 === input.profile.contextSha256 && stageMatchesProfile(stage, profile)) {
      return { manifest: current, stage, replayed: true }
    }
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_REGISTRATION_CONFLICT",
      `World stage ${blueprintStage.label} is already registered.`,
    )
  }
  if (stage.status !== "prepared" || stage.preparedContextSha256 !== input.profile.contextSha256) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_CONTEXT_REQUIRED",
      `World stage ${blueprintStage.label} must be prepared from current committed facts before registration.`,
    )
  }
  const profile = normalizeStageRegistration(input.profile, blueprintStage, current)
  const entities = profile.entities.map((entity, index) => ({
    id: stableId("world-entity", blueprintStage.id, index, entity.name),
    stageId: blueprintStage.id,
    name: entity.name,
    typeLabel: entity.typeLabel,
    ordinal: index + 1,
    summary: entity.summary,
    facts: entity.facts,
    constraints: entity.constraints,
    upstreamBindings: entity.upstreamBindings.map((binding) => ({
      ...binding,
      sourceSha256: requireDocument(current, binding.entityId).committedSha256!,
    })),
    status: "registered" as const,
  }))
  const relations = profile.relations.map((relation, index) => ({
    id: stableId("world-relation", blueprintStage.id, index, relation.label),
    stageId: blueprintStage.id,
    fromEntityId: entities[relation.fromEntityIndex]!.id,
    toEntityId: entities[relation.toEntityIndex]!.id,
    label: relation.label,
    summary: relation.summary,
    status: "registered" as const,
  }))
  const nextStage = {
    ...stage,
    status: "registered" as const,
    registeredAt: input.now,
    entities,
    relations,
  }
  const documents = entities.map((entity) => ({
    entityId: entity.id,
    stageId: blueprintStage.id,
    targetPath: worldTargetPath(blueprintStage, entity.name),
    draftPath: `${NovelXWorld.DRAFT_DIRECTORY}/${entity.id}.md`,
    status: "registered" as const,
    lease: null,
    taskSessionId: null,
    draftSha256: null,
    committedSha256: null,
    updatedAt: input.now,
    errorCode: null,
  }))
  return {
    manifest: withIntegrity({
      ...withoutIntegrity(current),
      status: "running" as const,
      updatedAt: input.now,
      stages: current.stages.map((item) => (item.stageId === nextStage.stageId ? nextStage : item)),
      documents: [...current.documents, ...documents],
    }),
    stage: nextStage,
    replayed: false,
  }
}

export function prepareWorldDocument(input: {
  manifest: NovelXWorld.WorldMaterialization
  blueprint: NovelXWorld.BlueprintManifest
  entityId: string
  ownerSessionId: string
  ownerMessageId: string
  committedDocuments: Record<string, string>
  now: number
}) {
  const current = verifyWorldMaterialization(input)
  const located = requireEntity(current, input.blueprint, input.entityId)
  assertStageEditor(requireStageRecord(current, located.stage.id), input.ownerSessionId)
  const record = requireDocument(current, input.entityId)
  const context = worldDocumentContext(
    current,
    input.blueprint,
    located.stage,
    located.entity,
    input.committedDocuments,
  )
  if (record.status === "committed") return { manifest: current, record, context, replayed: true }
  if (record.lease && record.lease.ownerSessionId !== input.ownerSessionId) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_DOCUMENT_LEASE_CONFLICT",
      `World document ${record.targetPath} is leased by another session.`,
    )
  }
  const lease =
    record.lease ??
    ({
      id: `nx-lease-${worldSha256([input.entityId, input.ownerSessionId, input.ownerMessageId, input.now]).slice(0, 20)}`,
      ownerSessionId: input.ownerSessionId,
      ownerMessageId: input.ownerMessageId,
      acquiredAt: input.now,
    } as const)
  const nextRecord = { ...record, status: "leased" as const, lease, errorCode: null, updatedAt: input.now }
  return {
    manifest: updateDocument(current, nextRecord, input.now),
    record: nextRecord,
    context,
    replayed: false,
  }
}

export function commitWorldDocument(input: {
  manifest: NovelXWorld.WorldMaterialization
  blueprint: NovelXWorld.BlueprintManifest
  entityId: string
  ownerSessionId: string
  taskSessionId: string
  draft: string
  now: number
}) {
  const current = verifyWorldMaterialization(input)
  const located = requireEntity(current, input.blueprint, input.entityId)
  assertStageEditor(requireStageRecord(current, located.stage.id), input.ownerSessionId)
  const record = requireDocument(current, input.entityId)
  const draft = normalizeWorldDraft(located.entity.name, located.stage.documentSections, input.draft)
  const hash = worldSha256(draft)
  if (record.status === "committed") {
    if (record.committedSha256 !== hash) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_DOCUMENT_COMMIT_CONFLICT",
        `World document ${record.targetPath} already has different committed content.`,
      )
    }
    return { manifest: current, record, draft, replayed: true }
  }
  if (!record.lease || record.lease.ownerSessionId !== input.ownerSessionId) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_DOCUMENT_LEASE_REQUIRED",
      `World document ${record.targetPath} must be leased before commit.`,
    )
  }
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
  const withDocument = updateDocument(current, nextRecord, input.now)
  const stageDocuments = withDocument.documents.filter((document) => document.stageId === located.stage.id)
  const stageRecord = requireStageRecord(withDocument, located.stage.id)
  const next = stageDocuments.every((document) => document.status === "committed")
    ? updateStage(withDocument, { ...stageRecord, status: "reviewing" as const }, input.now)
    : withDocument
  return { manifest: next, record: nextRecord, draft, replayed: false }
}

export function finishWorldStage(input: {
  manifest: NovelXWorld.WorldMaterialization
  blueprint: NovelXWorld.BlueprintManifest
  stageId: string
  ownerSessionId: string
  navigationSummary: string
  now: number
}) {
  const current = verifyWorldMaterialization(input)
  const blueprintStage = requireBlueprintStage(input.blueprint, input.stageId)
  const stage = requireStageRecord(current, input.stageId)
  assertStageEditor(stage, input.ownerSessionId)
  if (stage.status === "completed" && stage.handoff) return { manifest: current, stage, replayed: true }
  const documents = current.documents.filter((document) => document.stageId === stage.stageId)
  if (stage.status !== "reviewing" || !documents.length || documents.some((document) => document.status !== "committed")) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_REVIEW_INCOMPLETE",
      `World stage ${blueprintStage.label} can only be sealed after every dossier is committed and under review.`,
    )
  }
  const summary = detail(input.navigationSummary, "navigationSummary")
  const missingSummaryEntities = stage.entities.filter(
    (entity) => !summary.includes(entity.id) && !summary.includes(entity.name),
  )
  if (missingSummaryEntities.length) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_SUMMARY_UNANCHORED",
      `Stage navigation summary must name every registered entity: ${missingSummaryEntities.map((entity) => entity.name).join(", ")}.`,
    )
  }
  const sourceEntityIds = [...new Set(stage.entities.flatMap((entity) => entity.upstreamBindings.map((item) => item.entityId)))]
  const handoffDraft = {
    sealedAt: input.now,
    editorSessionId: input.ownerSessionId,
    entityIds: stage.entities.map((entity) => entity.id),
    sourceEntityIds,
    documents: documents.map((document) => ({ entityId: document.entityId, sha256: document.committedSha256! })),
    navigationSummary: summary,
  }
  const handoff = { ...handoffDraft, integritySha256: worldSha256(handoffDraft) }
  const nextStage = { ...stage, status: "completed" as const, handoff }
  return { manifest: updateStage(current, nextStage, input.now), stage: nextStage, replayed: false }
}

export function checkpointGrowthMemory(input: {
  manifest: NovelXWorld.WorldMaterialization
  blueprint: NovelXWorld.BlueprintManifest
  stageId: string
  ownerSessionId: string
  compactionMessageId: string
  now: number
}) {
  const current = verifyWorldMaterialization(input)
  assertEditor(current, input.ownerSessionId)
  const stage = requireStageRecord(current, input.stageId)
  if (stage.status !== "completed" || !stage.handoff) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_HANDOFF_REQUIRED",
      "Growth memory can only checkpoint a sealed stage handoff.",
    )
  }
  const existing = current.memoryCheckpoints.find((checkpoint) => checkpoint.stageId === input.stageId)
  if (existing) {
    if (
      existing.handoffIntegritySha256 !== stage.handoff.integritySha256 ||
      existing.compactionMessageId !== input.compactionMessageId
    ) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_CHECKPOINT_CONFLICT",
        "The sealed stage handoff changed after its Growth memory checkpoint.",
      )
    }
    return { manifest: current, checkpoint: existing, replayed: true }
  }
  const checkpoint = {
    stageId: input.stageId,
    handoffIntegritySha256: stage.handoff.integritySha256,
    contextEpoch: current.memoryCheckpoints.length + 1,
    compactionMessageId: input.compactionMessageId,
    createdAt: input.now,
  }
  const manifest = withIntegrity({
    ...withoutIntegrity(current),
    updatedAt: input.now,
    memoryCheckpoints: [...current.memoryCheckpoints, checkpoint],
  })
  return { manifest, checkpoint, replayed: false }
}

export function abortWorldDocument(input: {
  manifest: NovelXWorld.WorldMaterialization
  blueprint: NovelXWorld.BlueprintManifest
  entityId: string
  ownerSessionId: string
  taskSessionId?: string
  now: number
  errorCode?: string
}) {
  const current = verifyWorldMaterialization(input)
  const located = requireEntity(current, input.blueprint, input.entityId)
  assertStageEditor(requireStageRecord(current, located.stage.id), input.ownerSessionId)
  const record = requireDocument(current, input.entityId)
  if (record.status === "committed") return current
  const withDocument = updateDocument(
    current,
    {
      ...record,
      status: "waiting_user",
      lease: null,
      taskSessionId: input.taskSessionId ?? record.taskSessionId,
      errorCode: input.errorCode ?? "NOVELX_WORLD_DOCUMENT_STOPPED_BY_USER",
      updatedAt: input.now,
    },
    input.now,
    "waiting_user",
  )
  const stage = requireStageRecord(withDocument, located.stage.id)
  return updateStage(withDocument, { ...stage, status: "waiting_user" }, input.now, "waiting_user")
}

export function finishWorld(input: {
  manifest: NovelXWorld.WorldMaterialization
  blueprint: NovelXWorld.BlueprintManifest
  ownerSessionId: string
  now: number
}) {
  const current = verifyWorldMaterialization(input)
  assertEditor(current, input.ownerSessionId)
  const incompleteStages = current.stages.filter((stage) => stage.status !== "completed")
  const incompleteDocuments = current.documents.filter((document) => document.status !== "committed")
  const checkpointed = new Set(current.memoryCheckpoints.map((checkpoint) => checkpoint.stageId))
  const uncheckpointedStages = current.stages.filter((stage) => !checkpointed.has(stage.stageId))
  if (incompleteStages.length || incompleteDocuments.length || uncheckpointedStages.length || !current.documents.length) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_INCOMPLETE",
      `${incompleteStages.length} world stages, ${incompleteDocuments.length} documents, and ${uncheckpointedStages.length} memory checkpoints are incomplete.`,
    )
  }
  return withIntegrity({ ...withoutIntegrity(current), status: "completed" as const, updatedAt: input.now })
}

export function normalizeWorldDraft(name: string, sections: readonly string[], value: string) {
  const normalized = value.replaceAll("\r\n", "\n").trim() + "\n"
  if (normalized.length < 600 || normalized.length > 12_000) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_DRAFT_LENGTH_INVALID",
      "World dossier must contain 600 to 12000 characters of concrete content.",
    )
  }
  if (!normalized.startsWith(`# ${name}\n`)) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_DRAFT_TITLE_INVALID",
      `World dossier must start with '# ${name}'.`,
    )
  }
  const missing = sections.filter((section) => !normalized.includes(`\n## ${section}\n`))
  if (missing.length) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_DRAFT_SECTION_MISSING",
      `World dossier is missing required sections: ${missing.join(", ")}.`,
    )
  }
  if (/(?:待填充|待补充|TODO|TBD|作为AI|无法确定)/iu.test(normalized)) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_DRAFT_PLACEHOLDER",
      "World dossier contains placeholder or model-disclaimer text.",
    )
  }
  return normalized
}

function normalizeStageRegistration(
  profile: NovelXWorld.StageRegistrationProfile,
  stage: NovelXWorld.BlueprintStage,
  current: NovelXWorld.WorldMaterialization,
): NovelXWorld.StageRegistrationProfile {
  if (profile.stageId !== stage.id) {
    throw new WorldMaterializationError("NOVELX_WORLD_STAGE_UNKNOWN", "Stage registration targets the wrong stage.")
  }
  if (profile.entities.length !== stage.itemCount) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_ENTITY_COUNT_INVALID",
      `Stage ${stage.label} requires exactly ${stage.itemCount} entities.`,
    )
  }
  const allowedDependencies = new Map(
    current.stages
      .filter((record) => stage.dependsOnStageIds.includes(record.stageId) && record.status === "completed")
      .flatMap((record) => record.entities.map((entity) => [entity.id, entity.stageId])),
  )
  const stageRecord = requireStageRecord(current, stage.id)
  const readSources = new Map(stageRecord.sourceReads.map((read) => [read.entityId, read.sourceSha256]))
  const entities = profile.entities.map((entity, index) => ({
    name: entityName(entity.name, `entities[${index}].name`),
    typeLabel: text(entity.typeLabel, `entities[${index}].typeLabel`),
    summary: detail(entity.summary, `entities[${index}].summary`),
    facts: entity.facts.map((fact, factIndex) => ({
      label: text(fact.label, `entities[${index}].facts[${factIndex}].label`),
      detail: detail(fact.detail, `entities[${index}].facts[${factIndex}].detail`),
    })),
    constraints: entity.constraints.map((constraint, constraintIndex) =>
      detail(constraint, `entities[${index}].constraints[${constraintIndex}]`),
    ),
    upstreamBindings: entity.upstreamBindings.map((binding, bindingIndex) => ({
      entityId: binding.entityId,
      relation: text(binding.relation, `entities[${index}].upstreamBindings[${bindingIndex}].relation`),
      impact: detail(binding.impact, `entities[${index}].upstreamBindings[${bindingIndex}].impact`),
      constraints: binding.constraints.map((constraint, constraintIndex) =>
        detail(
          constraint,
          `entities[${index}].upstreamBindings[${bindingIndex}].constraints[${constraintIndex}]`,
        ),
      ),
    })),
  }))
  unique(
    entities.map((entity) => entity.name),
    "world entity name",
  )
  entities.forEach((entity, index) => {
    unique(
      entity.facts.map((fact) => fact.label),
      `fact label in entity ${index + 1}`,
    )
    unique(
      entity.upstreamBindings.map((binding) => binding.entityId),
      `dependency entity in entity ${index + 1}`,
    )
    if (entity.upstreamBindings.some((binding) => !allowedDependencies.has(binding.entityId))) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_ENTITY_DEPENDENCY_INVALID",
        `Entity ${entity.name} references an unknown or uncommitted dependency.`,
      )
    }
    if (
      entity.upstreamBindings.some(
        (binding) => readSources.get(binding.entityId) !== requireDocument(current, binding.entityId).committedSha256,
      )
    ) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_SOURCE_NOT_READ",
        `Entity ${entity.name} references an upstream source the bound stage editor did not read exactly.`,
      )
    }
  })
  for (const dependencyStageId of stage.dependsOnStageIds) {
    if (
      !entities.some((entity) =>
        entity.upstreamBindings.some((binding) => allowedDependencies.get(binding.entityId) === dependencyStageId),
      )
    ) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_STAGE_DEPENDENCY_UNUSED",
        `Stage ${stage.label} must use at least one committed entity from each declared dependency stage.`,
      )
    }
  }
  const relations = profile.relations.map((relation, index) => {
    if (
      relation.fromEntityIndex >= entities.length ||
      relation.toEntityIndex >= entities.length ||
      relation.fromEntityIndex === relation.toEntityIndex
    ) {
      throw new WorldMaterializationError(
        "NOVELX_WORLD_ENTITY_RELATION_INVALID",
        `Entity relation ${index + 1} has an invalid endpoint.`,
      )
    }
    return {
      fromEntityIndex: relation.fromEntityIndex,
      toEntityIndex: relation.toEntityIndex,
      label: text(relation.label, `relations[${index}].label`),
      summary: detail(relation.summary, `relations[${index}].summary`),
    }
  })
  unique(
    relations.map((relation) => `${relation.fromEntityIndex}:${relation.toEntityIndex}:${relation.label}`),
    "entity relation",
  )
  return { stageId: profile.stageId, contextSha256: profile.contextSha256, entities, relations }
}

function worldDocumentContext(
  current: NovelXWorld.WorldMaterialization,
  blueprint: NovelXWorld.BlueprintManifest,
  stage: NovelXWorld.BlueprintStage,
  entity: NovelXWorld.RegisteredEntity,
  committedDocuments: Record<string, string>,
) {
  const entities = new Map(current.stages.flatMap((record) => record.entities.map((item) => [item.id, item])))
  const stageRecord = requireStageRecord(current, stage.id)
  return {
    world: {
      title: blueprint.profile.title,
      genre: blueprint.profile.genre,
      designSummary: blueprint.profile.designSummary,
    },
    stage,
    entity,
    relations: stageRecord.relations.flatMap((relation) => {
      if (relation.fromEntityId !== entity.id && relation.toEntityId !== entity.id) return []
      const other = entities.get(relation.fromEntityId === entity.id ? relation.toEntityId : relation.fromEntityId)
      return other ? [{ relation, other }] : []
    }),
    dependencies: entity.upstreamBindings.map((binding) => ({
      binding,
      entity: entities.get(binding.entityId)!,
      dossier: requireCommittedDocument(current, binding.entityId, committedDocuments),
    })),
  }
}

function stageMatchesProfile(stage: NovelXWorld.WorldStageRecord, profile: NovelXWorld.StageRegistrationProfile) {
  const entities = stage.entities.map((entity) => ({
    name: entity.name,
    typeLabel: entity.typeLabel,
    summary: entity.summary,
    facts: entity.facts,
    constraints: entity.constraints,
    upstreamBindings: entity.upstreamBindings.map(({ sourceSha256: _, ...binding }) => binding),
  }))
  const indices = new Map(stage.entities.map((entity, index) => [entity.id, index]))
  const relations = stage.relations.map((relation) => ({
    fromEntityIndex: indices.get(relation.fromEntityId),
    toEntityIndex: indices.get(relation.toEntityId),
    label: relation.label,
    summary: relation.summary,
  }))
  return (
    worldSha256({ entities, relations }) === worldSha256({ entities: profile.entities, relations: profile.relations })
  )
}

function requireCommittedDocument(
  current: NovelXWorld.WorldMaterialization,
  entityId: string,
  committedDocuments: Record<string, string>,
) {
  const record = requireDocument(current, entityId)
  const dossier = committedDocuments[entityId]
  if (record.status !== "committed" || !dossier || worldSha256(dossier) !== record.committedSha256) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_COMMITTED_DOCUMENT_REQUIRED",
      `Committed dossier for ${entityId} is missing or stale.`,
    )
  }
  return dossier
}

function requireBlueprintStage(blueprint: NovelXWorld.BlueprintManifest, stageId: string) {
  const stage = verifyWorldBlueprint(blueprint).stages.find((item) => item.id === stageId)
  if (!stage) throw new WorldMaterializationError("NOVELX_WORLD_STAGE_UNKNOWN", "Unknown world blueprint stage.")
  return stage
}

function requireStageRecord(current: NovelXWorld.WorldMaterialization, stageId: string) {
  const stage = current.stages.find((item) => item.stageId === stageId)
  if (!stage) throw new WorldMaterializationError("NOVELX_WORLD_STAGE_UNKNOWN", "Unknown world stage record.")
  return stage
}

function requireEntity(
  current: NovelXWorld.WorldMaterialization,
  blueprint: NovelXWorld.BlueprintManifest,
  entityId: string,
) {
  for (const record of current.stages) {
    const entity = record.entities.find((item) => item.id === entityId)
    if (entity) return { entity, stage: requireBlueprintStage(blueprint, record.stageId) }
  }
  throw new WorldMaterializationError("NOVELX_WORLD_ENTITY_UNKNOWN", "Unknown registered world entity.")
}

function requireDocument(current: NovelXWorld.WorldMaterialization, entityId: string) {
  const document = current.documents.find((item) => item.entityId === entityId)
  if (!document) throw new WorldMaterializationError("NOVELX_WORLD_DOCUMENT_UNKNOWN", "Unknown world document.")
  return document
}

function assertEditor(current: NovelXWorld.WorldMaterialization, ownerSessionId: string) {
  if (current.growthSessionId !== ownerSessionId) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_EDITOR_SESSION_INVALID",
      "Only the Growth editor session that owns this run may mutate the world.",
    )
  }
}

function assertStageEditor(stage: NovelXWorld.WorldStageRecord, ownerSessionId: string) {
  if (!stage.editorSessionId || stage.editorSessionId !== ownerSessionId) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_STAGE_EDITOR_SESSION_INVALID",
      "Only the stage editor session bound to this stage may mutate its registrations or dossiers.",
    )
  }
}

function updateStage(
  current: NovelXWorld.WorldMaterialization,
  stage: NovelXWorld.WorldStageRecord,
  now: number,
  status: "running" | "waiting_user" | "completed" | "failed" = "running",
) {
  return withIntegrity({
    ...withoutIntegrity(current),
    status,
    updatedAt: now,
    stages: current.stages.map((item) => (item.stageId === stage.stageId ? stage : item)),
  })
}

function updateDocument(
  current: NovelXWorld.WorldMaterialization,
  document: NovelXWorld.WorldDocumentRecord,
  now: number,
  status: "running" | "waiting_user" | "completed" | "failed" = "running",
) {
  return withIntegrity({
    ...withoutIntegrity(current),
    status,
    updatedAt: now,
    documents: current.documents.map((item) => (item.entityId === document.entityId ? document : item)),
  })
}

function withoutIntegrity(current: NovelXWorld.WorldMaterialization) {
  const { integritySha256: _, ...draft } = current
  return draft
}

function withIntegrity<T extends Omit<NovelXWorld.WorldMaterialization, "integritySha256">>(draft: T) {
  return { ...draft, integritySha256: worldSha256(draft) }
}

function worldTargetPath(stage: NovelXWorld.BlueprintStage, entityNameValue: string) {
  const value = `World/${String(stage.ordinal).padStart(2, "0")}-${safeSegment(stage.label)}/${safeSegment(entityNameValue)}.md`
  if (!safeRelativePath(value)) {
    throw new WorldMaterializationError("NOVELX_WORLD_TARGET_PATH_INVALID", `Unsafe world document path: ${value}`)
  }
  return value
}

function safeRelativePath(value: string) {
  return !value.startsWith("/") && !value.includes("..") && !/[<>:"|?*\u0000-\u001f]/u.test(value)
}

function safeSegment(value: string) {
  const normalized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-")
    .replace(/[. ]+$/u, "")
    .trim()
    .slice(0, 80)
  if (!normalized) throw new WorldMaterializationError("NOVELX_WORLD_TARGET_PATH_INVALID", "Empty path segment.")
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(normalized) ? `${normalized}-项目` : normalized
}

function entityName(value: string, field: string) {
  const normalized = text(value, field)
  if (/^(?:实体|组织|国家|种族|地点|星球|条目|对象)[-_ ]*\d+$/iu.test(normalized)) {
    throw new WorldMaterializationError(
      "NOVELX_WORLD_ENTITY_NAME_PLACEHOLDER",
      `${field} must be a specific name rather than a numbered placeholder.`,
    )
  }
  return normalized
}

function text(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (!normalized || normalized.length > 120 || /(?:待命名|未命名|待填充|TODO|TBD)/iu.test(normalized)) {
    throw new WorldMaterializationError("NOVELX_WORLD_TEXT_INVALID", `${field} must contain a concrete label.`)
  }
  return normalized
}

function detail(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (normalized.length < 8 || normalized.length > 1200 || /(?:待填充|待补充|TODO|TBD)/iu.test(normalized)) {
    throw new WorldMaterializationError("NOVELX_WORLD_DETAIL_INVALID", `${field} must contain concrete content.`)
  }
  return normalized
}

function unique(values: string[], kind: string) {
  const keys = values.map((value) => value.toLocaleLowerCase("zh-CN"))
  if (new Set(keys).size !== keys.length) {
    throw new WorldMaterializationError("NOVELX_WORLD_VALUE_DUPLICATE", `Duplicate ${kind} values are not allowed.`)
  }
}

function stableId(...parts: Array<string | number>) {
  return `nx-${worldSha256(parts).slice(0, 24)}`
}
