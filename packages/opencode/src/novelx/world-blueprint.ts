import { createHash } from "node:crypto"
import { NovelXWorld } from "@opencode-ai/schema"

const MAX_WORLD_ENTITIES = 36
const RESERVED_SECTIONS = ["事实依据", "因果推演"]

export class WorldBlueprintError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function compileWorldBlueprint(input: {
  profile: NovelXWorld.BlueprintProfile
  source: { sessionId: string; messageId: string; toolCallId: string | null; registeredAt: number }
}): NovelXWorld.BlueprintManifest {
  const profile = normalizeBlueprintProfile(input.profile)
  const profileSha256 = worldSha256(profile)
  const stages = profile.stages.map((stage, index) => ({
    id: stableId("world-stage", index, stage.label),
    label: stage.label,
    ordinal: index + 1,
    purpose: stage.purpose,
    itemCount: stage.itemCount,
    dependsOnStageIds: stage.dependsOnStageIndices.map((dependency) =>
      stableId("world-stage", dependency, profile.stages[dependency]!.label),
    ),
    reasoningFocus: stage.reasoningFocus,
    documentSections: [...RESERVED_SECTIONS, ...stage.documentSections],
    status: "registered" as const,
  }))
  const draft = {
    schemaVersion: 1 as const,
    stage: "world_blueprint" as const,
    status: "registered" as const,
    registeredAt: input.source.registeredAt,
    source: {
      sessionId: input.source.sessionId,
      messageId: input.source.messageId,
      toolCallId: input.source.toolCallId,
      profileSha256,
    },
    profile,
    stages,
  }
  return { ...draft, integritySha256: worldSha256(draft) }
}

export function verifyWorldBlueprint(manifest: NovelXWorld.BlueprintManifest) {
  const { integritySha256, ...draft } = manifest
  if (worldSha256(draft) !== integritySha256) {
    throw new WorldBlueprintError("NOVELX_WORLD_BLUEPRINT_INTEGRITY_INVALID", "World blueprint integrity check failed.")
  }
  if (worldSha256(manifest.profile) !== manifest.source.profileSha256) {
    throw new WorldBlueprintError("NOVELX_WORLD_BLUEPRINT_PROFILE_INVALID", "World blueprint profile hash failed.")
  }
  const expected = compileWorldBlueprint({
    profile: manifest.profile,
    source: {
      sessionId: manifest.source.sessionId,
      messageId: manifest.source.messageId,
      toolCallId: manifest.source.toolCallId,
      registeredAt: manifest.registeredAt,
    },
  })
  if (expected.integritySha256 !== manifest.integritySha256) {
    throw new WorldBlueprintError("NOVELX_WORLD_BLUEPRINT_COMPILE_MISMATCH", "World blueprint is not canonical.")
  }
  return manifest
}

function normalizeBlueprintProfile(profile: NovelXWorld.BlueprintProfile): NovelXWorld.BlueprintProfile {
  const normalized = {
    title: text(profile.title, "title"),
    genre: {
      family: text(profile.genre.family, "genre.family"),
      label: text(profile.genre.label, "genre.label"),
      scale: text(profile.genre.scale, "genre.scale"),
    },
    designSummary: detail(profile.designSummary, "designSummary"),
    stages: profile.stages.map((stage, index) => ({
      label: text(stage.label, `stages[${index}].label`),
      purpose: detail(stage.purpose, `stages[${index}].purpose`),
      itemCount: count(stage.itemCount, `stages[${index}].itemCount`),
      dependsOnStageIndices: [...stage.dependsOnStageIndices],
      reasoningFocus: stage.reasoningFocus.map((value, item) =>
        detail(value, `stages[${index}].reasoningFocus[${item}]`),
      ),
      documentSections: stage.documentSections.map((value, item) =>
        text(value, `stages[${index}].documentSections[${item}]`),
      ),
    })),
  }
  if (normalized.stages.length < 1 || normalized.stages.length > 12) {
    throw new WorldBlueprintError("NOVELX_WORLD_STAGE_COUNT_INVALID", "World blueprint requires 1 to 12 stages.")
  }
  unique(
    normalized.stages.map((stage) => stage.label),
    "world stage",
  )
  normalized.stages.forEach((stage, index) => {
    unique(stage.reasoningFocus, `reasoning focus in stage ${index + 1}`)
    unique(stage.documentSections, `document section in stage ${index + 1}`)
    if (stage.documentSections.some((section) => RESERVED_SECTIONS.includes(section))) {
      throw new WorldBlueprintError(
        "NOVELX_WORLD_SECTION_RESERVED",
        `Stage ${index + 1} must not repeat Harness-owned sections.`,
      )
    }
    unique(stage.dependsOnStageIndices.map(String), `dependency in stage ${index + 1}`)
    if (stage.dependsOnStageIndices.some((dependency) => dependency < 0 || dependency >= index)) {
      throw new WorldBlueprintError(
        "NOVELX_WORLD_STAGE_DEPENDENCY_INVALID",
        `Stage ${index + 1} may depend only on earlier stages.`,
      )
    }
  })
  const total = normalized.stages.reduce((sum, stage) => sum + stage.itemCount, 0)
  if (total > MAX_WORLD_ENTITIES) {
    throw new WorldBlueprintError(
      "NOVELX_WORLD_ENTITY_LIMIT",
      `World blueprint contains ${total} entities; maximum is ${MAX_WORLD_ENTITIES}.`,
    )
  }
  return normalized
}

function text(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (!normalized || normalized.length > 120 || /(?:待命名|未命名|待填充|TODO|TBD)/iu.test(normalized)) {
    throw new WorldBlueprintError("NOVELX_WORLD_TEXT_INVALID", `${field} must contain a concrete label.`)
  }
  return normalized
}

function detail(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (normalized.length < 8 || normalized.length > 1200 || /(?:待填充|待补充|TODO|TBD)/iu.test(normalized)) {
    throw new WorldBlueprintError("NOVELX_WORLD_DETAIL_INVALID", `${field} must contain concrete content.`)
  }
  return normalized
}

function count(value: number, field: string) {
  if (!Number.isInteger(value) || value < 1 || value > 12) {
    throw new WorldBlueprintError("NOVELX_WORLD_COUNT_INVALID", `${field} must be an integer from 1 to 12.`)
  }
  return value
}

function unique(values: string[], kind: string) {
  const keys = values.map((value) => value.toLocaleLowerCase("zh-CN"))
  if (new Set(keys).size !== keys.length) {
    throw new WorldBlueprintError("NOVELX_WORLD_VALUE_DUPLICATE", `Duplicate ${kind} values are not allowed.`)
  }
}

function stableId(...parts: Array<string | number>) {
  return `nx-${worldSha256(parts).slice(0, 24)}`
}

export function worldSha256(value: unknown) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value), "utf8")
    .digest("hex")
}
