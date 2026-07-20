export * as NovelXWorldVisual from "./novelx-world-visual"

import { Schema } from "effect"

const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))
const Summary = Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(2000))
const Unit = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(1))
const Point = Schema.Struct({ x: Unit, y: Unit })

export const Surface = Schema.Literals(["ocean", "plain", "mountain", "desert", "marsh", "coast", "forest", "ice"])
export type Surface = Schema.Schema.Type<typeof Surface>

export const SpatialClaimProfile = Schema.Struct({
  entityId: Schema.String,
  layer: Schema.Literals(["geography", "human"]),
  kind: Schema.Literals(["region", "river", "mountain", "polity", "organization"]),
  surface: Surface,
  anchors: Schema.Array(Point).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  radius: Schema.Number.check(Schema.isGreaterThan(0.02), Schema.isLessThanOrEqualTo(0.65)),
  label: Label,
  summary: Summary,
  importance: Schema.Literals(["ordinary", "notable", "required"]),
})
export interface SpatialClaimProfile extends Schema.Schema.Type<typeof SpatialClaimProfile> {}

export const SceneryTaskProfile = Schema.Struct({
  ownerEntityId: Schema.String,
  subtype: Schema.Literals(["wonder", "capital", "settlement", "daily-life", "fleet", "emblem"]),
  title: Label,
  rationale: Summary,
  prompt: Summary,
})
export interface SceneryTaskProfile extends Schema.Schema.Type<typeof SceneryTaskProfile> {}

export const VisualRegistrationProfile = Schema.Struct({
  visualLanguage: Summary,
  mapPrompt: Summary,
  claims: Schema.Array(SpatialClaimProfile).check(Schema.isMinLength(2), Schema.isMaxLength(64)),
  scenery: Schema.Array(SceneryTaskProfile).check(Schema.isMaxLength(8)),
})
export interface VisualRegistrationProfile extends Schema.Schema.Type<typeof VisualRegistrationProfile> {}

export const AtlasCell = Schema.Struct({
  id: Schema.String,
  center: Point,
  polygon: Schema.Array(Point).check(Schema.isMinLength(3), Schema.isMaxLength(32)),
  neighborIds: Schema.Array(Schema.String),
  surface: Surface,
  geographyEntityIds: Schema.Array(Schema.String),
  humanEntityIds: Schema.Array(Schema.String),
})
export interface AtlasCell extends Schema.Schema.Type<typeof AtlasCell> {}

export const AtlasFeature = Schema.Struct({
  entityId: Schema.String,
  layer: Schema.Literals(["geography", "human"]),
  kind: Schema.Literals(["region", "river", "mountain", "polity", "organization"]),
  surface: Surface,
  cellIds: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  label: Label,
  labelPoint: Point,
  summary: Summary,
  sourceSha256: Sha256,
  importance: Schema.Literals(["ordinary", "notable", "required"]),
})
export interface AtlasFeature extends Schema.Schema.Type<typeof AtlasFeature> {}

export const ImageTaskStatus = Schema.Literals(["queued", "generating", "validating", "attached", "failed"])
export type ImageTaskStatus = Schema.Schema.Type<typeof ImageTaskStatus>

export const ImageTask = Schema.Struct({
  id: Schema.String,
  type: Schema.Literals(["map", "scenery"]),
  subtype: Schema.Literals(["world-map", "wonder", "capital", "settlement", "daily-life", "fleet", "emblem"]),
  ownerEntityId: Schema.NullOr(Schema.String),
  status: ImageTaskStatus,
  title: Label,
  prompt: Summary,
  rationale: Summary,
  sourceEntityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  sourceSha256s: Schema.Array(Sha256).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  targetPath: Schema.String,
  mime: Schema.NullOr(Schema.Literals(["image/png", "image/jpeg", "image/webp"])),
  assetSha256: Schema.NullOr(Sha256),
  model: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  completedAt: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  errorCode: Schema.NullOr(Schema.String),
})
export interface ImageTask extends Schema.Schema.Type<typeof ImageTask> {}

export const Manifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  stage: Schema.Literal("world_visuals"),
  status: Schema.Literals(["queued", "generating", "ready", "partial", "failed"]),
  worldMaterializationIntegritySha256: Sha256,
  visualLanguage: Summary,
  visualLanguageSha256: Sha256,
  atlas: Schema.Struct({
    id: Schema.String,
    title: Label,
    width: Schema.Literal(1024),
    height: Schema.Literal(1024),
    seed: Schema.String,
    meshSha256: Sha256,
    semanticMaskPath: Schema.String,
    semanticMaskSha256: Sha256,
    rasterPath: Schema.String,
    cells: Schema.Array(AtlasCell).check(Schema.isMinLength(24), Schema.isMaxLength(160)),
    features: Schema.Array(AtlasFeature).check(Schema.isMinLength(2), Schema.isMaxLength(64)),
  }),
  tasks: Schema.Array(ImageTask).check(Schema.isMinLength(1), Schema.isMaxLength(9)),
  createdAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  updatedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  integritySha256: Sha256,
})
export interface Manifest extends Schema.Schema.Type<typeof Manifest> {}

export const MANIFEST_PATH = ".novelx/visuals/world-visuals.json"
export const SEMANTIC_MASK_PATH = ".novelx/visuals/world-map-semantic.png"
export const MAP_RASTER_PATH = "World/Media/world-map.png"
export const SCENERY_DIRECTORY = "World/Media/scenery"
