export * as NovelXWorldPublication from "./novelx-world-publication"

import { Schema } from "effect"

const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))

export const RecordKind = Schema.Literals(["atlas", "travelogue"])
export type RecordKind = Schema.Schema.Type<typeof RecordKind>

export const PublicationRecord = Schema.Struct({
  id: Schema.String,
  entityId: Schema.String,
  kind: RecordKind,
  title: Label,
  status: Schema.Literals(["pending", "committed"]),
  sourcePath: Schema.String,
  sourceSha256: Sha256,
  targetPath: Schema.String,
  committedSha256: Schema.NullOr(Sha256),
  updatedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export interface PublicationRecord extends Schema.Schema.Type<typeof PublicationRecord> {}

export const Manifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  stage: Schema.Literal("world_publication"),
  status: Schema.Literals(["writing", "ready"]),
  worldMaterializationIntegritySha256: Sha256,
  worldVisualIntegritySha256: Sha256,
  records: Schema.Array(PublicationRecord).check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  createdAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  updatedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  integritySha256: Sha256,
})
export interface Manifest extends Schema.Schema.Type<typeof Manifest> {}

export const MANIFEST_PATH = ".novelx/publication/world-publication.json"
export const PUBLICATION_DIRECTORY = "World/Atlas"
