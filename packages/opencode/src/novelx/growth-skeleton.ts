import { createHash } from "node:crypto"
import { NovelXGrowth } from "@opencode-ai/schema"

const MAX_WORLD_SLOTS = 200
const MAX_CHARACTER_SLOTS = 100
const MAX_CHAPTERS = 200
const MAX_PLANNED_FILES = 500

export class GrowthSkeletonError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function compileNovelXGrowthSkeleton(input: {
  profile: NovelXGrowth.Profile
  source: {
    sessionId: string
    messageId: string
    toolCallId: string | null
    registeredAt: number
  }
}): NovelXGrowth.Manifest {
  const profile = normalizeProfile(input.profile)
  const profileSha256 = sha256(profile)
  const world = profile.worldLayers.map((layer, layerIndex) => {
    const id = stableId("world-layer", layerIndex, layer.label)
    return {
      id,
      label: layer.label,
      ordinal: layerIndex + 1,
      parentId:
        layer.parentLayerIndex === null
          ? null
          : stableId("world-layer", layer.parentLayerIndex, profile.worldLayers[layer.parentLayerIndex]!.label),
      status: "planned" as const,
      slots: Array.from({ length: layer.slotCount }, (_, slotIndex) => ({
        id: stableId("world-slot", layerIndex, layer.label, slotIndex),
        label: `${layer.label} ${pad(slotIndex + 1, layer.slotCount)}`,
        ordinal: slotIndex + 1,
        status: "planned" as const,
      })),
    }
  })
  const characters = profile.characterGroups.map((group, groupIndex) => ({
    id: stableId("character-group", groupIndex, group.label),
    label: group.label,
    ordinal: groupIndex + 1,
    status: "planned" as const,
    slots: Array.from({ length: group.slotCount }, (_, slotIndex) => ({
      id: stableId("character-slot", groupIndex, group.label, slotIndex),
      label: `${group.label} ${pad(slotIndex + 1, group.slotCount)}`,
      ordinal: slotIndex + 1,
      status: "planned" as const,
    })),
  }))
  const graph = profile.graphViews.map((label, index) => ({
    id: stableId("graph-view", index, label),
    label,
    ordinal: index + 1,
    status: "planned" as const,
  }))
  const chapters = Array.from({ length: profile.chapterCount }, (_, index) => ({
    id: stableId("chapter", index),
    label: `第${String(index + 1).padStart(3, "0")}章`,
    ordinal: index + 1,
    status: "planned" as const,
    contentState: "empty" as const,
  }))
  const storyId = stableId("story", profile.title)
  const packageId = stableId("package", profile.title)
  const packageSections = ["封面", "简介", "世界总览", "角色总览", "因果图谱", "故事目录"].map((label, index) => ({
    id: stableId("package-section", index, label),
    label,
    ordinal: index + 1,
    status: "planned" as const,
  }))
  const files = [
    ...world.flatMap((layer) =>
      layer.slots.map((slot) =>
        plannedFile({
          label: slot.label,
          path: `World/${folder(layer.ordinal, layer.label)}/${file(slot.ordinal, slot.label, "md")}`,
          kind: "document",
          sourceId: slot.id,
        }),
      ),
    ),
    ...characters.flatMap((group) =>
      group.slots.map((slot) =>
        plannedFile({
          label: slot.label,
          path: `Characters/${folder(group.ordinal, group.label)}/${file(slot.ordinal, slot.label, "md")}`,
          kind: "document",
          sourceId: slot.id,
        }),
      ),
    ),
    ...graph.map((view) =>
      plannedFile({
        label: view.label,
        path: `Graph/${file(view.ordinal, view.label, "view.json")}`,
        kind: "view",
        sourceId: view.id,
      }),
    ),
    ...chapters.map((chapter) =>
      plannedFile({
        label: chapter.label,
        path: `Story/${chapter.label}.md`,
        kind: "document",
        sourceId: chapter.id,
      }),
    ),
    ...packageSections.map((section) =>
      plannedFile({
        label: section.label,
        path: section.label === "封面" ? "WorldPackage/cover.png" : `WorldPackage/${section.label}.md`,
        kind: section.label === "封面" ? "image" : "document",
        sourceId: section.id,
      }),
    ),
  ]
  if (files.length > MAX_PLANNED_FILES) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_FILE_LIMIT", `Planned file count exceeds ${MAX_PLANNED_FILES}.`)
  }

  const draft = {
    schemaVersion: 1 as const,
    status: "planned" as const,
    registeredAt: input.source.registeredAt,
    source: {
      sessionId: input.source.sessionId,
      messageId: input.source.messageId,
      toolCallId: input.source.toolCallId,
      profileSha256,
    },
    profile,
    surfaces: {
      files: { items: files },
      world: { layers: world },
      characters: { groups: characters },
      graph: { views: graph },
      story: { id: storyId, label: `${profile.title}·故事`, status: "planned" as const, chapters },
      package: {
        id: packageId,
        label: `${profile.title}·世界包`,
        status: "planned" as const,
        sections: packageSections,
      },
    },
  }
  return { ...draft, integritySha256: sha256(draft) }
}

export function verifyNovelXGrowthSkeleton(manifest: NovelXGrowth.Manifest) {
  const { integritySha256, ...draft } = manifest
  if (sha256(draft) !== integritySha256) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_INTEGRITY_INVALID", "Growth skeleton integrity check failed.")
  }
  if (sha256(manifest.profile) !== manifest.source.profileSha256) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_PROFILE_HASH_INVALID", "Growth profile hash check failed.")
  }
  return manifest
}

function normalizeProfile(profile: NovelXGrowth.Profile): NovelXGrowth.Profile {
  const normalized = {
    title: text(profile.title, "title"),
    genre: {
      family: text(profile.genre.family, "genre.family"),
      label: text(profile.genre.label, "genre.label"),
      scale: text(profile.genre.scale, "genre.scale"),
    },
    worldLayers: profile.worldLayers.map((layer, index) => ({
      label: text(layer.label, `worldLayers[${index}].label`),
      parentLayerIndex: layer.parentLayerIndex,
      slotCount: count(layer.slotCount, 40, `worldLayers[${index}].slotCount`),
    })),
    characterGroups: profile.characterGroups.map((group, index) => ({
      label: text(group.label, `characterGroups[${index}].label`),
      slotCount: count(group.slotCount, 40, `characterGroups[${index}].slotCount`),
    })),
    graphViews: profile.graphViews.map((label, index) => text(label, `graphViews[${index}]`)),
    chapterCount: count(profile.chapterCount, MAX_CHAPTERS, "chapterCount"),
  }
  if (normalized.worldLayers.length < 1 || normalized.worldLayers.length > 20) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_WORLD_LAYER_COUNT", "World layers must contain 1 to 20 entries.")
  }
  if (normalized.characterGroups.length < 1 || normalized.characterGroups.length > 20) {
    throw new GrowthSkeletonError(
      "NOVELX_GROWTH_CHARACTER_GROUP_COUNT",
      "Character groups must contain 1 to 20 entries.",
    )
  }
  if (normalized.graphViews.length < 1 || normalized.graphViews.length > 20) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_GRAPH_VIEW_COUNT", "Graph views must contain 1 to 20 entries.")
  }
  unique(
    normalized.worldLayers.map((layer) => layer.label),
    "world layer",
  )
  unique(
    normalized.characterGroups.map((group) => group.label),
    "character group",
  )
  unique(normalized.graphViews, "graph view")
  normalized.worldLayers.forEach((layer, index) => {
    if (layer.parentLayerIndex === null) return
    if (!Number.isInteger(layer.parentLayerIndex) || layer.parentLayerIndex < 0 || layer.parentLayerIndex >= index) {
      throw new GrowthSkeletonError(
        "NOVELX_GROWTH_WORLD_TOPOLOGY_INVALID",
        `World layer ${index + 1} must reference an earlier parent layer.`,
      )
    }
  })
  const worldSlots = normalized.worldLayers.reduce((total, layer) => total + layer.slotCount, 0)
  const characterSlots = normalized.characterGroups.reduce((total, group) => total + group.slotCount, 0)
  if (worldSlots > MAX_WORLD_SLOTS) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_WORLD_SLOT_LIMIT", `World slots exceed ${MAX_WORLD_SLOTS}.`)
  }
  if (characterSlots > MAX_CHARACTER_SLOTS) {
    throw new GrowthSkeletonError(
      "NOVELX_GROWTH_CHARACTER_SLOT_LIMIT",
      `Character slots exceed ${MAX_CHARACTER_SLOTS}.`,
    )
  }
  return normalized
}

function text(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (!normalized || normalized.length > 120) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_LABEL_INVALID", `${field} must contain 1 to 120 characters.`)
  }
  return normalized
}

function count(value: number, maximum: number, field: string) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_COUNT_INVALID", `${field} must be an integer from 1 to ${maximum}.`)
  }
  return value
}

function unique(values: string[], kind: string) {
  const keys = values.map((value) => value.toLocaleLowerCase("zh-CN"))
  if (new Set(keys).size !== keys.length) {
    throw new GrowthSkeletonError("NOVELX_GROWTH_LABEL_DUPLICATE", `Duplicate ${kind} labels are not allowed.`)
  }
}

function plannedFile(input: { label: string; path: string; kind: "document" | "view" | "image"; sourceId: string }) {
  return {
    id: stableId("file", input.path),
    label: input.label,
    path: input.path,
    kind: input.kind,
    sourceId: input.sourceId,
    status: "planned" as const,
  }
}

function folder(ordinal: number, label: string) {
  return `${String(ordinal).padStart(2, "0")}-${safeSegment(label)}`
}

function file(ordinal: number, label: string, extension: string) {
  return `${String(ordinal).padStart(3, "0")}-${safeSegment(label)}.${extension}`
}

function safeSegment(label: string) {
  const value = label
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-")
    .replace(/[. ]+$/u, "")
    .trim()
    .slice(0, 80)
  if (!value) return "未命名"
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(value)) return `${value}-项目`
  return value
}

function pad(value: number, maximum: number) {
  return String(value).padStart(Math.max(2, String(maximum).length), "0")
}

function stableId(...parts: Array<string | number>) {
  return `nx-${sha256(parts).slice(0, 24)}`
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")
}
