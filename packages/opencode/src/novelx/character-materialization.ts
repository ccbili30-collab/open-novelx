import { NovelXCharacter } from "@opencode-ai/schema/novelx-character"
import { worldSha256 } from "./world-blueprint"

export class CharacterMaterializationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`)
  }
}

export type RegisteredCharacterMaterialization = NovelXCharacter.Materialization & {
  protagonist: NovelXCharacter.Protagonist
  document: NovelXCharacter.DocumentRecord
}

export type CompletedCharacterMaterialization = RegisteredCharacterMaterialization & {
  status: "text_completed"
  document: NovelXCharacter.DocumentRecord & { status: "committed"; committedSha256: string }
}

export function createCharacterMaterialization(input: {
  world: {
    title: string
    materializationIntegritySha256: string
    sources: readonly NovelXCharacter.WorldSource[]
  }
  editorSessionId: string
  now: number
}): NovelXCharacter.Materialization {
  if (!input.world.sources.length) fail("NOVELX_CHARACTER_WORLD_EMPTY", "The frozen world has no readable sources.")
  unique(input.world.sources.map((source) => source.entityId), "world source ID")
  unique(input.world.sources.map((source) => source.path), "world source path")
  const world = {
    title: concreteLabel(input.world.title, "world.title"),
    materializationIntegritySha256: sha256(input.world.materializationIntegritySha256, "world integrity"),
    sources: input.world.sources.map((source) => ({
      entityId: concreteLabel(source.entityId, "world source ID"),
      title: concreteLabel(source.title, "world source title"),
      path: safePath(source.path),
      sha256: sha256(source.sha256, `world source ${source.entityId}`),
    })),
  }
  const preparedContextSha256 = worldSha256({ world })
  return withIntegrity({
    schemaVersion: 1 as const,
    stage: "character_materialization" as const,
    status: "planning" as const,
    world,
    editorSessionId: concreteLabel(input.editorSessionId, "character editor session"),
    preparedContextSha256,
    sourceReads: [],
    registrationSha256: null,
    protagonist: null,
    document: null,
    createdAt: input.now,
    updatedAt: input.now,
  })
}

export function recordCharacterSourceReads(input: {
  manifest: NovelXCharacter.Materialization
  editorSessionId: string
  sourceEntityIds: readonly string[]
  now: number
}) {
  const current = verifyCharacterMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  if (current.status !== "planning") {
    fail("NOVELX_CHARACTER_PLANNING_REQUIRED", "World sources are read only while planning the protagonist.")
  }
  unique([...input.sourceEntityIds], "source read")
  const sources = new Map(current.world.sources.map((source) => [source.entityId, source]))
  const reads = new Map(current.sourceReads.map((read) => [read.entityId, read]))
  for (const entityId of input.sourceEntityIds) {
    const source = sources.get(entityId)
    if (!source) fail("NOVELX_CHARACTER_SOURCE_UNKNOWN", `Unknown frozen world source ${entityId}.`)
    reads.set(entityId, reads.get(entityId) ?? { entityId, sourceSha256: source.sha256, readAt: input.now })
  }
  return withIntegrity({ ...withoutIntegrity(current), sourceReads: [...reads.values()], updatedAt: input.now })
}

export function registerCharacter(input: {
  manifest: NovelXCharacter.Materialization
  editorSessionId: string
  profile: NovelXCharacter.RegistrationProfile
  now: number
}): { manifest: RegisteredCharacterMaterialization; replayed: false } {
  const current = verifyCharacterMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  if (current.status !== "planning") {
    fail("NOVELX_CHARACTER_REGISTRATION_CONFLICT", "The protagonist has already been registered.")
  }
  if (input.profile.contextSha256 !== current.preparedContextSha256) {
    fail("NOVELX_CHARACTER_CONTEXT_STALE", "The protagonist was not planned from the current frozen world context.")
  }
  const forbidden = ["arc", "ending", "completedArc", "finalState"]
  if (forbidden.some((field) => field in (input.profile as unknown as Record<string, unknown>))) {
    fail("NOVELX_CHARACTER_PREMATURE_ARC", "Character registration cannot predetermine a completed arc or ending.")
  }

  const sources = new Map(current.world.sources.map((source) => [source.entityId, source]))
  const reads = new Map(current.sourceReads.map((read) => [read.entityId, read.sourceSha256]))
  for (const source of current.world.sources) {
    if (reads.get(source.entityId) !== source.sha256) {
      fail("NOVELX_CHARACTER_SOURCE_UNREAD", `The character editor did not read ${source.entityId} exactly.`)
    }
  }

  const sourceEntityIds = uniquePreservingOrder([
    ...input.profile.originSourceEntityIds,
    ...input.profile.affiliationSourceEntityIds,
  ])
  if (!sourceEntityIds.length) fail("NOVELX_CHARACTER_SOURCE_REQUIRED", "The protagonist must cite frozen world sources.")
  for (const entityId of sourceEntityIds) {
    if (!sources.has(entityId)) fail("NOVELX_CHARACTER_SOURCE_UNKNOWN", `The protagonist cites unknown source ${entityId}.`)
  }
  unique(input.profile.aliases, "character alias")
  const name = concreteLabel(input.profile.name, "character.name")
  const protagonist: NovelXCharacter.Protagonist = {
    id: stableId("protagonist", current.world.materializationIntegritySha256, name),
    role: "protagonist",
    name,
    aliases: input.profile.aliases.map((value, index) => concreteLabel(value, `aliases[${index}]`)),
    identity: detail(input.profile.identity, "identity"),
    originSourceEntityIds: validateSourceIds(input.profile.originSourceEntityIds, sources, "originSourceEntityIds"),
    affiliationSourceEntityIds: validateSourceIds(
      input.profile.affiliationSourceEntityIds,
      sources,
      "affiliationSourceEntityIds",
    ),
    appearance: detail(input.profile.appearance, "appearance"),
    personalityContradiction: detail(input.profile.personalityContradiction, "personalityContradiction"),
    desire: detail(input.profile.desire, "desire"),
    fear: detail(input.profile.fear, "fear"),
    wound: detail(input.profile.wound, "wound"),
    voice: detail(input.profile.voice, "voice"),
    capabilities: details(input.profile.capabilities, "capabilities", 1, 12),
    limitations: details(input.profile.limitations, "limitations", 1, 12),
    initialRelationships: details(input.profile.initialRelationships, "initialRelationships", 1, 12),
    openingState: detail(input.profile.openingState, "openingState"),
    visualBrief: detail(input.profile.visualBrief, "visualBrief"),
  }
  const documentId = stableId("character-document", protagonist.id)
  const document: NovelXCharacter.DocumentRecord = {
    id: documentId,
    title: name,
    protagonistId: protagonist.id,
    sourceEntityIds,
    sourceSha256s: sourceEntityIds.map((entityId) => sources.get(entityId)!.sha256),
    targetPath: `${NovelXCharacter.CHARACTER_DIRECTORY}/${safeSegment(name)}.md`,
    draftPath: `${NovelXCharacter.DRAFT_DIRECTORY}/${documentId}.md`,
    status: "registered",
    lease: null,
    taskSessionId: null,
    committedSha256: null,
    updatedAt: input.now,
    errorCode: null,
  }
  const manifest = withIntegrity({
    ...withoutIntegrity(current),
    status: "writing" as const,
    registrationSha256: worldSha256(input.profile),
    protagonist,
    document,
    updatedAt: input.now,
  })
  return {
    manifest: verifyCharacterMaterialization(manifest) as RegisteredCharacterMaterialization,
    replayed: false,
  }
}

export function prepareCharacterDocument(input: {
  manifest: NovelXCharacter.Materialization
  editorSessionId: string
  editorMessageId: string
  worldContents: Record<string, string>
  now: number
}) {
  const current = verifyCharacterMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  if (current.status !== "writing" || !current.protagonist || !current.document) {
    fail("NOVELX_CHARACTER_WRITING_REQUIRED", "The protagonist dossier can only be prepared after registration.")
  }
  const worldSources = current.document.sourceEntityIds.map((entityId) => {
    const source = current.world.sources.find((candidate) => candidate.entityId === entityId)!
    const markdown = input.worldContents[entityId]
    if (!markdown || worldSha256(markdown) !== source.sha256) {
      fail("NOVELX_CHARACTER_SOURCE_DRIFT", `Frozen world source ${source.path} is missing or changed.`)
    }
    return { ...source, markdown }
  })
  const context = { world: current.world, protagonist: current.protagonist, document: current.document, worldSources }
  if (current.document.status === "committed") {
    return { manifest: current, record: current.document, context, replayed: true }
  }
  if (current.document.lease && current.document.lease.ownerSessionId !== input.editorSessionId) {
    fail("NOVELX_CHARACTER_DOCUMENT_LEASE_CONFLICT", `${current.document.targetPath} is leased by another editor.`)
  }
  const lease = current.document.lease ?? {
    id: `nx-lease-${worldSha256([
      current.document.id,
      input.editorSessionId,
      input.editorMessageId,
      input.now,
    ]).slice(0, 20)}`,
    ownerSessionId: input.editorSessionId,
    ownerMessageId: input.editorMessageId,
    acquiredAt: input.now,
  }
  const record = {
    ...current.document,
    status: "leased" as const,
    lease,
    updatedAt: input.now,
    errorCode: null,
  }
  return {
    manifest: updateDocument(current, record, input.now),
    record,
    context,
    replayed: Boolean(current.document.lease),
  }
}

export function commitCharacterDocument(input: {
  manifest: NovelXCharacter.Materialization
  editorSessionId: string
  writerSessionId: string
  leaseId: string
  markdown: string
  now: number
}) {
  const current = verifyCharacterMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  if (!current.protagonist || !current.document) {
    fail("NOVELX_CHARACTER_REGISTRATION_INCOMPLETE", "The protagonist document is not registered.")
  }
  const markdown = normalizeCharacterDocument(current.document, input.markdown)
  const hash = worldSha256(markdown)
  if (current.document.status === "committed") {
    if (current.document.committedSha256 !== hash) {
      fail("NOVELX_CHARACTER_DOCUMENT_COMMIT_CONFLICT", `${current.document.targetPath} already has different content.`)
    }
    return { manifest: current, record: current.document, markdown, replayed: true }
  }
  if (
    !current.document.lease ||
    current.document.lease.id !== input.leaseId ||
    current.document.lease.ownerSessionId !== input.editorSessionId
  ) {
    fail("NOVELX_CHARACTER_DOCUMENT_LEASE_REQUIRED", "The exact character editor lease is required before commit.")
  }
  const record = {
    ...current.document,
    status: "committed" as const,
    lease: null,
    taskSessionId: concreteLabel(input.writerSessionId, "character writer session"),
    committedSha256: hash,
    updatedAt: input.now,
    errorCode: null,
  }
  return { manifest: updateDocument(current, record, input.now), record, markdown, replayed: false }
}

export function finishCharacterText(input: {
  manifest: NovelXCharacter.Materialization
  editorSessionId: string
  now: number
}): CompletedCharacterMaterialization {
  const current = verifyCharacterMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  if (
    !current.protagonist ||
    !current.document ||
    current.document.status !== "committed" ||
    !current.document.committedSha256
  ) {
    fail("NOVELX_CHARACTER_TEXT_INCOMPLETE", "The protagonist dossier must be committed before Character Growth completes.")
  }
  return withIntegrity({
    ...withoutIntegrity(current),
    status: "text_completed" as const,
    updatedAt: input.now,
  }) as CompletedCharacterMaterialization
}

export function verifyCharacterMaterialization<T extends NovelXCharacter.Materialization>(manifest: T): T {
  const { integritySha256, ...draft } = manifest
  if (worldSha256(draft) !== integritySha256) {
    fail("NOVELX_CHARACTER_INTEGRITY_INVALID", "Character materialization integrity check failed.")
  }
  unique(manifest.world.sources.map((source) => source.entityId), "world source ID")
  unique(manifest.world.sources.map((source) => source.path), "world source path")
  unique(manifest.sourceReads.map((read) => read.entityId), "source read")
  if (manifest.status === "planning") {
    if (manifest.registrationSha256 || manifest.protagonist || manifest.document) {
      fail("NOVELX_CHARACTER_CONTENT_PREMATURE", "Planning state cannot contain registered character content.")
    }
    return manifest
  }
  if (!manifest.registrationSha256 || !manifest.protagonist || !manifest.document) {
    fail("NOVELX_CHARACTER_REGISTRATION_INCOMPLETE", "Registered Character Growth is missing its protagonist dossier.")
  }
  if (manifest.document.protagonistId !== manifest.protagonist.id) {
    fail("NOVELX_CHARACTER_DOCUMENT_SET_INVALID", "The dossier does not belong to the registered protagonist.")
  }
  if (
    !safeRelativePath(manifest.document.targetPath) ||
    !manifest.document.targetPath.startsWith(`${NovelXCharacter.CHARACTER_DIRECTORY}/`) ||
    manifest.document.draftPath !== `${NovelXCharacter.DRAFT_DIRECTORY}/${manifest.document.id}.md`
  ) {
    fail("NOVELX_CHARACTER_DOCUMENT_SET_INVALID", "The protagonist dossier paths are invalid.")
  }
  if (
    manifest.document.sourceEntityIds.length !== manifest.document.sourceSha256s.length ||
    manifest.document.sourceEntityIds.some(
      (entityId, index) =>
        manifest.world.sources.find((source) => source.entityId === entityId)?.sha256 !==
        manifest.document!.sourceSha256s[index],
    )
  ) {
    fail("NOVELX_CHARACTER_DOCUMENT_SET_INVALID", "The dossier source snapshot is inconsistent.")
  }
  if (manifest.document.status === "committed" && (!manifest.document.committedSha256 || manifest.document.lease)) {
    fail("NOVELX_CHARACTER_DOCUMENT_COMMIT_INVALID", "The committed protagonist dossier is inconsistent.")
  }
  if (manifest.status === "text_completed" && manifest.document.status !== "committed") {
    fail("NOVELX_CHARACTER_TEXT_INCOMPLETE", "Text-completed Character Growth contains an unfinished dossier.")
  }
  return manifest
}

function normalizeCharacterDocument(record: NovelXCharacter.DocumentRecord, value: string) {
  const normalized = normalizeMarkdown(value)
  if (!normalized.startsWith(`# ${record.title}\n`)) {
    fail("NOVELX_CHARACTER_DOCUMENT_TITLE_INVALID", `${record.targetPath} must start with its exact title.`)
  }
  if (normalized.length < 800 || normalized.length > 20_000) {
    fail("NOVELX_CHARACTER_DOCUMENT_LENGTH_INVALID", `${record.targetPath} must contain 800 to 20000 readable characters.`)
  }
  if (
    /(?:阶段主编|执行\s*Agent|sourceSha256|\.novelx\/|注册(?:骨架|实体)|工具调用|上下文包|待填充|待补充|TODO|TBD|作为AI|无法确定)/iu.test(
      normalized,
    )
  ) {
    fail("NOVELX_CHARACTER_DOCUMENT_INTERNAL_LEAK", `${record.targetPath} exposes orchestration or placeholder text.`)
  }
  return normalized
}

function validateSourceIds(
  values: readonly string[],
  sources: ReadonlyMap<string, NovelXCharacter.WorldSource>,
  field: string,
) {
  unique([...values], field)
  for (const entityId of values) {
    if (!sources.has(entityId)) fail("NOVELX_CHARACTER_SOURCE_UNKNOWN", `${field} cites unknown source ${entityId}.`)
  }
  return [...values]
}

function details(values: readonly string[], field: string, minimum: number, maximum: number) {
  if (values.length < minimum || values.length > maximum) {
    fail("NOVELX_CHARACTER_DETAIL_COUNT_INVALID", `${field} requires ${minimum} to ${maximum} entries.`)
  }
  return values.map((value, index) => listDetail(value, `${field}[${index}]`))
}

function listDetail(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (normalized.length < 2 || normalized.length > 2_400 || /(?:待填充|待补充|TODO|TBD)/iu.test(normalized)) {
    fail("NOVELX_CHARACTER_DETAIL_INVALID", `${field} must contain concrete content.`)
  }
  return normalized
}

function updateDocument<T extends NovelXCharacter.Materialization>(
  current: T,
  document: NovelXCharacter.DocumentRecord,
  now: number,
): T {
  return withIntegrity({ ...withoutIntegrity(current), document, updatedAt: now }) as T
}

function withoutIntegrity(current: NovelXCharacter.Materialization) {
  const { integritySha256: _, ...draft } = current
  return draft
}

function withIntegrity<T extends Omit<NovelXCharacter.Materialization, "integritySha256">>(
  draft: T,
): NovelXCharacter.Materialization {
  return { ...draft, integritySha256: worldSha256(draft) }
}

function normalizeMarkdown(value: string) {
  return value.replaceAll("\r\n", "\n").trim() + "\n"
}

function stableId(...parts: Array<string | number>) {
  return `nx-${worldSha256(parts).slice(0, 24)}`
}

function sha256(value: string, field: string) {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    fail("NOVELX_CHARACTER_SHA256_INVALID", `${field} is not a SHA-256 digest.`)
  }
  return value
}

function concreteLabel(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (!normalized || normalized.length > 120 || /(?:待命名|未命名|待填充|TODO|TBD)/iu.test(normalized)) {
    fail("NOVELX_CHARACTER_TEXT_INVALID", `${field} must contain a concrete value.`)
  }
  return normalized
}

function detail(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (normalized.length < 8 || normalized.length > 2_400 || /(?:待填充|待补充|TODO|TBD)/iu.test(normalized)) {
    fail("NOVELX_CHARACTER_DETAIL_INVALID", `${field} must contain concrete content.`)
  }
  return normalized
}

function safePath(value: string) {
  if (!safeRelativePath(value)) fail("NOVELX_CHARACTER_TARGET_PATH_INVALID", `Unsafe project path ${value}.`)
  return value.replaceAll("\\", "/")
}

function safeRelativePath(value: string) {
  const normalized = value.replaceAll("\\", "/")
  return !normalized.startsWith("/") && !normalized.includes("..") && !/[<>:"|?*\u0000-\u001f]/u.test(normalized)
}

function safeSegment(value: string) {
  const normalized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-").replace(/[. ]+$/u, "").trim().slice(0, 80)
  if (!normalized) fail("NOVELX_CHARACTER_TARGET_PATH_INVALID", "A character path segment is empty.")
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(normalized) ? `${normalized}-角色` : normalized
}

function unique(values: readonly string[], field: string) {
  const normalized = values.map((value) => value.toLocaleLowerCase("zh-CN"))
  if (new Set(normalized).size !== normalized.length) {
    fail("NOVELX_CHARACTER_VALUE_DUPLICATE", `Duplicate ${field} values are not allowed.`)
  }
}

function uniquePreservingOrder(values: readonly string[]) {
  return [...new Set(values)]
}

function assertEditor(current: NovelXCharacter.Materialization, editorSessionId: string) {
  if (current.editorSessionId !== editorSessionId) {
    fail("NOVELX_CHARACTER_EDITOR_SESSION_INVALID", "Only the bound Character editor may mutate this run.")
  }
}

function fail(code: string, message: string): never {
  throw new CharacterMaterializationError(code, message)
}
