export * as NovelXStudy from "./novelx-study"

import { Schema } from "effect"

const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160))
const Detail = Schema.String.check(Schema.isMinLength(4), Schema.isMaxLength(4_000))
const Timestamp = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const SourceKind = Schema.Literals(["text", "document", "image", "audio", "video", "archive", "unknown"])
export type SourceKind = Schema.Schema.Type<typeof SourceKind>

export const SourceRole = Schema.Literals(["story", "character", "world", "reference", "visual", "unclassified"])
export type SourceRole = Schema.Schema.Type<typeof SourceRole>

export const SourceRecord = Schema.Struct({
  id: Schema.String,
  relativePath: Schema.String,
  kind: SourceKind,
  roleHint: SourceRole,
  byteSize: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  contentSha256: Schema.NullOr(Sha256),
  adapterStatus: Schema.Literals(["ready", "adapter_required", "failed"]),
})
export interface SourceRecord extends Schema.Schema.Type<typeof SourceRecord> {}

export const Evidence = Schema.Struct({
  sourceId: Schema.String,
  segmentId: Schema.String,
  detail: Detail,
})
export interface Evidence extends Schema.Schema.Type<typeof Evidence> {}

export const ExtractedEntity = Schema.Struct({
  key: Schema.String,
  kind: Schema.Literals(["world", "character", "story_index", "reference"]),
  group: Label,
  title: Label,
  aliases: Schema.Array(Label).check(Schema.isMaxLength(16)),
  summary: Detail,
  evidence: Schema.Array(Evidence).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
})
export interface ExtractedEntity extends Schema.Schema.Type<typeof ExtractedEntity> {}

export const ExtractedRelation = Schema.Struct({
  fromEntityKey: Schema.String,
  toEntityKey: Schema.String,
  type: Label,
  detail: Detail,
  evidence: Schema.Array(Evidence).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
})
export interface ExtractedRelation extends Schema.Schema.Type<typeof ExtractedRelation> {}

export const ExtractedGap = Schema.Struct({
  entityKey: Schema.String,
  field: Label,
  question: Detail,
})
export interface ExtractedGap extends Schema.Schema.Type<typeof ExtractedGap> {}

export const VisualCandidate = Schema.Struct({
  entityKey: Schema.String,
  type: Schema.Literals(["map", "scenery", "portrait", "cover"]),
  priority: Schema.Literals(["required", "important", "optional"]),
  reason: Detail,
})
export interface VisualCandidate extends Schema.Schema.Type<typeof VisualCandidate> {}

export const SegmentExtraction = Schema.Struct({
  entities: Schema.Array(ExtractedEntity).check(Schema.isMaxLength(256)),
  relations: Schema.Array(ExtractedRelation).check(Schema.isMaxLength(512)),
  gaps: Schema.Array(ExtractedGap).check(Schema.isMaxLength(512)),
  visualCandidates: Schema.Array(VisualCandidate).check(Schema.isMaxLength(256)),
})
export interface SegmentExtraction extends Schema.Schema.Type<typeof SegmentExtraction> {}

export const SegmentRecord = Schema.Struct({
  id: Schema.String,
  sourceId: Schema.String,
  ordinal: Schema.Int.check(Schema.isGreaterThan(0)),
  startOffset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  endOffset: Schema.Int.check(Schema.isGreaterThan(0)),
  estimatedSourceTokens: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(80_000)),
  contentSha256: Sha256,
  status: Schema.Literals(["planned", "reading", "extracted", "failed"]),
  workerSessionId: Schema.NullOr(Schema.String),
  readOffset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  extraction: Schema.NullOr(SegmentExtraction),
  extractionSha256: Schema.NullOr(Sha256),
  errorCode: Schema.NullOr(Schema.String),
  updatedAt: Timestamp,
})
export interface SegmentRecord extends Schema.Schema.Type<typeof SegmentRecord> {}

export const DocumentProposal = Schema.Struct({
  entityKey: Schema.String,
  kind: Schema.Literals(["world", "character", "story_index", "reference"]),
  group: Label,
  title: Label,
  aliases: Schema.Array(Label).check(Schema.isMaxLength(24)),
  summary: Detail,
  evidence: Schema.Array(Evidence).check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  sections: Schema.Array(Label).check(Schema.isMinLength(1), Schema.isMaxLength(24)),
})
export interface DocumentProposal extends Schema.Schema.Type<typeof DocumentProposal> {}

export const GapResolution = Schema.Struct({
  field: Label,
  origin: Schema.Literals(["local", "web", "inferred", "generated", "unknown"]),
  detail: Detail,
  sourceUrl: Schema.optional(Schema.String),
})
export interface GapResolution extends Schema.Schema.Type<typeof GapResolution> {}

export const DocumentRecord = Schema.Struct({
  id: Schema.String,
  entityKey: Schema.String,
  kind: Schema.Literals(["world", "character", "story_index", "reference"]),
  group: Label,
  title: Label,
  aliases: Schema.Array(Label),
  summary: Detail,
  evidence: Schema.Array(Evidence).check(Schema.isMinLength(1)),
  sections: Schema.Array(Label).check(Schema.isMinLength(1)),
  targetPath: Schema.String,
  status: Schema.Literals(["registered", "committed", "failed"]),
  committedSha256: Schema.NullOr(Sha256),
  gapResolutions: Schema.Array(GapResolution),
  updatedAt: Timestamp,
  errorCode: Schema.NullOr(Schema.String),
})
export interface DocumentRecord extends Schema.Schema.Type<typeof DocumentRecord> {}

export const VisualRecord = Schema.Struct({
  id: Schema.String,
  entityKey: Schema.String,
  documentId: Schema.NullOr(Schema.String),
  type: Schema.Literals(["map", "scenery", "portrait", "cover"]),
  priority: Schema.Literals(["required", "important", "optional"]),
  reason: Detail,
  status: Schema.Literals(["pending", "queued", "generating", "attached", "failed"]),
  assetPath: Schema.NullOr(Schema.String),
  sourceUrl: Schema.NullOr(Schema.String),
  errorCode: Schema.NullOr(Schema.String),
})
export interface VisualRecord extends Schema.Schema.Type<typeof VisualRecord> {}

export const Materialization = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  stage: Schema.Literal("study_materialization"),
  status: Schema.Literals(["extracting", "integrating", "enriching", "text_completed", "failed"]),
  studySessionId: Schema.String,
  integratorSessionId: Schema.NullOr(Schema.String),
  sourceBudgetTokens: Schema.Literal(80_000),
  sources: Schema.Array(SourceRecord).check(Schema.isMinLength(1)),
  segments: Schema.Array(SegmentRecord),
  documents: Schema.Array(DocumentRecord),
  visuals: Schema.Array(VisualRecord),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  integritySha256: Sha256,
})
export interface Materialization extends Schema.Schema.Type<typeof Materialization> {}

export const MATERIALIZATION_PATH = ".novelx/study/materialization.json"
export const SEGMENT_DIRECTORY = ".novelx/study/segments"
export const EXTRACTION_DIRECTORY = ".novelx/study/extractions"
export const DRAFT_DIRECTORY = ".novelx/study/document-drafts"
