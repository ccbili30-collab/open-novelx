export * as NovelXStoryVisual from "./novelx-story-visual"

import { Schema } from "effect"

const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))
const Summary = Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(2400))
const CoverDirection = Schema.String.check(Schema.isMinLength(4), Schema.isMaxLength(2400))
const Timestamp = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const CoverProfile = Schema.Struct({
  ownerId: Schema.String,
  prompt: CoverDirection,
})
export interface CoverProfile extends Schema.Schema.Type<typeof CoverProfile> {}

export const CoverTaskStatus = Schema.Literals(["queued", "generating", "validating", "attached", "failed"])
export type CoverTaskStatus = Schema.Schema.Type<typeof CoverTaskStatus>

export const CoverTask = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("cover"),
  subtype: Schema.Literals(["novel", "history", "theme"]),
  ownerId: Schema.String,
  title: Label,
  author: Label,
  aspect: Schema.Literals(["portrait", "landscape"]),
  status: CoverTaskStatus,
  prompt: Summary,
  sourceDocumentIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  sourceSha256s: Schema.Array(Sha256).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  targetPath: Schema.String,
  attempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(3)),
  mime: Schema.NullOr(Schema.Literals(["image/png", "image/jpeg", "image/webp"])),
  assetSha256: Schema.NullOr(Sha256),
  model: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Timestamp),
  completedAt: Schema.NullOr(Timestamp),
  errorCode: Schema.NullOr(Schema.String),
})
export interface CoverTask extends Schema.Schema.Type<typeof CoverTask> {}

export const Manifest = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  stage: Schema.Literal("story_covers"),
  status: Schema.Literals(["queued", "generating", "ready", "partial", "failed"]),
  storyMaterializationIntegritySha256: Sha256,
  editorSessionId: Schema.String,
  visualLanguage: Summary,
  visualLanguageSha256: Sha256,
  tasks: Schema.Array(CoverTask).check(Schema.isMinLength(3), Schema.isMaxLength(6)),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  integritySha256: Sha256,
})
export interface Manifest extends Schema.Schema.Type<typeof Manifest> {}

export const MANIFEST_PATH = ".novelx/visuals/story-covers.json"
export const COVER_DIRECTORY = "Stories/Media/covers"
