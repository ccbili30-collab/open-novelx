import { createHash } from "node:crypto"
import path from "node:path"
import { NovelXStudy } from "@opencode-ai/schema"

const SOURCE_BUDGET_TOKENS = 80_000
const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".rst", ".adoc", ".csv", ".json", ".yaml", ".yml"])
const DOCUMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".epub", ".mobi", ".ppt", ".pptx", ".xls", ".xlsx"])
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".svg"])
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"])
const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"])
const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z", ".rar", ".tar", ".gz"])

export class StudyMaterializationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`)
  }
}

export function studySha256(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")
}

export function classifyStudySourcePath(relativePath: string): {
  kind: NovelXStudy.SourceKind
  roleHint: NovelXStudy.SourceRole
} {
  const normalized = normalizeRelativePath(relativePath)
  const extension = path.posix.extname(normalized).toLocaleLowerCase()
  const first = normalized.split("/")[0]?.toLocaleLowerCase()
  const kind: NovelXStudy.SourceKind = TEXT_EXTENSIONS.has(extension)
    ? "text"
    : DOCUMENT_EXTENSIONS.has(extension)
      ? "document"
      : IMAGE_EXTENSIONS.has(extension)
        ? "image"
        : AUDIO_EXTENSIONS.has(extension)
          ? "audio"
          : VIDEO_EXTENSIONS.has(extension)
            ? "video"
            : ARCHIVE_EXTENSIONS.has(extension)
              ? "archive"
              : "unknown"
  const roleHint: NovelXStudy.SourceRole =
    first === "stories" || first === "story" || first === "故事"
      ? "story"
      : first === "characters" || first === "character" || first === "角色" || first === "人物"
        ? "character"
        : first === "world" || first === "世界"
          ? "world"
          : first === "wiki" || first === "references" || first === "reference" || first === "资料" || first === "文献"
            ? "reference"
            : kind === "image"
              ? "visual"
              : "unclassified"
  return { kind, roleHint }
}

export function estimateStudySourceTokens(text: string) {
  let ascii = 0
  let nonAsciiBytes = 0
  for (const character of text) {
    if (character.codePointAt(0)! <= 0x7f) ascii += 1
    else nonAsciiBytes += Buffer.byteLength(character, "utf8")
  }
  return Math.max(text.length ? 1 : 0, Math.ceil(ascii / 4) + Math.ceil(nonAsciiBytes / 3))
}

export function segmentStudySource(input: {
  sourceId: string
  text: string
  maxSourceTokens?: number
  now?: number
}): NovelXStudy.SegmentRecord[] {
  const limit = input.maxSourceTokens ?? SOURCE_BUDGET_TOKENS
  if (!Number.isInteger(limit) || limit < 1 || limit > SOURCE_BUDGET_TOKENS) {
    fail("NOVELX_STUDY_SOURCE_BUDGET_INVALID", "Study source window must be between 1 and 80,000 tokens.")
  }
  if (!input.text.length) return []
  const ranges: Array<{ start: number; end: number }> = []
  let cursor = 0
  while (cursor < input.text.length) {
    const hardEnd = largestEndWithinBudget(input.text, cursor, limit)
    if (hardEnd <= cursor) fail("NOVELX_STUDY_SEGMENT_EMPTY", "Study could not create a non-empty source window.")
    const end = hardEnd < input.text.length ? semanticBoundary(input.text, cursor, hardEnd) : hardEnd
    ranges.push({ start: cursor, end })
    cursor = end
  }
  const now = input.now ?? 0
  return ranges.map((range, index) => {
    const content = input.text.slice(range.start, range.end)
    return {
      id: stableId("study-segment", input.sourceId, index, range.start, range.end, studySha256(content)),
      sourceId: input.sourceId,
      ordinal: index + 1,
      startOffset: range.start,
      endOffset: range.end,
      estimatedSourceTokens: estimateStudySourceTokens(content),
      contentSha256: studySha256(content),
      status: "planned" as const,
      workerSessionId: null,
      readOffset: range.start,
      extraction: null,
      extractionSha256: null,
      errorCode: null,
      updatedAt: now,
    }
  })
}

export function createStudyMaterialization(input: {
  studySessionId: string
  sources: NovelXStudy.SourceRecord[]
  segments: NovelXStudy.SegmentRecord[]
  now: number
}): NovelXStudy.Materialization {
  if (!input.sources.length) fail("NOVELX_STUDY_SOURCE_REQUIRED", "Study requires at least one project source.")
  unique(input.sources.map((source) => source.id), "Study source ID")
  unique(input.sources.map((source) => normalizeKey(source.relativePath)), "Study source path")
  const sourceIds = new Set(input.sources.map((source) => source.id))
  for (const segment of input.segments) {
    if (!sourceIds.has(segment.sourceId)) fail("NOVELX_STUDY_SEGMENT_SOURCE_UNKNOWN", "Study segment cites an unknown source.")
    if (segment.estimatedSourceTokens > SOURCE_BUDGET_TOKENS || segment.startOffset >= segment.endOffset) {
      fail("NOVELX_STUDY_SEGMENT_INVALID", "Study segment exceeds its source window or has invalid offsets.")
    }
  }
  unique(input.segments.map((segment) => segment.id), "Study segment ID")
  return withIntegrity({
    schemaVersion: 1 as const,
    stage: "study_materialization" as const,
    status: "extracting" as const,
    studySessionId: input.studySessionId,
    integratorSessionId: null,
    sourceBudgetTokens: SOURCE_BUDGET_TOKENS as 80_000,
    sources: input.sources,
    segments: input.segments,
    documents: [],
    visuals: [],
    createdAt: input.now,
    updatedAt: input.now,
  })
}

export function commitStudySegmentExtraction(input: {
  manifest: NovelXStudy.Materialization
  segmentId: string
  workerSessionId: string
  extraction: NovelXStudy.SegmentExtraction
  now: number
}) {
  const current = verifyStudyMaterialization(input.manifest)
  if (current.status !== "extracting") fail("NOVELX_STUDY_EXTRACTION_CLOSED", "Study is no longer accepting segment extraction.")
  const segment = current.segments.find((item) => item.id === input.segmentId)
  if (!segment) fail("NOVELX_STUDY_SEGMENT_UNKNOWN", "Study extraction cites an unknown segment.")
  if (segment.status === "extracted") {
    if (segment.workerSessionId === input.workerSessionId && segment.extractionSha256 === studySha256(input.extraction)) return current
    fail("NOVELX_STUDY_SEGMENT_ALREADY_EXTRACTED", "Study segment was already extracted by another result.")
  }
  if (segment.status !== "reading" || segment.workerSessionId !== input.workerSessionId) {
    fail("NOVELX_STUDY_SEGMENT_WORKER_REQUIRED", "Study segment must be prepared by its bound worker before extraction.")
  }
  if (segment.readOffset !== segment.endOffset) {
    fail("NOVELX_STUDY_SEGMENT_UNREAD", "Study worker must read its complete source window before extraction.")
  }
  validateExtraction(current, segment, input.extraction)
  const nextSegment: NovelXStudy.SegmentRecord = {
    ...segment,
    status: "extracted",
    workerSessionId: input.workerSessionId,
    extraction: input.extraction,
    extractionSha256: studySha256(input.extraction),
    errorCode: null,
    updatedAt: input.now,
  }
  return updateManifest(current, { segments: current.segments.map((item) => (item.id === segment.id ? nextSegment : item)) }, input.now)
}

export function prepareStudySegment(input: {
  manifest: NovelXStudy.Materialization
  segmentId: string
  workerSessionId: string
  now: number
}) {
  const current = verifyStudyMaterialization(input.manifest)
  const segment = current.segments.find((item) => item.id === input.segmentId)
  if (!segment) fail("NOVELX_STUDY_SEGMENT_UNKNOWN", "Study worker requested an unknown segment.")
  if (segment.status === "extracted") return { manifest: current, segment, replayed: true }
  if (segment.workerSessionId && segment.workerSessionId !== input.workerSessionId) {
    fail("NOVELX_STUDY_SEGMENT_WORKER_CONFLICT", "Study segment is bound to another worker.")
  }
  const next: NovelXStudy.SegmentRecord = {
    ...segment,
    status: "reading",
    workerSessionId: input.workerSessionId,
    updatedAt: input.now,
  }
  return {
    manifest: updateManifest(current, { segments: current.segments.map((item) => (item.id === segment.id ? next : item)) }, input.now),
    segment: next,
    replayed: segment.status === "reading",
  }
}

export function recordStudySegmentRead(input: {
  manifest: NovelXStudy.Materialization
  segmentId: string
  workerSessionId: string
  fromOffset: number
  toOffset: number
  now: number
}) {
  const current = verifyStudyMaterialization(input.manifest)
  const segment = current.segments.find((item) => item.id === input.segmentId)
  if (!segment) fail("NOVELX_STUDY_SEGMENT_UNKNOWN", "Study read cites an unknown segment.")
  if (segment.status !== "reading" || segment.workerSessionId !== input.workerSessionId) {
    fail("NOVELX_STUDY_SEGMENT_WORKER_REQUIRED", "Only the bound Study worker may read this segment.")
  }
  if (input.fromOffset !== segment.readOffset || input.toOffset <= input.fromOffset || input.toOffset > segment.endOffset) {
    fail("NOVELX_STUDY_SEGMENT_READ_NONCONTIGUOUS", "Study segment reads must advance contiguously without gaps.")
  }
  const next = { ...segment, readOffset: input.toOffset, updatedAt: input.now }
  return updateManifest(current, { segments: current.segments.map((item) => (item.id === segment.id ? next : item)) }, input.now)
}

export function sliceStudyReadWindow(input: { text: string; startOffset: number; maxSourceTokens?: number }) {
  const limit = input.maxSourceTokens ?? 12_000
  if (!Number.isInteger(limit) || limit < 1 || limit > 16_000) {
    fail("NOVELX_STUDY_READ_BUDGET_INVALID", "One Study read window must be between 1 and 16,000 source tokens.")
  }
  if (input.startOffset < 0 || input.startOffset >= input.text.length) {
    fail("NOVELX_STUDY_READ_OFFSET_INVALID", "Study read offset is outside the segment payload.")
  }
  const endOffset = largestEndWithinBudget(input.text, input.startOffset, limit)
  const content = input.text.slice(input.startOffset, endOffset)
  return {
    content,
    startOffset: input.startOffset,
    endOffset,
    estimatedSourceTokens: estimateStudySourceTokens(content),
    done: endOffset === input.text.length,
  }
}

export function registerStudyDocuments(input: {
  manifest: NovelXStudy.Materialization
  integratorSessionId: string
  proposals: readonly NovelXStudy.DocumentProposal[]
  now: number
}) {
  const current = verifyStudyMaterialization(input.manifest)
  if (!input.proposals.length) fail("NOVELX_STUDY_DOCUMENT_REQUIRED", "Study integration requires at least one public dossier.")
  const sourcePaths = new Set(current.sources.map((source) => normalizeKey(source.relativePath)))
  const documents = input.proposals.map((proposal) => {
    validateEvidence(current, proposal.evidence)
    const targetPath = studyTargetPath(proposal)
    if (sourcePaths.has(normalizeKey(targetPath))) {
      fail("NOVELX_STUDY_SOURCE_OVERWRITE", `Study may not overwrite source material at ${targetPath}.`)
    }
    return {
      id: stableId("study-document", proposal.kind, proposal.group, proposal.title),
      entityKey: proposal.entityKey,
      kind: proposal.kind,
      group: cleanLabel(proposal.group, "document group"),
      title: cleanLabel(proposal.title, "document title"),
      aliases: uniqueValues(proposal.aliases.map((value) => cleanLabel(value, "document alias"))),
      summary: cleanDetail(proposal.summary, "document summary"),
      evidence: proposal.evidence,
      sections: uniqueValues(proposal.sections.map((value) => cleanLabel(value, "document section"))),
      targetPath,
      status: "registered" as const,
      committedSha256: null,
      gapResolutions: [],
      updatedAt: input.now,
      errorCode: null,
    }
  })
  unique(documents.map((document) => document.id), "Study document ID")
  unique(documents.map((document) => normalizeKey(document.targetPath)), "Study document path")
  unique(documents.map((document) => document.entityKey), "Study integrated entity")
  if (current.segments.some((segment) => segment.status !== "extracted")) {
    fail("NOVELX_STUDY_EXTRACTION_INCOMPLETE", "Every readable Study segment must be extracted before integration.")
  }
  if (current.documents.length) fail("NOVELX_STUDY_DOCUMENTS_ALREADY_REGISTERED", "Study documents were already registered.")
  const documentByEntity = new Map(documents.map((document) => [document.entityKey, document]))
  const visuals = dedupeVisuals(current.segments.flatMap((segment) => segment.extraction?.visualCandidates ?? [])).map((candidate) => ({
    id: stableId("study-visual", candidate.entityKey, candidate.type),
    entityKey: candidate.entityKey,
    documentId: documentByEntity.get(candidate.entityKey)?.id ?? null,
    type: candidate.type,
    priority: candidate.priority,
    reason: candidate.reason,
    status: "pending" as const,
    assetPath: null,
    sourceUrl: null,
    errorCode: null,
  }))
  const manifest = updateManifest(current, { status: "integrating", integratorSessionId: input.integratorSessionId, documents, visuals }, input.now)
  return { manifest, documents, replayed: false }
}

export function studyIntegrationPage(input: {
  manifest: NovelXStudy.Materialization
  offset?: number
  limit?: number
}) {
  const current = verifyStudyMaterialization(input.manifest)
  if (current.segments.some((segment) => segment.status !== "extracted")) {
    fail("NOVELX_STUDY_EXTRACTION_INCOMPLETE", "Every readable Study segment must be extracted first.")
  }
  const offset = input.offset ?? 0
  const limit = input.limit ?? 4
  if (!Number.isInteger(offset) || offset < 0 || offset > current.segments.length) {
    fail("NOVELX_STUDY_INTEGRATION_OFFSET_INVALID", "Integration cursor is outside the extraction list.")
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 8) {
    fail("NOVELX_STUDY_INTEGRATION_LIMIT_INVALID", "Integration page size must be between one and eight segments.")
  }
  const segments = current.segments.slice(offset, offset + limit)
  const next = offset + segments.length
  const done = next >= current.segments.length
  return { segments, offset, nextOffset: done ? null : next, done }
}

export function commitStudyDocument(input: {
  manifest: NovelXStudy.Materialization
  documentId: string
  integratorSessionId: string
  content: string
  resolvedGaps: readonly NovelXStudy.GapResolution[]
  now: number
}) {
  const current = verifyStudyMaterialization(input.manifest)
  if (current.integratorSessionId !== input.integratorSessionId) {
    fail("NOVELX_STUDY_INTEGRATOR_REQUIRED", "Only the bound Study integrator may commit public dossiers.")
  }
  const document = current.documents.find((item) => item.id === input.documentId)
  if (!document) fail("NOVELX_STUDY_DOCUMENT_UNKNOWN", "Study commit cites an unknown public dossier.")
  if (document.status === "committed") {
    if (document.committedSha256 === studySha256(input.content)) return current
    fail("NOVELX_STUDY_DOCUMENT_ALREADY_COMMITTED", "Study dossier already has different committed content.")
  }
  const title = input.content.match(/^#\s+(.+)$/mu)?.[1]?.trim()
  if (title !== document.title) fail("NOVELX_STUDY_DOCUMENT_TITLE_INVALID", "Study dossier title does not match its registration.")
  for (const section of document.sections) {
    if (!input.content.includes(`## ${section}`)) fail("NOVELX_STUDY_DOCUMENT_SECTION_MISSING", `Study dossier is missing section ${section}.`)
  }
  const requiredGaps = gapFields(current, document.entityKey)
  unique(input.resolvedGaps.map((gap) => gap.field), "Study gap resolution")
  if (requiredGaps.some((field) => !input.resolvedGaps.some((gap) => gap.field === field))) {
    fail("NOVELX_STUDY_GAP_UNRESOLVED", "Every registered Study gap must be resolved or marked unknown.")
  }
  const nextDocument: NovelXStudy.DocumentRecord = {
    ...document,
    status: "committed",
    committedSha256: studySha256(input.content),
    gapResolutions: [...input.resolvedGaps],
    updatedAt: input.now,
    errorCode: null,
  }
  return updateManifest(current, { documents: current.documents.map((item) => (item.id === document.id ? nextDocument : item)) }, input.now)
}

export function finishStudyText(input: { manifest: NovelXStudy.Materialization; studySessionId: string; now: number }) {
  const current = verifyStudyMaterialization(input.manifest)
  if (current.studySessionId !== input.studySessionId) fail("NOVELX_STUDY_SESSION_INVALID", "Only the owning Study session may finish the text route.")
  if (current.segments.some((segment) => segment.status !== "extracted")) {
    fail("NOVELX_STUDY_EXTRACTION_INCOMPLETE", "Study cannot finish before every readable segment is extracted.")
  }
  if (!current.documents.length || current.documents.some((document) => document.status !== "committed")) {
    fail("NOVELX_STUDY_DOCUMENT_INCOMPLETE", "Study cannot finish before every canonical dossier is committed.")
  }
  return updateManifest(current, { status: "text_completed" }, input.now)
}

export function verifyStudyMaterialization(manifest: NovelXStudy.Materialization) {
  const { integritySha256, ...draft } = manifest
  if (studySha256(draft) !== integritySha256) fail("NOVELX_STUDY_INTEGRITY_INVALID", "Study materialization integrity check failed.")
  if (manifest.sourceBudgetTokens !== SOURCE_BUDGET_TOKENS) fail("NOVELX_STUDY_SOURCE_BUDGET_INVALID", "Study source budget must remain 80,000 tokens.")
  unique(manifest.sources.map((source) => source.id), "Study source ID")
  unique(manifest.sources.map((source) => normalizeKey(source.relativePath)), "Study source path")
  unique(manifest.segments.map((segment) => segment.id), "Study segment ID")
  const sourceIds = new Set(manifest.sources.map((source) => source.id))
  for (const segment of manifest.segments) {
    if (!sourceIds.has(segment.sourceId) || segment.startOffset >= segment.endOffset) fail("NOVELX_STUDY_SEGMENT_INVALID", "Study segment has invalid source or offsets.")
    if (segment.readOffset < segment.startOffset || segment.readOffset > segment.endOffset) fail("NOVELX_STUDY_SEGMENT_READ_INVALID", "Study segment read cursor is outside its source window.")
    if (segment.status === "extracted" && (!segment.extraction || !segment.extractionSha256 || !segment.workerSessionId)) {
      fail("NOVELX_STUDY_EXTRACTION_INVALID", "Extracted Study segment has no sealed extraction.")
    }
    if (segment.extraction && studySha256(segment.extraction) !== segment.extractionSha256) {
      fail("NOVELX_STUDY_EXTRACTION_INTEGRITY_INVALID", "Study segment extraction integrity check failed.")
    }
  }
  unique(manifest.documents.map((document) => document.id), "Study document ID")
  unique(manifest.documents.map((document) => normalizeKey(document.targetPath)), "Study document path")
  unique(manifest.visuals.map((visual) => visual.id), "Study visual ID")
  if (manifest.status === "text_completed" && manifest.documents.some((document) => document.status !== "committed")) {
    fail("NOVELX_STUDY_TEXT_COMPLETION_INVALID", "Completed Study text contains unfinished dossiers.")
  }
  return manifest
}

export function studyTargetPath(proposal: Pick<NovelXStudy.DocumentProposal, "kind" | "group" | "title">) {
  const title = safeSegment(cleanLabel(proposal.title, "document title"))
  const group = safeSegment(cleanLabel(proposal.group, "document group"))
  if (proposal.kind === "character") return `Characters/${title}.md`
  if (proposal.kind === "world") return `World/${group}/${title}.md`
  if (proposal.kind === "story_index") return `Stories/作品档案/${title}.md`
  return `Stories/文献/${group}/${title}.md`
}

function largestEndWithinBudget(text: string, start: number, limit: number) {
  let low = start + 1
  let high = text.length
  let best = start
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (estimateStudySourceTokens(text.slice(start, middle)) <= limit) {
      best = middle
      low = middle + 1
    } else high = middle - 1
  }
  return best
}

function semanticBoundary(text: string, start: number, hardEnd: number) {
  const minimum = start + Math.floor((hardEnd - start) * 0.7)
  const candidates = ["\n\n", "\n#", "。\n", "！\n", "？\n"]
  let best = -1
  for (const separator of candidates) {
    const index = text.lastIndexOf(separator, hardEnd)
    if (index >= minimum) best = Math.max(best, index + separator.length)
  }
  return best > start ? best : hardEnd
}

function validateExtraction(manifest: NovelXStudy.Materialization, segment: NovelXStudy.SegmentRecord, extraction: NovelXStudy.SegmentExtraction) {
  unique(extraction.entities.map((entity) => entity.key), "Study segment entity")
  const entityKeys = new Set(extraction.entities.map((entity) => entity.key))
  for (const entity of extraction.entities) validateEvidence(manifest, entity.evidence, segment.id)
  for (const relation of extraction.relations) {
    if (!entityKeys.has(relation.fromEntityKey) || !entityKeys.has(relation.toEntityKey)) fail("NOVELX_STUDY_RELATION_ENTITY_UNKNOWN", "Study relation must cite entities extracted from its segment.")
    validateEvidence(manifest, relation.evidence, segment.id)
  }
  for (const gap of extraction.gaps) if (!entityKeys.has(gap.entityKey)) fail("NOVELX_STUDY_GAP_ENTITY_UNKNOWN", "Study gap cites an unknown entity.")
  for (const visual of extraction.visualCandidates) if (!entityKeys.has(visual.entityKey)) fail("NOVELX_STUDY_VISUAL_ENTITY_UNKNOWN", "Study visual cites an unknown entity.")
}

function validateEvidence(manifest: NovelXStudy.Materialization, evidence: readonly NovelXStudy.Evidence[], exactSegmentId?: string) {
  const sources = new Set(manifest.sources.map((source) => source.id))
  const segments = new Map(manifest.segments.map((segment) => [segment.id, segment]))
  for (const item of evidence) {
    const segment = segments.get(item.segmentId)
    if (!sources.has(item.sourceId) || !segment || segment.sourceId !== item.sourceId) fail("NOVELX_STUDY_EVIDENCE_INVALID", "Study evidence does not match a registered source segment.")
    if (exactSegmentId && item.segmentId !== exactSegmentId) fail("NOVELX_STUDY_EVIDENCE_OUT_OF_SCOPE", "Study worker cited evidence outside its assigned source segment.")
  }
}

function gapFields(manifest: NovelXStudy.Materialization, entityKey: string) {
  return uniqueValues(manifest.segments.flatMap((segment) => (segment.extraction?.gaps ?? []).filter((gap) => gap.entityKey === entityKey).map((gap) => gap.field)))
}

function dedupeVisuals(candidates: readonly NovelXStudy.VisualCandidate[]) {
  const map = new Map<string, NovelXStudy.VisualCandidate>()
  const rank = { required: 3, important: 2, optional: 1 }
  for (const candidate of candidates) {
    const key = `${candidate.entityKey}\0${candidate.type}`
    const previous = map.get(key)
    if (!previous || rank[candidate.priority] > rank[previous.priority]) map.set(key, candidate)
  }
  return [...map.values()]
}

function updateManifest(manifest: NovelXStudy.Materialization, patch: Partial<Omit<NovelXStudy.Materialization, "integritySha256" | "updatedAt">>, now: number) {
  const { integritySha256: _integrity, ...draft } = manifest
  return withIntegrity({ ...draft, ...patch, updatedAt: now })
}

function withIntegrity<T extends object>(draft: T): T & { integritySha256: string } {
  return { ...draft, integritySha256: studySha256(draft) }
}

function stableId(...parts: Array<string | number>) {
  return `nx-study-${studySha256(parts).slice(0, 24)}`
}

function normalizeRelativePath(value: string) {
  return value.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "")
}

function normalizeKey(value: string) {
  return normalizeRelativePath(value).normalize("NFKC").toLocaleLowerCase()
}

function safeSegment(value: string) {
  const result = value.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-").replace(/[. ]+$/gu, "").trim()
  if (!result || result === "." || result === "..") fail("NOVELX_STUDY_PATH_INVALID", "Study target path is unsafe.")
  return result.slice(0, 96)
}

function cleanLabel(value: string, field: string) {
  const result = value.trim().replace(/\s+/gu, " ")
  if (!result || result.length > 160) fail("NOVELX_STUDY_LABEL_INVALID", `${field} is empty or too long.`)
  return result
}

function cleanDetail(value: string, field: string) {
  const result = value.trim()
  if (result.length < 4 || result.length > 4_000) fail("NOVELX_STUDY_DETAIL_INVALID", `${field} is invalid.`)
  return result
}

function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) fail("NOVELX_STUDY_DUPLICATE", `${label} values must be unique.`)
}

function uniqueValues(values: readonly string[]) {
  return [...new Set(values)]
}

function fail(code: string, message: string): never {
  throw new StudyMaterializationError(code, message)
}
