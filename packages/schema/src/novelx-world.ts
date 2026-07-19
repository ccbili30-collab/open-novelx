export * as NovelXWorld from "./novelx-world"

import { Schema } from "effect"

const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))
const Summary = Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(1200))
const Index = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(12))
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))

export const BlueprintStageProfile = Schema.Struct({
  label: Label.annotate({ description: "A genre-appropriate world layer chosen freely by the model" }),
  purpose: Summary.annotate({ description: "What this layer establishes for later dependent layers" }),
  itemCount: Count.annotate({ description: "Exact number of concrete entities to register for this layer" }),
  dependsOnStageIndices: Schema.Array(Index).check(Schema.isMaxLength(11)).annotate({
    description: "Zero-based indices of earlier layers whose committed facts this layer must use",
  }),
  reasoningFocus: Schema.Array(Summary).check(Schema.isMinLength(2), Schema.isMaxLength(8)).annotate({
    description: "Inspectable domain questions every entity dossier in this layer must answer",
  }),
  documentSections: Schema.Array(Label).check(Schema.isMinLength(2), Schema.isMaxLength(6)).annotate({
    description: "Genre-specific Markdown section names added after the Harness-owned 事实依据 and 因果推演 sections",
  }),
})
export interface BlueprintStageProfile extends Schema.Schema.Type<typeof BlueprintStageProfile> {}

export const BlueprintProfile = Schema.Struct({
  title: Label,
  genre: Schema.Struct({ family: Label, label: Label, scale: Label }),
  designSummary: Summary,
  stages: Schema.Array(BlueprintStageProfile).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
})
export interface BlueprintProfile extends Schema.Schema.Type<typeof BlueprintProfile> {}

export const BlueprintStage = Schema.Struct({
  id: Schema.String,
  label: Label,
  ordinal: Count,
  purpose: Summary,
  itemCount: Count,
  dependsOnStageIds: Schema.Array(Schema.String),
  reasoningFocus: Schema.Array(Summary),
  documentSections: Schema.Array(Label),
  status: Schema.Literal("registered"),
})
export interface BlueprintStage extends Schema.Schema.Type<typeof BlueprintStage> {}

export const BlueprintManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  stage: Schema.Literal("world_blueprint"),
  status: Schema.Literal("registered"),
  registeredAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  source: Schema.Struct({
    sessionId: Schema.String,
    messageId: Schema.String,
    toolCallId: Schema.NullOr(Schema.String),
    profileSha256: Sha256,
  }),
  profile: BlueprintProfile,
  stages: Schema.Array(BlueprintStage),
  integritySha256: Sha256,
})
export interface BlueprintManifest extends Schema.Schema.Type<typeof BlueprintManifest> {}

export const EntityFactProfile = Schema.Struct({ label: Label, detail: Summary })
export interface EntityFactProfile extends Schema.Schema.Type<typeof EntityFactProfile> {}

export const UpstreamBindingProfile = Schema.Struct({
  entityId: Schema.String,
  relation: Label.annotate({ description: "How the upstream entity constrains or enables this entity" }),
  impact: Summary.annotate({ description: "The concrete causal effect inherited from the upstream source" }),
  constraints: Schema.Array(Summary).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
})
export interface UpstreamBindingProfile extends Schema.Schema.Type<typeof UpstreamBindingProfile> {}

export const EntityProfile = Schema.Struct({
  name: Label.annotate({ description: "A specific named world entity, never a numbered placeholder" }),
  typeLabel: Label.annotate({ description: "A genre-specific entity type within this freely named world layer" }),
  summary: Summary,
  facts: Schema.Array(EntityFactProfile).check(Schema.isMinLength(3), Schema.isMaxLength(12)),
  constraints: Schema.Array(Summary).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
  upstreamBindings: Schema.Array(UpstreamBindingProfile).check(Schema.isMaxLength(24)),
})
export interface EntityProfile extends Schema.Schema.Type<typeof EntityProfile> {}

export const EntityRelationProfile = Schema.Struct({
  fromEntityIndex: Index,
  toEntityIndex: Index,
  label: Label,
  summary: Summary,
})
export interface EntityRelationProfile extends Schema.Schema.Type<typeof EntityRelationProfile> {}

export const StageRegistrationProfile = Schema.Struct({
  stageId: Schema.String,
  contextSha256: Sha256,
  entities: Schema.Array(EntityProfile).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  relations: Schema.Array(EntityRelationProfile).check(Schema.isMaxLength(48)),
})
export interface StageRegistrationProfile extends Schema.Schema.Type<typeof StageRegistrationProfile> {}

export const RegisteredEntity = Schema.Struct({
  id: Schema.String,
  stageId: Schema.String,
  name: Label,
  typeLabel: Label,
  ordinal: Count,
  summary: Summary,
  facts: Schema.Array(EntityFactProfile),
  constraints: Schema.Array(Summary),
  upstreamBindings: Schema.Array(
    Schema.Struct({
      entityId: Schema.String,
      relation: Label,
      impact: Summary,
      constraints: Schema.Array(Summary),
      sourceSha256: Sha256,
    }),
  ),
  status: Schema.Literal("registered"),
})
export interface RegisteredEntity extends Schema.Schema.Type<typeof RegisteredEntity> {}

export const RegisteredEntityRelation = Schema.Struct({
  id: Schema.String,
  stageId: Schema.String,
  fromEntityId: Schema.String,
  toEntityId: Schema.String,
  label: Label,
  summary: Summary,
  status: Schema.Literal("registered"),
})
export interface RegisteredEntityRelation extends Schema.Schema.Type<typeof RegisteredEntityRelation> {}

export const WorldDocumentStatus = Schema.Literals([
  "registered",
  "leased",
  "drafting",
  "submitted",
  "reviewing",
  "committed",
  "failed",
  "waiting_user",
])
export type WorldDocumentStatus = Schema.Schema.Type<typeof WorldDocumentStatus>

export const WorldDocumentRecord = Schema.Struct({
  entityId: Schema.String,
  stageId: Schema.String,
  targetPath: Schema.String,
  draftPath: Schema.String,
  status: WorldDocumentStatus,
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
export interface WorldDocumentRecord extends Schema.Schema.Type<typeof WorldDocumentRecord> {}

export const WorldStageRecord = Schema.Struct({
  stageId: Schema.String,
  status: Schema.Literals([
    "planned",
    "prepared",
    "registered",
    "reviewing",
    "completed",
    "waiting_user",
    "failed",
  ]),
  editorSessionId: Schema.NullOr(Schema.String),
  sourceReads: Schema.Array(
    Schema.Struct({
      entityId: Schema.String,
      sourceSha256: Sha256,
      readAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    }),
  ),
  preparedContextSha256: Schema.NullOr(Sha256),
  preparedAt: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  registeredAt: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  entities: Schema.Array(RegisteredEntity),
  relations: Schema.Array(RegisteredEntityRelation),
  handoff: Schema.NullOr(
    Schema.Struct({
      sealedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      editorSessionId: Schema.String,
      entityIds: Schema.Array(Schema.String),
      sourceEntityIds: Schema.Array(Schema.String),
      documents: Schema.Array(Schema.Struct({ entityId: Schema.String, sha256: Sha256 })),
      navigationSummary: Summary,
      integritySha256: Sha256,
    }),
  ),
})
export interface WorldStageRecord extends Schema.Schema.Type<typeof WorldStageRecord> {}

export const WorldMaterialization = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  stage: Schema.Literal("world_materialization"),
  status: Schema.Literals(["running", "waiting_user", "completed", "failed"]),
  blueprintIntegritySha256: Sha256,
  growthSessionId: Schema.String,
  startedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  updatedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  stages: Schema.Array(WorldStageRecord),
  documents: Schema.Array(WorldDocumentRecord),
  memoryCheckpoints: Schema.Array(
    Schema.Struct({
      stageId: Schema.String,
      handoffIntegritySha256: Sha256,
      contextEpoch: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
      compactionMessageId: Schema.String,
      createdAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    }),
  ),
  integritySha256: Sha256,
})
export interface WorldMaterialization extends Schema.Schema.Type<typeof WorldMaterialization> {}

export const BLUEPRINT_PATH = ".novelx/growth/world-blueprint.json"
export const MATERIALIZATION_PATH = ".novelx/growth/world-materialization.json"
export const DRAFT_DIRECTORY = ".novelx/growth/world-drafts"
