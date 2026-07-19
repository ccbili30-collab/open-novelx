export * as NovelXGrowth from "./novelx-growth"

import { Schema } from "effect"

const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))
const Summary = Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(800))
const Index = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const Coordinate = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(100))
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))

export const TerrainKind = Schema.Literals([
  "continent",
  "ocean",
  "sea",
  "island",
  "archipelago",
  "mountain_range",
  "plateau",
  "plain",
  "basin",
  "valley",
  "river",
  "lake",
  "coast",
  "pass",
  "canyon",
])
export type TerrainKind = Schema.Schema.Type<typeof TerrainKind>

export const TerrainRelationKind = Schema.Literals(["adjacent_to", "borders", "crosses", "flows_into", "opens_to"])
export type TerrainRelationKind = Schema.Schema.Type<typeof TerrainRelationKind>

export const TerrainNodeProfile = Schema.Struct({
  name: Label.annotate({
    description: "A specific user-facing place name; generic labels and numbered placeholders are forbidden",
  }),
  kind: TerrainKind,
  parentNodeIndex: Schema.NullOr(Index).annotate({
    description:
      "Zero-based parent node index, or null for a continent or surrounding body of water; parents appear first",
  }),
  prominence: Schema.Literals(["core", "major", "supporting"]),
  summary: Summary.annotate({ description: "Concrete terrain description, not an instruction to fill content later" }),
  formation: Summary.annotate({ description: "Concise physical or fantastical formation logic and spatial function" }),
  map: Schema.Struct({
    x: Coordinate,
    y: Coordinate,
    width: Coordinate.check(Schema.isGreaterThanOrEqualTo(3)),
    height: Coordinate.check(Schema.isGreaterThanOrEqualTo(3)),
  }),
})
export interface TerrainNodeProfile extends Schema.Schema.Type<typeof TerrainNodeProfile> {}

export const TerrainRelationProfile = Schema.Struct({
  fromNodeIndex: Index,
  toNodeIndex: Index,
  kind: TerrainRelationKind,
  summary: Summary,
})
export interface TerrainRelationProfile extends Schema.Schema.Type<typeof TerrainRelationProfile> {}

export const Profile = Schema.Struct({
  title: Label.annotate({ description: "World name selected for this terrain registration" }),
  genre: Schema.Struct({
    family: Schema.Literal("fantasy"),
    label: Label.annotate({ description: "Specific classic continent-scale fantasy label" }),
    scale: Schema.Literal("主大陆及周边海域"),
  }),
  designSummary: Summary.annotate({
    description:
      "User-facing terrain composition summary produced after private planning; never private chain of thought",
  }),
  nodes: Schema.Array(TerrainNodeProfile).check(Schema.isMinLength(8), Schema.isMaxLength(40)),
  relations: Schema.Array(TerrainRelationProfile).check(Schema.isMinLength(1), Schema.isMaxLength(120)),
})
export interface Profile extends Schema.Schema.Type<typeof Profile> {}

export const RegisteredTerrainNode = Schema.Struct({
  id: Schema.String,
  name: Label,
  kind: TerrainKind,
  parentId: Schema.NullOr(Schema.String),
  ordinal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  prominence: Schema.Literals(["core", "major", "supporting"]),
  summary: Summary,
  formation: Summary,
  map: Schema.Struct({ x: Coordinate, y: Coordinate, width: Coordinate, height: Coordinate }),
  status: Schema.Literal("registered"),
})
export interface RegisteredTerrainNode extends Schema.Schema.Type<typeof RegisteredTerrainNode> {}

export const RegisteredTerrainRelation = Schema.Struct({
  id: Schema.String,
  fromId: Schema.String,
  toId: Schema.String,
  kind: TerrainRelationKind,
  summary: Summary,
  status: Schema.Literal("registered"),
})
export interface RegisteredTerrainRelation extends Schema.Schema.Type<typeof RegisteredTerrainRelation> {}

export const Manifest = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  stage: Schema.Literal("terrain_registration"),
  status: Schema.Literal("registered"),
  registeredAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  source: Schema.Struct({
    sessionId: Schema.String,
    messageId: Schema.String,
    toolCallId: Schema.NullOr(Schema.String),
    profileSha256: Sha256,
  }),
  profile: Profile,
  terrain: Schema.Struct({
    nodes: Schema.Array(RegisteredTerrainNode),
    relations: Schema.Array(RegisteredTerrainRelation),
  }),
  integritySha256: Sha256,
})
export interface Manifest extends Schema.Schema.Type<typeof Manifest> {}

export const MANIFEST_PATH = ".novelx/growth/skeleton.json"

export const GeographyDocumentStatus = Schema.Literals([
  "registered",
  "leased",
  "drafting",
  "submitted",
  "reviewing",
  "committed",
  "failed",
  "waiting_user",
])
export type GeographyDocumentStatus = Schema.Schema.Type<typeof GeographyDocumentStatus>

export const GeographyDocumentRecord = Schema.Struct({
  terrainId: Schema.String,
  targetPath: Schema.String,
  draftPath: Schema.String,
  status: GeographyDocumentStatus,
  lease: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      ownerSessionId: Schema.String,
      ownerMessageId: Schema.String,
      acquiredAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    }),
  ),
  taskSessionId: Schema.NullOr(Schema.String),
  draftSha256: Schema.NullOr(Sha256),
  committedSha256: Schema.NullOr(Sha256),
  updatedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  errorCode: Schema.NullOr(Schema.String),
})
export interface GeographyDocumentRecord extends Schema.Schema.Type<typeof GeographyDocumentRecord> {}

export const GeographyMaterialization = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  stage: Schema.Literal("geography_materialization"),
  status: Schema.Literals(["running", "waiting_user", "completed", "failed"]),
  skeletonIntegritySha256: Sha256,
  growthSessionId: Schema.String,
  startedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  updatedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  records: Schema.Array(GeographyDocumentRecord),
  integritySha256: Sha256,
})
export interface GeographyMaterialization extends Schema.Schema.Type<typeof GeographyMaterialization> {}

export const MATERIALIZATION_PATH = ".novelx/growth/geography-materialization.json"
export const GEOGRAPHY_DRAFT_DIRECTORY = ".novelx/growth/drafts"
