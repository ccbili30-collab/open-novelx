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
  geometry: Schema.Literals(["area", "line", "point"]),
  parentEntityId: Schema.NullOr(Schema.String),
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
  geographyAreaEntityId: Schema.NullOr(Schema.String),
  humanAreaEntityId: Schema.NullOr(Schema.String),
  geographyLineEntityIds: Schema.Array(Schema.String),
  humanLineEntityIds: Schema.Array(Schema.String),
  pointEntityIds: Schema.Array(Schema.String),
})
export interface AtlasCell extends Schema.Schema.Type<typeof AtlasCell> {}

export const AtlasFeature = Schema.Struct({
  entityId: Schema.String,
  layer: Schema.Literals(["geography", "human"]),
  kind: Schema.Literals(["region", "river", "mountain", "polity", "organization"]),
  geometry: Schema.Literals(["area", "line", "point"]),
  parentEntityId: Schema.NullOr(Schema.String),
  surface: Surface,
  cellIds: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  rings: Schema.Array(Schema.Array(Point).check(Schema.isMinLength(3))),
  path: Schema.Array(Point),
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
  subtype: Schema.Literals([
    "world-map",
    "region-highlight",
    "wonder",
    "capital",
    "settlement",
    "daily-life",
    "fleet",
    "emblem",
  ]),
  mapRole: Schema.optional(Schema.NullOr(Schema.Literals(["base", "variant"]))),
  layer: Schema.optional(Schema.NullOr(Schema.Literals(["geography", "human"]))),
  entityId: Schema.optional(Schema.NullOr(Schema.String)),
  baseTaskId: Schema.optional(Schema.NullOr(Schema.String)),
  ownerEntityId: Schema.NullOr(Schema.String),
  status: ImageTaskStatus,
  title: Label,
  prompt: Summary,
  rationale: Summary,
  sourceEntityIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  sourceSha256s: Schema.Array(Sha256).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  targetPath: Schema.String,
  mime: Schema.NullOr(Schema.Literals(["image/png", "image/jpeg", "image/webp"])),
  assetSha256: Schema.NullOr(Sha256),
  model: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  completedAt: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  errorCode: Schema.NullOr(Schema.String),
})
export interface ImageTask extends Schema.Schema.Type<typeof ImageTask> {}

const ManifestStruct = Schema.Struct({
  schemaVersion: Schema.Literals([2, 3]),
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
  tasks: Schema.Array(ImageTask).check(Schema.isMinLength(1), Schema.isMaxLength(73)),
  createdAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  updatedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  integritySha256: Sha256,
})

type ManifestStructType = Schema.Schema.Type<typeof ManifestStruct>

export function mapVariantSetIssue(manifest: ManifestStructType): { code: string; message: string } | undefined {
  const mapTasks = manifest.tasks.filter((task) => task.type === "map")
  if (manifest.schemaVersion === 2) {
    return mapTasks.length === 1 && mapTasks[0]!.subtype === "world-map"
      ? undefined
      : { code: "NOVELX_VISUAL_TASK_SET_INVALID", message: "Atlas V2 requires one unique map task." }
  }
  const bases = mapTasks.filter((task) => task.mapRole === "base")
  const variants = mapTasks.filter((task) => task.mapRole === "variant")
  if (bases.length !== 1 || mapTasks.length !== bases.length + variants.length) {
    return {
      code: "NOVELX_VISUAL_MAP_VARIANT_SET_INVALID",
      message: "Atlas V3 requires one base map and only explicit region variants.",
    }
  }
  const base = bases[0]!
  if (
    base.subtype !== "world-map" ||
    base.layer !== null ||
    base.entityId !== null ||
    base.baseTaskId !== null
  ) {
    return {
      code: "NOVELX_VISUAL_MAP_BASE_INVALID",
      message: "The shared base map may not bind a layer, entity, or parent task.",
    }
  }
  const expected = new Set(
    manifest.atlas.features
      .filter((feature) => feature.geometry === "area")
      .map((feature) => `${feature.layer}:${feature.entityId}`),
  )
  const observed = new Set<string>()
  for (const variant of variants) {
    if (
      variant.subtype !== "region-highlight" ||
      !variant.layer ||
      !variant.entityId ||
      variant.baseTaskId !== base.id
    ) {
      return {
        code: "NOVELX_VISUAL_MAP_VARIANT_INVALID",
        message: "Every map variant must bind one layer entity to the shared base task.",
      }
    }
    const key = `${variant.layer}:${variant.entityId}`
    if (!expected.has(key) || observed.has(key)) {
      return {
        code: "NOVELX_VISUAL_MAP_VARIANT_BINDING_INVALID",
        message: "Map variants must bind every area feature exactly once.",
      }
    }
    observed.add(key)
  }
  const invalidScenery = manifest.tasks.some(
    (task) =>
      task.type === "scenery" &&
      (task.mapRole != null || task.layer != null || task.entityId != null || task.baseTaskId != null),
  )
  if (invalidScenery) {
    return {
      code: "NOVELX_VISUAL_SCENERY_BINDING_INVALID",
      message: "Scenery tasks may not carry map-variant bindings.",
    }
  }
  return observed.size === expected.size
    ? undefined
    : {
        code: "NOVELX_VISUAL_MAP_VARIANT_SET_INCOMPLETE",
        message: "Atlas V3 requires one selected-state image task for every geography and human area feature.",
      }
}

const MapVariantSetValid = Schema.makeFilter<ManifestStructType>((manifest) => mapVariantSetIssue(manifest)?.message)

export const Manifest = ManifestStruct.check(MapVariantSetValid)
export interface Manifest extends Schema.Schema.Type<typeof Manifest> {}

export const MANIFEST_PATH = ".novelx/visuals/world-visuals.json"
export const SEMANTIC_MASK_PATH = ".novelx/visuals/world-map-semantic.png"
export const MAP_RASTER_PATH = "World/Media/world-map.png"
export const MAP_VARIANT_DIRECTORY = "World/Media/maps"
export const SCENERY_DIRECTORY = "World/Media/scenery"
