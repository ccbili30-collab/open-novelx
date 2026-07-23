import { NovelXCharacter } from "@opencode-ai/schema/novelx-character"
import { NovelXCharacterVisual } from "@opencode-ai/schema/novelx-character-visual"
import { verifyCharacterMaterialization } from "./character-materialization"
import { worldSha256 } from "./world-blueprint"

export const CHARACTER_PORTRAIT_COMPOSITION =
  "2:3竖幅单人角色立绘，人物头部到大腿中部入画，面部与身体呈四分之三视角，双眼和双手尽量清晰可见；禁止纯侧脸、全身远景、激烈动作、文字、姓名、边框和角色卡界面。"

export class CharacterVisualError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`)
  }
}

export function compileCharacterVisual(input: {
  character: NovelXCharacter.Materialization
  editorSessionId: string
  visualLanguage: string
  prompt: string
  now: number
}): NovelXCharacterVisual.Manifest {
  const character = verifyCharacterMaterialization(input.character)
  if (
    character.status !== "text_completed" ||
    !character.protagonist ||
    !character.document ||
    character.document.status !== "committed" ||
    !character.document.committedSha256
  ) {
    fail("NOVELX_CHARACTER_TEXT_INCOMPLETE", "A canonical portrait requires one completed protagonist dossier.")
  }
  const owner = character.protagonist
  const document = character.document
  const documentSha256 = document.committedSha256
  if (!documentSha256) {
    fail("NOVELX_CHARACTER_TEXT_INCOMPLETE", "A canonical portrait requires a committed protagonist dossier.")
  }
  const sourceIDs = new Set([...owner.originSourceEntityIds, ...owner.affiliationSourceEntityIds])
  const sources = character.world.sources.filter((source) => sourceIDs.has(source.entityId))
  if (sources.length !== sourceIDs.size) {
    fail("NOVELX_CHARACTER_PORTRAIT_SOURCE_UNKNOWN", "Portrait sources do not belong to the frozen Character world.")
  }
  const visualLanguage = detail(input.visualLanguage, "visual language")
  const task: NovelXCharacterVisual.PortraitTask = {
    id: stableId("character-portrait", owner.id, documentSha256),
    type: "individual",
    subtype: "canonical_portrait",
    ownerId: owner.id,
    title: owner.name,
    aspect: "portrait",
    composition: { ratio: "2:3", faceView: "three_quarter", crop: "upper_two_thirds" },
    status: "queued",
    prompt: detail(input.prompt, `${owner.name} final portrait prompt`),
    sourceDocumentId: document.id,
    sourceDocumentSha256: documentSha256,
    sourceEntityIds: sources.map((source) => source.entityId),
    sourceSha256s: sources.map((source) => source.sha256),
    targetPath: `${NovelXCharacterVisual.PORTRAIT_DIRECTORY}/${owner.id}.png`,
    attempts: 0,
    mime: null,
    assetSha256: null,
    model: null,
    startedAt: null,
    completedAt: null,
    errorCode: null,
  }
  const manifest = withIntegrity({
    schemaVersion: 1 as const,
    stage: "character_portrait" as const,
    status: "queued" as const,
    characterMaterializationIntegritySha256: character.integritySha256,
    editorSessionId: input.editorSessionId,
    visualLanguage,
    visualLanguageSha256: worldSha256(visualLanguage),
    task,
    createdAt: input.now,
    updatedAt: input.now,
  })
  return verifyCharacterVisual(manifest, character)
}

export function updateCharacterPortraitTask(input: {
  manifest: NovelXCharacterVisual.Manifest
  status: NovelXCharacterVisual.PortraitTaskStatus
  now: number
  model?: string
  mime?: NovelXCharacterVisual.PortraitTask["mime"]
  assetSha256?: string
  errorCode?: string
}) {
  const current = verifyManifestIntegrity(input.manifest)
  const task = current.task
  let next: NovelXCharacterVisual.PortraitTask
  if (input.status === "generating") {
    if (!((task.status === "queued" || task.status === "failed") && task.attempts < 3)) {
      fail("NOVELX_CHARACTER_PORTRAIT_TRANSITION_INVALID", "The portrait cannot start another image attempt.")
    }
    next = {
      ...task,
      status: "generating",
      attempts: task.attempts + 1,
      model: input.model ?? task.model,
      startedAt: input.now,
      completedAt: null,
      mime: null,
      assetSha256: null,
      errorCode: null,
    }
  } else if (input.status === "validating") {
    if (task.status !== "generating") {
      fail("NOVELX_CHARACTER_PORTRAIT_TRANSITION_INVALID", "The portrait is not generating.")
    }
    next = { ...task, status: "validating" }
  } else if (input.status === "attached") {
    if (
      task.status !== "validating" ||
      !input.mime ||
      !input.assetSha256 ||
      !/^[a-f0-9]{64}$/u.test(input.assetSha256)
    ) {
      fail("NOVELX_CHARACTER_PORTRAIT_ATTACHMENT_INVALID", "The portrait requires validated media and SHA-256.")
    }
    next = {
      ...task,
      status: "attached",
      mime: input.mime,
      assetSha256: input.assetSha256,
      completedAt: input.now,
      errorCode: null,
    }
  } else if (input.status === "failed") {
    if ((task.status !== "generating" && task.status !== "validating") || !input.errorCode) {
      fail("NOVELX_CHARACTER_PORTRAIT_TRANSITION_INVALID", `The portrait cannot fail from ${task.status}.`)
    }
    next = { ...task, status: "failed", completedAt: input.now, errorCode: input.errorCode }
  } else {
    fail("NOVELX_CHARACTER_PORTRAIT_TRANSITION_INVALID", `Direct transition to ${input.status} is not allowed.`)
  }
  return withIntegrity({
    ...withoutIntegrity(current),
    task: next,
    status: projectedStatus(next),
    updatedAt: input.now,
  })
}

export function retryCharacterPortraitTask(
  manifest: NovelXCharacterVisual.Manifest,
  now: number,
): NovelXCharacterVisual.Manifest {
  const current = verifyManifestIntegrity(manifest)
  if (current.task.status !== "failed" || current.task.attempts < 3) return manifest
  const task = {
    ...current.task,
    status: "queued" as const,
    attempts: 0,
    model: null,
    startedAt: null,
    completedAt: null,
    mime: null,
    assetSha256: null,
    errorCode: null,
  }
  return withIntegrity({ ...withoutIntegrity(current), task, status: "queued", updatedAt: now })
}

export function verifyCharacterVisual(
  manifest: NovelXCharacterVisual.Manifest,
  character: NovelXCharacter.Materialization,
) {
  const current = verifyManifestIntegrity(manifest)
  const source = verifyCharacterMaterialization(character)
  if (
    source.status !== "text_completed" ||
    !source.protagonist ||
    !source.document?.committedSha256 ||
    current.characterMaterializationIntegritySha256 !== source.integritySha256
  ) {
    fail("NOVELX_CHARACTER_PORTRAIT_CHARACTER_MISMATCH", "The portrait does not belong to this completed Character.")
  }
  const task = current.task
  const sourceIDs = new Set([
    ...source.protagonist.originSourceEntityIds,
    ...source.protagonist.affiliationSourceEntityIds,
  ])
  const expectedSources = source.world.sources.filter((item) => sourceIDs.has(item.entityId))
  if (
    task.ownerId !== source.protagonist.id ||
    task.sourceDocumentId !== source.document.id ||
    task.sourceDocumentSha256 !== source.document.committedSha256 ||
    task.sourceEntityIds.length !== expectedSources.length ||
    task.sourceSha256s.length !== expectedSources.length ||
    task.sourceEntityIds.some((id, index) => id !== expectedSources[index]?.entityId) ||
    task.sourceSha256s.some((sha, index) => sha !== expectedSources[index]?.sha256)
  ) {
    fail("NOVELX_CHARACTER_PORTRAIT_SOURCE_DRIFT", "The portrait source set is stale or incomplete.")
  }
  if (task.targetPath !== `${NovelXCharacterVisual.PORTRAIT_DIRECTORY}/${source.protagonist.id}.png`) {
    fail("NOVELX_CHARACTER_PORTRAIT_PATH_INVALID", "The portrait target path is not authoritative.")
  }
  if (task.status === "attached" && (!task.mime || !task.assetSha256)) {
    fail("NOVELX_CHARACTER_PORTRAIT_ATTACHMENT_INVALID", "The attached portrait has no asset proof.")
  }
  if (task.attempts > 3 || (task.status === "failed" && !task.errorCode)) {
    fail("NOVELX_CHARACTER_PORTRAIT_TASK_INVALID", "The portrait retry state is invalid.")
  }
  if (current.status !== projectedStatus(task)) {
    fail("NOVELX_CHARACTER_PORTRAIT_STATUS_INVALID", "The portrait manifest status is stale.")
  }
  return current
}

export function characterPortraitProviderPrompt(manifest: NovelXCharacterVisual.Manifest) {
  return `${manifest.visualLanguage}\n\n${CHARACTER_PORTRAIT_COMPOSITION}\n\n${manifest.task.prompt}`
}

function verifyManifestIntegrity(manifest: NovelXCharacterVisual.Manifest) {
  const { integritySha256, ...draft } = manifest
  if (worldSha256(draft) !== integritySha256) {
    fail("NOVELX_CHARACTER_PORTRAIT_INTEGRITY_INVALID", "The portrait manifest integrity check failed.")
  }
  if (worldSha256(manifest.visualLanguage) !== manifest.visualLanguageSha256) {
    fail("NOVELX_CHARACTER_PORTRAIT_VISUAL_LANGUAGE_INVALID", "The visual-language digest is stale.")
  }
  return manifest
}

function projectedStatus(task: NovelXCharacterVisual.PortraitTask): NovelXCharacterVisual.Manifest["status"] {
  if (task.status === "queued") return "queued"
  if (task.status === "attached") return "ready"
  if (task.status === "failed" && task.attempts >= 3) return "failed"
  return "generating"
}

function withoutIntegrity(manifest: NovelXCharacterVisual.Manifest) {
  const { integritySha256: _, ...draft } = manifest
  return draft
}

function withIntegrity<T extends Omit<NovelXCharacterVisual.Manifest, "integritySha256">>(
  draft: T,
): NovelXCharacterVisual.Manifest {
  return { ...draft, integritySha256: worldSha256(draft) }
}

function stableId(...parts: string[]) {
  return `nx-${worldSha256(parts).slice(0, 24)}`
}

function detail(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (normalized.length < 8 || normalized.length > 2_400 || /(?:待填充|待补充|TODO|TBD)/iu.test(normalized)) {
    fail("NOVELX_CHARACTER_PORTRAIT_TEXT_INVALID", `${field} must contain concrete visual direction.`)
  }
  return normalized
}

function fail(code: string, message: string): never {
  throw new CharacterVisualError(code, message)
}
