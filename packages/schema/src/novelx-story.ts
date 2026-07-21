export * as NovelXStory from "./novelx-story"

import { Schema } from "effect"

const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))
const Summary = Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(2000))
const Index = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const Timestamp = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const WorldSource = Schema.Struct({
  entityId: Schema.String,
  title: Label,
  path: Schema.String,
  sha256: Sha256,
})
export interface WorldSource extends Schema.Schema.Type<typeof WorldSource> {}

export const HistoryReferenceProfile = Schema.Struct({
  historyBookIndex: Index,
  chapterIndex: Index,
})
export interface HistoryReferenceProfile extends Schema.Schema.Type<typeof HistoryReferenceProfile> {}

export const HistoryChapterProfile = Schema.Struct({
  title: Label,
  brief: Summary,
  sourceEntityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
})
export interface HistoryChapterProfile extends Schema.Schema.Type<typeof HistoryChapterProfile> {}

export const HistoryBookProfile = Schema.Struct({
  title: Label,
  author: Label,
  summary: Summary,
  chapters: Schema.Array(HistoryChapterProfile).check(Schema.isMinLength(3), Schema.isMaxLength(5)),
})
export interface HistoryBookProfile extends Schema.Schema.Type<typeof HistoryBookProfile> {}

export const ReferenceDocumentProfile = Schema.Struct({
  title: Label,
  kindLabel: Label,
  author: Label,
  summary: Summary,
  sourceEntityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  historyReferences: Schema.Array(HistoryReferenceProfile).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
})
export interface ReferenceDocumentProfile extends Schema.Schema.Type<typeof ReferenceDocumentProfile> {}

export const NovelChapterProfile = Schema.Struct({
  title: Label,
  brief: Summary,
  sourceEntityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  historyReferences: Schema.Array(HistoryReferenceProfile).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
  documentIndices: Schema.Array(Index).check(Schema.isMinLength(1), Schema.isMaxLength(5)),
})
export interface NovelChapterProfile extends Schema.Schema.Type<typeof NovelChapterProfile> {}

export const RegistrationProfile = Schema.Struct({
  contextSha256: Sha256,
  historyBooks: Schema.Array(HistoryBookProfile).check(Schema.isMinLength(1), Schema.isMaxLength(4)),
  references: Schema.Array(ReferenceDocumentProfile).check(Schema.isMinLength(2), Schema.isMaxLength(5)),
  novel: Schema.Struct({
    title: Label,
    author: Label,
    summary: Summary,
    theme: Schema.Struct({ title: Label, summary: Summary }),
    chapters: Schema.Array(NovelChapterProfile).check(Schema.isMinLength(6), Schema.isMaxLength(8)),
  }),
})
export interface RegistrationProfile extends Schema.Schema.Type<typeof RegistrationProfile> {}

export const HistoryBook = Schema.Struct({
  id: Schema.String,
  title: Label,
  author: Label,
  summary: Summary,
  ordinal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  chapterIds: Schema.Array(Schema.String).check(Schema.isMinLength(3), Schema.isMaxLength(5)),
})
export interface HistoryBook extends Schema.Schema.Type<typeof HistoryBook> {}

export const ReferenceDocument = Schema.Struct({
  id: Schema.String,
  title: Label,
  kindLabel: Label,
  author: Label,
  summary: Summary,
  ordinal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  documentId: Schema.String,
})
export interface ReferenceDocument extends Schema.Schema.Type<typeof ReferenceDocument> {}

export const NovelWork = Schema.Struct({
  id: Schema.String,
  title: Label,
  author: Label,
  summary: Summary,
  theme: Schema.Struct({ id: Schema.String, title: Label, summary: Summary }),
  chapters: Schema.Array(Schema.String).check(Schema.isMinLength(6), Schema.isMaxLength(8)),
})
export interface NovelWork extends Schema.Schema.Type<typeof NovelWork> {}

export const DocumentKind = Schema.Literals(["history_chapter", "reference_document", "novel_chapter"])
export type DocumentKind = Schema.Schema.Type<typeof DocumentKind>

export const DocumentStatus = Schema.Literals([
  "registered",
  "leased",
  "reviewing",
  "committed",
  "failed",
  "waiting_user",
])
export type DocumentStatus = Schema.Schema.Type<typeof DocumentStatus>

export const DocumentRecord = Schema.Struct({
  id: Schema.String,
  kind: DocumentKind,
  workId: Schema.NullOr(Schema.String),
  title: Label,
  author: Label,
  kindLabel: Label,
  brief: Summary,
  ordinal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  sourceEntityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  sourceSha256s: Schema.Array(Sha256).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  upstreamDocumentIds: Schema.Array(Schema.String).check(Schema.isMaxLength(32)),
  targetPath: Schema.String,
  draftPath: Schema.String,
  status: DocumentStatus,
  lease: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      ownerSessionId: Schema.String,
      ownerMessageId: Schema.String,
      acquiredAt: Timestamp,
    }),
  ),
  taskSessionId: Schema.NullOr(Schema.String),
  committedSha256: Schema.NullOr(Sha256),
  updatedAt: Timestamp,
  errorCode: Schema.NullOr(Schema.String),
})
export interface DocumentRecord extends Schema.Schema.Type<typeof DocumentRecord> {}

export const ProtagonistSource = Schema.Struct({
  id: Schema.String,
  name: Label,
  path: Schema.String,
  sha256: Sha256,
  characterIntegritySha256: Sha256,
})
export interface ProtagonistSource extends Schema.Schema.Type<typeof ProtagonistSource> {}

export const Materialization = Schema.Struct({
  schemaVersion: Schema.Literals([1, 2]),
  stage: Schema.Literal("story_materialization"),
  status: Schema.Literals(["planning", "writing", "text_completed", "failed", "waiting_user"]),
  world: Schema.Struct({
    title: Label,
    materializationIntegritySha256: Sha256,
    sources: Schema.Array(WorldSource).check(Schema.isMinLength(1), Schema.isMaxLength(96)),
  }),
  editorSessionId: Schema.String,
  preparedContextSha256: Sha256,
  sourceReads: Schema.Array(
    Schema.Struct({ entityId: Schema.String, sourceSha256: Sha256, readAt: Timestamp }),
  ),
  protagonist: Schema.optional(ProtagonistSource),
  protagonistRead: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        protagonistId: Schema.String,
        sourceSha256: Sha256,
        readAt: Timestamp,
      }),
    ),
  ),
  registrationSha256: Schema.NullOr(Sha256),
  historyBooks: Schema.Array(HistoryBook).check(Schema.isMaxLength(4)),
  references: Schema.Array(ReferenceDocument).check(Schema.isMaxLength(5)),
  novel: Schema.NullOr(NovelWork),
  documents: Schema.Array(DocumentRecord).check(Schema.isMaxLength(64)),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  integritySha256: Sha256,
})
export interface Materialization extends Schema.Schema.Type<typeof Materialization> {}
export type MaterializationV1 = Materialization & { schemaVersion: 1; protagonist?: never; protagonistRead?: never }
export type MaterializationV2 = Materialization & {
  schemaVersion: 2
  protagonist: ProtagonistSource
  protagonistRead: null | { protagonistId: string; sourceSha256: string; readAt: number }
}

export const MATERIALIZATION_PATH = ".novelx/growth/story-materialization.json"
export const DRAFT_DIRECTORY = ".novelx/growth/story-drafts"
export const STORY_DIRECTORY = "Stories"
