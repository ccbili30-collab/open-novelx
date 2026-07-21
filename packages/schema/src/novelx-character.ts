export * as NovelXCharacter from "./novelx-character"

import { Schema } from "effect"

const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))
const Detail = Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(2400))
const Trait = Schema.String.check(Schema.isMinLength(2), Schema.isMaxLength(240))
const Timestamp = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const WorldSource = Schema.Struct({
  entityId: Schema.String,
  title: Label,
  path: Schema.String,
  sha256: Sha256,
})
export interface WorldSource extends Schema.Schema.Type<typeof WorldSource> {}

export const RegistrationProfile = Schema.Struct({
  contextSha256: Sha256,
  name: Label,
  aliases: Schema.Array(Label).check(Schema.isMaxLength(5)),
  identity: Detail,
  originSourceEntityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  affiliationSourceEntityIds: Schema.Array(Schema.String).check(Schema.isMaxLength(16)),
  appearance: Detail,
  personalityContradiction: Detail,
  desire: Detail,
  fear: Detail,
  wound: Detail,
  voice: Detail,
  capabilities: Schema.Array(Trait).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  limitations: Schema.Array(Trait).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  initialRelationships: Schema.Array(Detail).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  openingState: Detail,
  visualBrief: Detail,
})
export interface RegistrationProfile extends Schema.Schema.Type<typeof RegistrationProfile> {}

export const Protagonist = Schema.Struct({
  id: Schema.String,
  role: Schema.Literal("protagonist"),
  name: Label,
  aliases: Schema.Array(Label).check(Schema.isMaxLength(5)),
  identity: Detail,
  originSourceEntityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  affiliationSourceEntityIds: Schema.Array(Schema.String).check(Schema.isMaxLength(16)),
  appearance: Detail,
  personalityContradiction: Detail,
  desire: Detail,
  fear: Detail,
  wound: Detail,
  voice: Detail,
  capabilities: Schema.Array(Trait).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  limitations: Schema.Array(Trait).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  initialRelationships: Schema.Array(Detail).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  openingState: Detail,
  visualBrief: Detail,
})
export interface Protagonist extends Schema.Schema.Type<typeof Protagonist> {}

export const DocumentStatus = Schema.Literals(["registered", "leased", "committed", "failed", "waiting_user"])
export type DocumentStatus = Schema.Schema.Type<typeof DocumentStatus>

export const DocumentRecord = Schema.Struct({
  id: Schema.String,
  title: Label,
  protagonistId: Schema.String,
  sourceEntityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  sourceSha256s: Schema.Array(Sha256).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
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

export const Materialization = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  stage: Schema.Literal("character_materialization"),
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
  registrationSha256: Schema.NullOr(Sha256),
  protagonist: Schema.NullOr(Protagonist),
  document: Schema.NullOr(DocumentRecord),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  integritySha256: Sha256,
})
export interface Materialization extends Schema.Schema.Type<typeof Materialization> {}

export const MATERIALIZATION_PATH = ".novelx/growth/character-materialization.json"
export const DRAFT_DIRECTORY = ".novelx/growth/character-drafts"
export const CHARACTER_DIRECTORY = "Characters"
