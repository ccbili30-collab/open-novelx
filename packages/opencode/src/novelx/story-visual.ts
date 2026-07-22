import * as NovelXStory from "@opencode-ai/schema/novelx-story"
import * as NovelXStoryVisual from "@opencode-ai/schema/novelx-story-visual"
import { worldSha256 } from "./world-blueprint"

export class StoryVisualError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`)
  }
}

export function compileStoryVisual(input: {
  story: NovelXStory.Materialization
  editorSessionId: string
  visualLanguage: string
  covers: readonly NovelXStoryVisual.CoverProfile[]
  now: number
}): NovelXStoryVisual.Manifest {
  if (input.story.status !== "text_completed" || !input.story.novel) {
    fail("NOVELX_STORY_TEXT_INCOMPLETE", "Story covers require a completed Story text chain.")
  }
  const visualLanguage = detail(input.visualLanguage, "visual language")
  const requirements = [
    {
      ownerId: input.story.novel.id,
      subtype: "novel" as const,
      title: input.story.novel.title,
      author: input.story.novel.author,
      aspect: "portrait" as const,
      documentIds: input.story.novel.chapters,
    },
    ...input.story.historyBooks.map((book) => ({
      ownerId: book.id,
      subtype: "history" as const,
      title: book.title,
      author: book.author,
      aspect: "portrait" as const,
      documentIds: book.chapterIds,
    })),
    {
      ownerId: input.story.novel.theme.id,
      subtype: "theme" as const,
      title: input.story.novel.theme.title,
      author: input.story.novel.author,
      aspect: "landscape" as const,
      documentIds: input.story.novel.chapters,
    },
  ]
  const profiles = new Map<string, NovelXStoryVisual.CoverProfile>()
  for (const cover of input.covers) {
    if (profiles.has(cover.ownerId)) fail("NOVELX_STORY_COVER_DUPLICATE", `Duplicate cover for ${cover.ownerId}.`)
    profiles.set(cover.ownerId, cover)
  }
  if (profiles.size !== requirements.length || requirements.some((requirement) => !profiles.has(requirement.ownerId))) {
    fail("NOVELX_STORY_COVER_REQUIRED", "A novel cover, every history-book cover and the novel theme cover are mandatory.")
  }
  const documents = new Map(input.story.documents.map((document) => [document.id, document]))
  const tasks: NovelXStoryVisual.CoverTask[] = requirements.map((requirement, index) => {
    const profile = profiles.get(requirement.ownerId)!
    const sourceDocuments = requirement.documentIds.map((id) => {
      const document = documents.get(id)
      if (!document?.committedSha256) fail("NOVELX_STORY_COVER_SOURCE_INVALID", `Cover source ${id} is not committed.`)
      return document
    })
    const id = stableId("story-cover", requirement.subtype, requirement.ownerId)
    const prompt = detail(profile.prompt, `${requirement.title} final cover prompt`)
    return {
      id,
      type: "cover",
      subtype: requirement.subtype,
      ownerId: requirement.ownerId,
      title: requirement.title,
      author: requirement.author,
      aspect: requirement.aspect,
      status: "queued",
      prompt,
      sourceDocumentIds: sourceDocuments.map((document) => document.id),
      sourceSha256s: sourceDocuments.map((document) => document.committedSha256!),
      targetPath: `${NovelXStoryVisual.COVER_DIRECTORY}/${String(index + 1).padStart(2, "0")}-${safeSegment(requirement.title)}-${requirement.subtype}.png`,
      attempts: 0,
      mime: null,
      assetSha256: null,
      model: null,
      startedAt: null,
      completedAt: null,
      errorCode: null,
    }
  })
  const manifest = withIntegrity({
    schemaVersion: 2 as const,
    stage: "story_covers" as const,
    status: "queued" as const,
    storyMaterializationIntegritySha256: input.story.integritySha256,
    editorSessionId: input.editorSessionId,
    visualLanguage,
    visualLanguageSha256: worldSha256(visualLanguage),
    tasks,
    createdAt: input.now,
    updatedAt: input.now,
  })
  return verifyStoryVisual(manifest, input.story)
}

export function updateStoryImageTask(input: {
  manifest: NovelXStoryVisual.Manifest
  taskId: string
  status: NovelXStoryVisual.CoverTaskStatus
  now: number
  model?: string
  mime?: NovelXStoryVisual.CoverTask["mime"]
  assetSha256?: string
  errorCode?: string
}) {
  const current = verifyManifestIntegrity(input.manifest)
  const task = current.tasks.find((candidate) => candidate.id === input.taskId)
  if (!task) fail("NOVELX_STORY_COVER_UNKNOWN", `Unknown cover task ${input.taskId}.`)
  let next: NovelXStoryVisual.CoverTask
  if (input.status === "generating") {
    if (!((task.status === "queued" || task.status === "failed") && task.attempts < 3)) {
      fail("NOVELX_STORY_COVER_TRANSITION_INVALID", `${task.id} cannot start another image attempt.`)
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
    if (task.status !== "generating") fail("NOVELX_STORY_COVER_TRANSITION_INVALID", `${task.id} is not generating.`)
    next = { ...task, status: "validating" }
  } else if (input.status === "attached") {
    if (task.status !== "validating" || !input.mime || !input.assetSha256 || !/^[a-f0-9]{64}$/u.test(input.assetSha256)) {
      fail("NOVELX_STORY_COVER_ATTACHMENT_INVALID", `${task.id} requires a validated image MIME type and SHA-256.`)
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
      fail("NOVELX_STORY_COVER_TRANSITION_INVALID", `${task.id} cannot fail from ${task.status}.`)
    }
    next = { ...task, status: "failed", completedAt: input.now, errorCode: input.errorCode }
  } else {
    fail("NOVELX_STORY_COVER_TRANSITION_INVALID", `Direct transition to ${input.status} is not allowed.`)
  }
  const tasks = current.tasks.map((candidate) => (candidate.id === next.id ? next : candidate))
  return withIntegrity({ ...withoutIntegrity(current), tasks, status: projectedStatus(tasks), updatedAt: input.now })
}

export function verifyStoryVisual(manifest: NovelXStoryVisual.Manifest, story: NovelXStory.Materialization) {
  verifyManifestIntegrity(manifest)
  if (!story.novel || story.status !== "text_completed" || manifest.storyMaterializationIntegritySha256 !== story.integritySha256) {
    fail("NOVELX_STORY_COVER_STORY_MISMATCH", "Cover manifest does not belong to the current completed story.")
  }
  const expectedOwners = [story.novel.id, ...story.historyBooks.map((book) => book.id), story.novel.theme.id]
  if (manifest.tasks.length !== expectedOwners.length || manifest.tasks.some((task, index) => task.ownerId !== expectedOwners[index])) {
    fail("NOVELX_STORY_COVER_REQUIRED", "Cover manifest does not contain the exact mandatory owner set in order.")
  }
  const documents = new Map(story.documents.map((document) => [document.id, document]))
  for (const task of manifest.tasks) {
    if (!safeRelativePath(task.targetPath) || task.sourceDocumentIds.length !== task.sourceSha256s.length) {
      fail("NOVELX_STORY_COVER_TASK_INVALID", `Cover task ${task.id} has invalid paths or sources.`)
    }
    task.sourceDocumentIds.forEach((id, index) => {
      if (documents.get(id)?.committedSha256 !== task.sourceSha256s[index]) {
        fail("NOVELX_STORY_COVER_SOURCE_INVALID", `Cover task ${task.id} has a stale text source.`)
      }
    })
    if (task.status === "attached" && (!task.mime || !task.assetSha256)) {
      fail("NOVELX_STORY_COVER_ATTACHMENT_INVALID", `Attached cover ${task.id} has no asset proof.`)
    }
    if (task.attempts > 3 || (task.status === "failed" && !task.errorCode)) {
      fail("NOVELX_STORY_COVER_TASK_INVALID", `Cover task ${task.id} has an invalid retry state.`)
    }
  }
  if (manifest.status !== projectedStatus(manifest.tasks)) fail("NOVELX_STORY_COVER_STATUS_INVALID", "Cover manifest status projection is stale.")
  return manifest
}

export function storyCoverProviderPrompt(
  manifest: NovelXStoryVisual.Manifest,
  task: NovelXStoryVisual.CoverTask,
) {
  return `${manifest.visualLanguage}\n\n${task.prompt}`
}

function verifyManifestIntegrity(manifest: NovelXStoryVisual.Manifest) {
  const { integritySha256, ...draft } = manifest
  if (worldSha256(draft) !== integritySha256) fail("NOVELX_STORY_COVER_INTEGRITY_INVALID", "Cover manifest integrity check failed.")
  if (worldSha256(manifest.visualLanguage) !== manifest.visualLanguageSha256) {
    fail("NOVELX_STORY_COVER_VISUAL_LANGUAGE_INVALID", "Cover visual-language digest is stale.")
  }
  if (new Set(manifest.tasks.map((task) => task.id)).size !== manifest.tasks.length) {
    fail("NOVELX_STORY_COVER_DUPLICATE", "Cover task IDs must be unique.")
  }
  return manifest
}

function projectedStatus(tasks: readonly NovelXStoryVisual.CoverTask[]): NovelXStoryVisual.Manifest["status"] {
  if (tasks.every((task) => task.status === "queued")) return "queued"
  if (tasks.every((task) => task.status === "attached")) return "ready"
  const terminal = tasks.every((task) => task.status === "attached" || (task.status === "failed" && task.attempts >= 3))
  if (terminal) return tasks.every((task) => task.status === "failed") ? "failed" : "partial"
  return "generating"
}

function withoutIntegrity(current: NovelXStoryVisual.Manifest) {
  const { integritySha256: _, ...draft } = current
  return draft
}

function withIntegrity<T extends Omit<NovelXStoryVisual.Manifest, "integritySha256">>(draft: T): NovelXStoryVisual.Manifest {
  return { ...draft, integritySha256: worldSha256(draft) }
}

function stableId(...parts: Array<string | number>) {
  return `nx-${worldSha256(parts).slice(0, 24)}`
}

function detail(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (normalized.length < 4 || normalized.length > 2_400 || /(?:待填充|待补充|TODO|TBD)/iu.test(normalized)) {
    fail("NOVELX_STORY_COVER_TEXT_INVALID", `${field} must contain concrete visual direction.`)
  }
  return normalized
}

function safeSegment(value: string) {
  const normalized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-").replace(/[. ]+$/u, "").trim().slice(0, 80)
  if (!normalized) fail("NOVELX_STORY_COVER_PATH_INVALID", "A cover path segment is empty.")
  return normalized
}

function safeRelativePath(value: string) {
  return !value.startsWith("/") && !value.includes("..") && !/[<>:"|?*\u0000-\u001f]/u.test(value)
}

function fail(code: string, message: string): never {
  throw new StoryVisualError(code, message)
}
