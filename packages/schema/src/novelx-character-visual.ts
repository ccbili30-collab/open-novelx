export * as NovelXCharacterVisual from "./novelx-character-visual"

import { Schema } from "effect"

const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))
const Detail = Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(2400))
const Timestamp = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const PortraitTaskStatus = Schema.Literals(["queued", "generating", "validating", "attached", "failed"])
export type PortraitTaskStatus = Schema.Schema.Type<typeof PortraitTaskStatus>

export const PortraitTask = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("individual"),
  subtype: Schema.Literal("canonical_portrait"),
  ownerId: Schema.String,
  title: Label,
  aspect: Schema.Literal("portrait"),
  composition: Schema.Struct({
    ratio: Schema.Literal("2:3"),
    faceView: Schema.Literal("three_quarter"),
    crop: Schema.Literal("upper_two_thirds"),
  }),
  status: PortraitTaskStatus,
  prompt: Detail,
  sourceDocumentId: Schema.String,
  sourceDocumentSha256: Sha256,
  sourceEntityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
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
export interface PortraitTask extends Schema.Schema.Type<typeof PortraitTask> {}

export const Manifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  stage: Schema.Literal("character_portrait"),
  status: Schema.Literals(["queued", "generating", "ready", "failed"]),
  characterMaterializationIntegritySha256: Sha256,
  editorSessionId: Schema.String,
  visualLanguage: Detail,
  visualLanguageSha256: Sha256,
  task: PortraitTask,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  integritySha256: Sha256,
})
export interface Manifest extends Schema.Schema.Type<typeof Manifest> {}

export const MANIFEST_PATH = ".novelx/visuals/character-portrait.json"
export const PORTRAIT_DIRECTORY = "Characters/Media/portraits"

