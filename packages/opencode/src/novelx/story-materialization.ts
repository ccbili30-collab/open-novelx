import * as NovelXStory from "@opencode-ai/schema/novelx-story"
import { inspectSourceTitleGrounding, longestCommonHanFragments } from "./text-grounding"
import { worldSha256 } from "./world-blueprint"

export class StoryMaterializationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`)
  }
}

export type RegisteredStoryMaterialization = NovelXStory.Materialization & {
  novel: NovelXStory.NovelWork
}

export type CompletedStoryMaterialization = RegisteredStoryMaterialization & {
  status: "text_completed"
}

export type StoryContinuityAuthority = {
  id: string
  name: string
  openingState: string
  wound: string
  initialRelationships: readonly string[]
}

export function createStoryMaterialization(input: {
  world: { title: string; materializationIntegritySha256: string; sources: readonly NovelXStory.WorldSource[] }
  protagonist: NovelXStory.ProtagonistSource
  editorSessionId: string
  now: number
}): NovelXStory.MaterializationV2 {
  if (!input.world.sources.length) fail("NOVELX_STORY_WORLD_EMPTY", "The frozen world has no readable sources.")
  if (!input.protagonist) {
    fail("NOVELX_STORY_CHARACTER_REQUIRED", "New Story Growth requires one completed protagonist dossier.")
  }
  unique(
    input.world.sources.map((source) => source.entityId),
    "world source ID",
  )
  const world = {
    title: concreteLabel(input.world.title, "world.title"),
    materializationIntegritySha256: sha256(input.world.materializationIntegritySha256, "world integrity"),
    sources: input.world.sources.map((source) => ({
      entityId: concreteLabel(source.entityId, "world source ID"),
      title: concreteLabel(source.title, "world source title"),
      path: safePath(source.path),
      sha256: sha256(source.sha256, `world source ${source.entityId}`),
    })),
  }
  const protagonist = {
    id: concreteLabel(input.protagonist.id, "protagonist.id"),
    name: concreteLabel(input.protagonist.name, "protagonist.name"),
    path: safePath(input.protagonist.path),
    sha256: sha256(input.protagonist.sha256, "protagonist dossier"),
    characterIntegritySha256: sha256(input.protagonist.characterIntegritySha256, "character integrity"),
  }
  if (!protagonist.path.startsWith("Characters/")) {
    fail("NOVELX_STORY_CHARACTER_PATH_INVALID", "The protagonist source must be a committed Characters dossier.")
  }
  const preparedContextSha256 = worldSha256({ world, protagonist })
  return withIntegrity({
    schemaVersion: 2 as const,
    stage: "story_materialization" as const,
    status: "planning" as const,
    world,
    editorSessionId: concreteLabel(input.editorSessionId, "story editor session"),
    preparedContextSha256,
    sourceReads: [],
    protagonist,
    protagonistRead: null,
    registrationSha256: null,
    historyBooks: [],
    references: [],
    novel: null,
    documents: [],
    createdAt: input.now,
    updatedAt: input.now,
  }) as NovelXStory.MaterializationV2
}

export function recordStoryCharacterRead(input: {
  manifest: NovelXStory.Materialization
  editorSessionId: string
  protagonistId: string
  sourceSha256: string
  now: number
}) {
  const current = verifyStoryMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  if (current.schemaVersion !== 2) {
    fail(
      "NOVELX_STORY_LEGACY_CHARACTER_UNSUPPORTED",
      "Legacy Story v1 cannot acquire a retroactive protagonist source.",
    )
  }
  const protagonist = current.protagonist
  if (!protagonist) fail("NOVELX_STORY_CHARACTER_REQUIRED", "Story v2 is missing its protagonist source.")
  if (current.status !== "planning") {
    fail("NOVELX_STORY_PLANNING_REQUIRED", "The protagonist source is read only while planning Story Growth.")
  }
  if (input.protagonistId !== protagonist.id || input.sourceSha256 !== protagonist.sha256) {
    fail("NOVELX_STORY_CHARACTER_SOURCE_DRIFT", "The read protagonist dossier does not match the frozen source.")
  }
  if (current.protagonistRead) return current
  return withIntegrity({
    ...withoutIntegrity(current),
    protagonistRead: {
      protagonistId: protagonist.id,
      sourceSha256: protagonist.sha256,
      readAt: input.now,
    },
    updatedAt: input.now,
  })
}

export function recordStorySourceReads(input: {
  manifest: NovelXStory.Materialization
  editorSessionId: string
  sourceEntityIds: readonly string[]
  now: number
}) {
  const current = verifyStoryMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  if (current.status !== "planning")
    fail("NOVELX_STORY_PLANNING_REQUIRED", "World sources are read only while planning.")
  unique([...input.sourceEntityIds], "source read")
  const sources = new Map(current.world.sources.map((source) => [source.entityId, source]))
  const reads = new Map(current.sourceReads.map((read) => [read.entityId, read]))
  for (const entityId of input.sourceEntityIds) {
    const source = sources.get(entityId)
    if (!source) fail("NOVELX_STORY_SOURCE_UNKNOWN", `Unknown frozen world source ${entityId}.`)
    reads.set(entityId, reads.get(entityId) ?? { entityId, sourceSha256: source.sha256, readAt: input.now })
  }
  return withIntegrity({ ...withoutIntegrity(current), sourceReads: [...reads.values()], updatedAt: input.now })
}

export function registerStory(input: {
  manifest: NovelXStory.Materialization
  editorSessionId: string
  profile: NovelXStory.RegistrationProfile
  protagonistContinuity?: StoryContinuityAuthority
  now: number
}): { manifest: RegisteredStoryMaterialization; replayed: false } {
  const current = verifyStoryMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  if (current.status !== "planning")
    fail("NOVELX_STORY_REGISTRATION_CONFLICT", "The story has already been registered.")
  if (input.profile.contextSha256 !== current.preparedContextSha256) {
    fail("NOVELX_STORY_CONTEXT_STALE", "Story registration was not planned from the current frozen world context.")
  }
  if (current.schemaVersion === 2) {
    const protagonist = current.protagonist
    if (!protagonist) fail("NOVELX_STORY_CHARACTER_REQUIRED", "Story v2 is missing its protagonist source.")
    if (
      current.protagonistRead?.protagonistId !== protagonist.id ||
      current.protagonistRead.sourceSha256 !== protagonist.sha256
    ) {
      fail(
        "NOVELX_STORY_CHARACTER_SOURCE_UNREAD",
        "The Story editor must read the exact frozen protagonist dossier before registration.",
      )
    }
  }
  if (input.profile.historyBooks.length < 1 || input.profile.historyBooks.length > 4) {
    fail("NOVELX_STORY_HISTORY_COUNT_INVALID", "Story Growth requires one to four named history books.")
  }
  if (input.profile.references.length < 2 || input.profile.references.length > 5) {
    fail("NOVELX_STORY_REFERENCE_COUNT_INVALID", "Story Growth requires two to five reference documents.")
  }
  if (input.profile.novel.chapters.length < 6 || input.profile.novel.chapters.length > 8) {
    fail("NOVELX_STORY_NOVEL_CHAPTER_COUNT_INVALID", "The single novel must contain six to eight chapters.")
  }
  const continuity = requireStoryContinuityAuthority(current, input.protagonistContinuity)
  if (
    continuity &&
    longestCommonHanFragments(input.profile.novel.chapters[0]!.brief, continuity.openingState).length < 3
  ) {
    fail(
      "NOVELX_STORY_OPENING_ANCHORS_INSUFFICIENT",
      "The first novel brief and sealed opening state must share at least three exact Chinese continuity anchors.",
    )
  }
  const sources = new Map(current.world.sources.map((source) => [source.entityId, source]))
  const reads = new Map(current.sourceReads.map((read) => [read.entityId, read.sourceSha256]))
  const assertSources = (ids: readonly string[], field: string) => {
    if (!ids.length) fail("NOVELX_STORY_SOURCE_REQUIRED", `${field} must cite frozen world sources.`)
    unique([...ids], `${field} source`)
    for (const entityId of ids) {
      const source = sources.get(entityId)
      if (!source) fail("NOVELX_STORY_SOURCE_UNKNOWN", `${field} cites unknown source ${entityId}.`)
      if (reads.get(entityId) !== source.sha256) {
        fail("NOVELX_STORY_SOURCE_UNREAD", `${field} cites ${entityId}, which the story editor did not read exactly.`)
      }
    }
  }

  const documents: NovelXStory.DocumentRecord[] = []
  const historyBooks: NovelXStory.HistoryBook[] = []
  let ordinal = 1
  input.profile.historyBooks.forEach((profile, bookIndex) => {
    if (profile.chapters.length < 3 || profile.chapters.length > 5) {
      fail(
        "NOVELX_STORY_HISTORY_CHAPTER_COUNT_INVALID",
        `History book ${bookIndex + 1} requires three to five chapters.`,
      )
    }
    const title = concreteLabel(profile.title, `historyBooks[${bookIndex}].title`)
    const workId = stableId("history", bookIndex, title)
    const chapterIds = profile.chapters.map((chapter, chapterIndex) => {
      assertSources(chapter.sourceEntityIds, `historyBooks[${bookIndex}].chapters[${chapterIndex}]`)
      const chapterTitle = concreteLabel(chapter.title, `history chapter ${chapterIndex + 1}`)
      const id = stableId("history-chapter", workId, chapterIndex, chapterTitle)
      documents.push(
        documentRecord({
          id,
          kind: "history_chapter",
          workId,
          title: chapterTitle,
          author: concreteLabel(profile.author, `historyBooks[${bookIndex}].author`),
          kindLabel: "历史",
          brief: detail(chapter.brief, `history chapter ${chapterIndex + 1} brief`),
          ordinal: ordinal++,
          sourceEntityIds: chapter.sourceEntityIds,
          sourceSha256s: chapter.sourceEntityIds.map((id) => sources.get(id)!.sha256),
          upstreamDocumentIds: [],
          targetPath: `${NovelXStory.STORY_DIRECTORY}/历史/${safeSegment(title)}/${String(chapterIndex + 1).padStart(2, "0")}-${safeSegment(chapterTitle)}.md`,
          now: input.now,
        }),
      )
      return id
    })
    historyBooks.push({
      id: workId,
      title,
      author: concreteLabel(profile.author, `historyBooks[${bookIndex}].author`),
      summary: detail(profile.summary, `historyBooks[${bookIndex}].summary`),
      ordinal: bookIndex + 1,
      chapterIds,
    })
  })
  unique(
    historyBooks.map((book) => book.title),
    "history book title",
  )

  const references: NovelXStory.ReferenceDocument[] = input.profile.references.map((profile, index) => {
    assertSources(profile.sourceEntityIds, `references[${index}]`)
    const title = concreteLabel(profile.title, `references[${index}].title`)
    const id = stableId("reference", index, title)
    const upstreamDocumentIds = profile.historyReferences.map((reference) => {
      const book = historyBooks[reference.historyBookIndex]
      const documentId = book?.chapterIds[reference.chapterIndex]
      if (!documentId)
        fail("NOVELX_STORY_HISTORY_REFERENCE_INVALID", `Reference ${title} cites an unknown history chapter.`)
      return documentId
    })
    unique(upstreamDocumentIds, `${title} history reference`)
    documents.push(
      documentRecord({
        id,
        kind: "reference_document",
        workId: null,
        title,
        author: concreteLabel(profile.author, `references[${index}].author`),
        kindLabel: concreteLabel(profile.kindLabel, `references[${index}].kindLabel`),
        brief: detail(profile.summary, `references[${index}].summary`),
        ordinal: ordinal++,
        sourceEntityIds: profile.sourceEntityIds,
        sourceSha256s: profile.sourceEntityIds.map((sourceId) => sources.get(sourceId)!.sha256),
        upstreamDocumentIds,
        targetPath: `${NovelXStory.STORY_DIRECTORY}/文献/${String(index + 1).padStart(2, "0")}-${safeSegment(title)}.md`,
        now: input.now,
      }),
    )
    return {
      id: stableId("reference-work", index, title),
      title,
      kindLabel: concreteLabel(profile.kindLabel, `references[${index}].kindLabel`),
      author: concreteLabel(profile.author, `references[${index}].author`),
      summary: detail(profile.summary, `references[${index}].summary`),
      ordinal: index + 1,
      documentId: id,
    }
  })
  unique(
    references.map((reference) => reference.title),
    "reference title",
  )

  const novelTitle = concreteLabel(input.profile.novel.title, "novel.title")
  const novelId = stableId("novel", novelTitle)
  const themeTitle = concreteLabel(input.profile.novel.theme.title, "novel.theme.title")
  const themeId = stableId("novel-theme", novelId, themeTitle)
  const novelChapterIds: string[] = []
  input.profile.novel.chapters.forEach((profile, index) => {
    assertSources(profile.sourceEntityIds, `novel.chapters[${index}]`)
    const title = concreteLabel(profile.title, `novel.chapters[${index}].title`)
    const historyDependencies = profile.historyReferences.map((reference) => {
      const id = historyBooks[reference.historyBookIndex]?.chapterIds[reference.chapterIndex]
      if (!id)
        fail("NOVELX_STORY_HISTORY_REFERENCE_INVALID", `Novel chapter ${title} cites an unknown history chapter.`)
      return id
    })
    const documentDependencies = profile.documentIndices.map((documentIndex) => {
      const id = references[documentIndex]?.documentId
      if (!id) fail("NOVELX_STORY_REFERENCE_INVALID", `Novel chapter ${title} cites an unknown reference document.`)
      return id
    })
    const previous = novelChapterIds.at(-1)
    const id = stableId("novel-chapter", novelId, index, title)
    documents.push(
      documentRecord({
        id,
        kind: "novel_chapter",
        workId: novelId,
        title,
        author: concreteLabel(input.profile.novel.author, "novel.author"),
        kindLabel: "小说",
        brief: detail(profile.brief, `novel.chapters[${index}].brief`),
        ordinal: ordinal++,
        sourceEntityIds: profile.sourceEntityIds,
        sourceSha256s: profile.sourceEntityIds.map((sourceId) => sources.get(sourceId)!.sha256),
        upstreamDocumentIds: [
          ...new Set([...historyDependencies, ...documentDependencies, ...(previous ? [previous] : [])]),
        ],
        targetPath: `${NovelXStory.STORY_DIRECTORY}/小说/${safeSegment(novelTitle)}/${safeSegment(themeTitle)}/${String(index + 1).padStart(2, "0")}-${safeSegment(title)}.md`,
        now: input.now,
      }),
    )
    novelChapterIds.push(id)
  })
  unique(
    input.profile.novel.chapters.map((chapter) => chapter.title),
    "novel chapter title",
  )
  const novel: NovelXStory.NovelWork = {
    id: novelId,
    title: novelTitle,
    author: concreteLabel(input.profile.novel.author, "novel.author"),
    summary: detail(input.profile.novel.summary, "novel.summary"),
    theme: {
      id: themeId,
      title: themeTitle,
      summary: detail(input.profile.novel.theme.summary, "novel.theme.summary"),
    },
    chapters: novelChapterIds,
  }
  const manifest = withIntegrity({
    ...withoutIntegrity(current),
    status: "writing" as const,
    registrationSha256: worldSha256(input.profile),
    historyBooks,
    references,
    novel,
    documents,
    updatedAt: input.now,
  })
  return { manifest: verifyStoryMaterialization(manifest) as RegisteredStoryMaterialization, replayed: false }
}

export function prepareStoryDocument<T extends NovelXStory.Materialization>(input: {
  manifest: T
  documentId: string
  editorSessionId: string
  editorMessageId: string
  committedContents: Record<string, string>
  worldContents?: Record<string, string>
  protagonistMarkdown?: string
  protagonistContinuity?: StoryContinuityAuthority
  now: number
}) {
  const current = verifyStoryMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  if (current.status !== "writing")
    fail("NOVELX_STORY_WRITING_REQUIRED", "Story documents can only be prepared while writing.")
  const record = requireDocument(current, input.documentId)
  const protagonist = protagonistContext(current, input.protagonistMarkdown)
  const continuity = requireStoryContinuityAuthority(current, input.protagonistContinuity)
  for (const prior of current.documents.filter((document) => document.ordinal < record.ordinal)) {
    const content = input.committedContents[prior.id]
    if (prior.status !== "committed" || !content || worldSha256(normalizeMarkdown(content)) !== prior.committedSha256) {
      fail("NOVELX_STORY_DEPENDENCY_INCOMPLETE", `${record.title} cannot start before ${prior.title} is committed.`)
    }
  }
  const context = {
    world: current.world,
    document: contextDocument(record),
    exactSourceTitles: exactSourceTitles(current, record),
    worldSources: record.sourceEntityIds.map((id) => {
      const source = current.world.sources.find((candidate) => candidate.entityId === id)!
      const markdown = input.worldContents?.[id]
      if (input.worldContents && (!markdown || worldSha256(markdown) !== source.sha256)) {
        fail("NOVELX_STORY_SOURCE_DRIFT", `Frozen world source ${source.path} is missing or changed.`)
      }
      return { ...source, ...(markdown ? { markdown } : {}) }
    }),
    upstreamDocuments: record.upstreamDocumentIds.map((id) => ({
      record: requireDocument(current, id),
      markdown: requireCommittedContent(current, id, input.committedContents),
    })),
    protagonist,
    ...(record.kind === "novel_chapter" && continuity
      ? novelContinuityContext(current, record, input.committedContents, continuity)
      : {}),
  }
  if (record.status === "committed") return { manifest: current, record, context, replayed: true }
  // A lease belongs to the long-lived stage editor session, not to one model
  // message. Provider/tool-output failure may end a turn after the lease was
  // persisted but before the child result was committed. Resuming that same
  // editor session must replay the exact lease; a different editor session is
  // still rejected.
  if (record.lease && record.lease.ownerSessionId !== input.editorSessionId) {
    fail("NOVELX_STORY_DOCUMENT_LEASE_CONFLICT", `${record.targetPath} is already leased by another task.`)
  }
  const lease = record.lease ?? {
    id: `nx-lease-${worldSha256([record.id, input.editorSessionId, input.editorMessageId, input.now]).slice(0, 20)}`,
    ownerSessionId: input.editorSessionId,
    ownerMessageId: input.editorMessageId,
    acquiredAt: input.now,
  }
  const nextRecord = { ...record, status: "leased" as const, lease, updatedAt: input.now, errorCode: null }
  return {
    manifest: updateDocument(current, nextRecord, input.now),
    record: nextRecord,
    context,
    replayed: Boolean(record.lease),
  }
}

export function commitStoryDocument<T extends NovelXStory.Materialization>(input: {
  manifest: T
  documentId: string
  editorSessionId: string
  taskSessionId: string
  leaseId: string
  markdown: string
  protagonistContinuity?: StoryContinuityAuthority
  now: number
}) {
  const current = verifyStoryMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  const record = requireDocument(current, input.documentId)
  if (current.schemaVersion === 1 && record.status === "committed") {
    const markdown = normalizeMarkdown(input.markdown)
    if (record.committedSha256 !== worldSha256(markdown)) {
      fail("NOVELX_STORY_DOCUMENT_COMMIT_CONFLICT", `${record.targetPath} already has different content.`)
    }
    return { manifest: current, record, markdown, replayed: true }
  }
  const continuity = requireStoryContinuityAuthority(current, input.protagonistContinuity)
  const markdown = normalizeStoryDocument(current, record, input.markdown)
  assertNovelWriterSession(current, record, input.taskSessionId)
  if (record.kind === "novel_chapter" && continuity && current.novel?.chapters[0] === record.id) {
    const anchors = requiredOpeningAnchors(current, continuity)
    if (anchors.length < 3) {
      fail(
        "NOVELX_STORY_OPENING_ANCHORS_INSUFFICIENT",
        "The first novel brief and sealed opening state must share at least three exact Chinese continuity anchors.",
      )
    }
    const missingAnchors = anchors.filter((anchor) => !markdown.includes(anchor))
    if (missingAnchors.length) {
      fail(
        "NOVELX_STORY_OPENING_ANCHORS_MISSING",
        `The first novel chapter is missing required opening anchors: ${missingAnchors.map((anchor) => JSON.stringify(anchor)).join(", ")}.`,
      )
    }
  }
  const hash = worldSha256(markdown)
  if (record.status === "committed") {
    if (record.committedSha256 !== hash)
      fail("NOVELX_STORY_DOCUMENT_COMMIT_CONFLICT", `${record.targetPath} already has different content.`)
    return { manifest: current, record, markdown, replayed: true }
  }
  if (!record.lease || record.lease.id !== input.leaseId || record.lease.ownerSessionId !== input.editorSessionId) {
    fail("NOVELX_STORY_DOCUMENT_LEASE_REQUIRED", `${record.targetPath} requires its exact editor lease before commit.`)
  }
  const nextRecord = {
    ...record,
    status: "committed" as const,
    lease: null,
    taskSessionId: input.taskSessionId,
    committedSha256: hash,
    updatedAt: input.now,
    errorCode: null,
  }
  return { manifest: updateDocument(current, nextRecord, input.now), record: nextRecord, markdown, replayed: false }
}

export function finishStoryText(input: {
  manifest: RegisteredStoryMaterialization
  editorSessionId: string
  now: number
}): CompletedStoryMaterialization {
  const current = verifyStoryMaterialization(input.manifest)
  assertEditor(current, input.editorSessionId)
  if (!current.documents.length || current.documents.some((document) => document.status !== "committed")) {
    fail(
      "NOVELX_STORY_TEXT_INCOMPLETE",
      "Every history, reference and novel document must be committed before Story text completes.",
    )
  }
  return withIntegrity({
    ...withoutIntegrity(current),
    status: "text_completed" as const,
    updatedAt: input.now,
  }) as CompletedStoryMaterialization
}

export function verifyStoryMaterialization<T extends NovelXStory.Materialization>(manifest: T): T {
  const { integritySha256, ...draft } = manifest
  if (worldSha256(draft) !== integritySha256)
    fail("NOVELX_STORY_INTEGRITY_INVALID", "Story materialization integrity check failed.")
  unique(
    manifest.world.sources.map((source) => source.entityId),
    "world source ID",
  )
  unique(
    manifest.documents.map((document) => document.id),
    "story document ID",
  )
  unique(
    manifest.documents.map((document) => document.targetPath.toLocaleLowerCase("zh-CN")),
    "story target path",
  )
  if (manifest.schemaVersion === 2 && !manifest.protagonist) {
    fail("NOVELX_STORY_CHARACTER_REQUIRED", "Story v2 is missing its protagonist source.")
  }
  const expectedContextSha256 = worldSha256(
    manifest.schemaVersion === 2
      ? { world: manifest.world, protagonist: manifest.protagonist! }
      : { world: manifest.world },
  )
  if (manifest.preparedContextSha256 !== expectedContextSha256) {
    fail("NOVELX_STORY_CONTEXT_INVALID", "Story prepared context does not match its frozen sources.")
  }
  if (manifest.schemaVersion === 2) {
    const protagonist = manifest.protagonist!
    if (!safeRelativePath(protagonist.path) || !protagonist.path.startsWith("Characters/")) {
      fail("NOVELX_STORY_CHARACTER_PATH_INVALID", "The protagonist source path is invalid.")
    }
    if (
      manifest.protagonistRead &&
      (manifest.protagonistRead.protagonistId !== protagonist.id ||
        manifest.protagonistRead.sourceSha256 !== protagonist.sha256)
    ) {
      fail("NOVELX_STORY_CHARACTER_SOURCE_DRIFT", "The recorded protagonist read does not match its frozen source.")
    }
  }
  if (manifest.status === "planning") {
    if (
      manifest.registrationSha256 ||
      manifest.historyBooks.length ||
      manifest.references.length ||
      manifest.novel ||
      manifest.documents.length
    ) {
      fail("NOVELX_STORY_CONTENT_PREMATURE", "Planning state cannot contain registered story content.")
    }
    return manifest
  }
  if (!manifest.registrationSha256 || !manifest.novel || !manifest.historyBooks.length) {
    fail("NOVELX_STORY_REGISTRATION_INCOMPLETE", "Registered Story Growth is missing its named works.")
  }
  if (
    manifest.schemaVersion === 2 &&
    (manifest.protagonistRead?.protagonistId !== manifest.protagonist!.id ||
      manifest.protagonistRead.sourceSha256 !== manifest.protagonist!.sha256)
  ) {
    fail("NOVELX_STORY_CHARACTER_SOURCE_UNREAD", "Registered Story Growth is missing its exact protagonist read.")
  }
  const expectedIds = [
    ...manifest.historyBooks.flatMap((book) => book.chapterIds),
    ...manifest.references.map((reference) => reference.documentId),
    ...manifest.novel.chapters,
  ]
  if (
    expectedIds.length !== manifest.documents.length ||
    expectedIds.some((id, index) => manifest.documents[index]?.id !== id)
  ) {
    fail("NOVELX_STORY_DOCUMENT_SET_INVALID", "Story documents do not match history → references → novel order.")
  }
  manifest.documents.forEach((document, index) => {
    if (
      document.ordinal !== index + 1 ||
      !safeRelativePath(document.targetPath) ||
      !document.targetPath.startsWith(`${NovelXStory.STORY_DIRECTORY}/`)
    ) {
      fail("NOVELX_STORY_DOCUMENT_SET_INVALID", `Invalid story document record ${document.id}.`)
    }
    if (document.draftPath !== `${NovelXStory.DRAFT_DIRECTORY}/${document.id}.md`) {
      fail("NOVELX_STORY_DOCUMENT_SET_INVALID", `Invalid draft path for ${document.id}.`)
    }
    if (document.status === "committed" && (!document.committedSha256 || !document.taskSessionId || document.lease)) {
      fail("NOVELX_STORY_DOCUMENT_COMMIT_INVALID", `Committed story document ${document.id} is inconsistent.`)
    }
    for (const upstreamId of document.upstreamDocumentIds) {
      const upstream = manifest.documents.find((candidate) => candidate.id === upstreamId)
      if (!upstream || upstream.ordinal >= document.ordinal) {
        fail("NOVELX_STORY_DEPENDENCY_INVALID", `${document.id} has a non-causal dependency.`)
      }
    }
  })
  if (manifest.schemaVersion === 2) {
    const documents = new Map(manifest.documents.map((document) => [document.id, document]))
    const novelDocuments = manifest.novel.chapters.map((id) => documents.get(id)!)
    const committedNovelDocuments = novelDocuments.filter((document) => document.status === "committed")
    if (committedNovelDocuments.length) {
      const first = novelDocuments[0]!
      if (first.status !== "committed" || !first.taskSessionId) {
        fail(
          "NOVELX_STORY_NOVEL_WRITER_SESSION_REQUIRED",
          "Committed novel chapters require the committed first chapter writer task session.",
        )
      }
      if (committedNovelDocuments.some((document) => document.taskSessionId !== first.taskSessionId)) {
        fail(
          "NOVELX_STORY_NOVEL_WRITER_SESSION_INVALID",
          "All committed novel chapters must share the first chapter writer task session.",
        )
      }
    }
  }
  if (manifest.status === "text_completed" && manifest.documents.some((document) => document.status !== "committed")) {
    fail("NOVELX_STORY_TEXT_INCOMPLETE", "Text-completed story contains unfinished documents.")
  }
  return manifest
}

function documentRecord(
  input: Omit<
    NovelXStory.DocumentRecord,
    "draftPath" | "status" | "lease" | "taskSessionId" | "committedSha256" | "updatedAt" | "errorCode"
  > & { now: number },
): NovelXStory.DocumentRecord {
  const { now, ...record } = input
  return {
    ...record,
    draftPath: `${NovelXStory.DRAFT_DIRECTORY}/${record.id}.md`,
    status: "registered",
    lease: null,
    taskSessionId: null,
    committedSha256: null,
    updatedAt: now,
    errorCode: null,
  }
}

function contextDocument(record: NovelXStory.DocumentRecord) {
  return {
    id: record.id,
    kind: record.kind,
    workId: record.workId,
    title: record.title,
    author: record.author,
    kindLabel: record.kindLabel,
    brief: record.brief,
    ordinal: record.ordinal,
    sourceEntityIds: record.sourceEntityIds,
    sourceSha256s: record.sourceSha256s,
    upstreamDocumentIds: record.upstreamDocumentIds,
    targetPath: record.targetPath,
    draftPath: record.draftPath,
  }
}

function normalizeStoryDocument(
  current: NovelXStory.Materialization,
  record: NovelXStory.DocumentRecord,
  value: string,
) {
  const normalized = normalizeMarkdown(value)
  if (!normalized.startsWith(`# ${record.title}\n`))
    fail("NOVELX_STORY_DOCUMENT_TITLE_INVALID", `${record.targetPath} must start with its exact title.`)
  const minimum = record.kind === "novel_chapter" ? 1_500 : record.kind === "history_chapter" ? 1_200 : 300
  const maximum = record.kind === "reference_document" ? 12_000 : 20_000
  if (normalized.length < minimum || normalized.length > maximum) {
    fail(
      "NOVELX_STORY_DOCUMENT_LENGTH_INVALID",
      `${record.targetPath} must contain ${minimum} to ${maximum} readable characters.`,
    )
  }
  if (
    /(?:阶段主编|执行\s*Agent|\bAgent\b|\bPrompt\b|\bHarness\b|\btask\s+session\s*(?:id|identifier)?\b|\bsession\s+(?:id|identifier)\b|\btool\s*call\b|sourceSha256|contextSha256|integritySha256|\.novelx\/|注册(?:骨架|实体)|工具调用|待填充|待补充|TODO|TBD|作为AI|无法确定)/iu.test(
      normalized,
    )
  ) {
    fail("NOVELX_STORY_DOCUMENT_INTERNAL_LEAK", `${record.targetPath} exposes orchestration or placeholder text.`)
  }
  const grounding = inspectSourceTitleGrounding({
    markdown: normalized,
    requiredSourceEntityIds: record.sourceEntityIds,
    worldSources: current.world.sources,
  })
  if (grounding.missingTitles.length) {
    fail(
      "NOVELX_STORY_SOURCE_TITLE_MISSING",
      `${record.targetPath} is missing exact frozen source titles: ${grounding.missingTitles
        .map((title) => JSON.stringify(title))
        .join(", ")}.`,
    )
  }
  if (grounding.confusableDrifts.length) {
    fail(
      "NOVELX_STORY_PROPER_NAME_DRIFT",
      `${record.targetPath} contains confusable frozen proper-name drift: ${grounding.confusableDrifts
        .map((drift) => `${JSON.stringify(drift.candidate)} != ${JSON.stringify(drift.authoritativePrefix)}`)
        .join(", ")}.`,
    )
  }
  return normalized
}

function exactSourceTitles(current: NovelXStory.Materialization, record: NovelXStory.DocumentRecord) {
  const sources = new Map(current.world.sources.map((source) => [source.entityId, source]))
  return [
    ...new Set(
      record.sourceEntityIds.map((entityId) => {
        const source = sources.get(entityId)
        if (!source) fail("NOVELX_STORY_SOURCE_UNKNOWN", `${record.id} cites unknown source ${entityId}.`)
        return source.title
      }),
    ),
  ]
}

function requireStoryContinuityAuthority(
  current: NovelXStory.Materialization,
  authority: StoryContinuityAuthority | undefined,
) {
  if (current.schemaVersion === 1) return null
  if (!authority) {
    fail(
      "NOVELX_STORY_CONTINUITY_AUTHORITY_REQUIRED",
      "Story v2 requires continuity authority from the completed Character materialization.",
    )
  }
  if (authority.id !== current.protagonist?.id || authority.name !== current.protagonist.name) {
    fail(
      "NOVELX_STORY_CONTINUITY_PROTAGONIST_MISMATCH",
      "The continuity authority does not belong to the frozen Story protagonist source.",
    )
  }
  if (!authority.openingState.trim() || !authority.wound.trim() || !authority.initialRelationships.length) {
    fail("NOVELX_STORY_CONTINUITY_AUTHORITY_INVALID", "The Character continuity authority is incomplete.")
  }
  return authority
}

function novelContinuityContext(
  current: NovelXStory.Materialization,
  record: NovelXStory.DocumentRecord,
  committedContents: Record<string, string>,
  authority: StoryContinuityAuthority,
) {
  const anchors = requiredOpeningAnchors(current, authority)
  if (anchors.length < 3) {
    fail(
      "NOVELX_STORY_OPENING_ANCHORS_INSUFFICIENT",
      "The first novel brief and sealed opening state must share at least three exact Chinese continuity anchors.",
    )
  }
  const chapterIndex = current.novel?.chapters.indexOf(record.id) ?? -1
  if (chapterIndex < 0) fail("NOVELX_STORY_NOVEL_DOCUMENT_INVALID", `${record.id} is not a registered novel chapter.`)
  const first = requireDocument(current, current.novel!.chapters[0]!)
  if (chapterIndex > 0 && (first.status !== "committed" || !first.taskSessionId)) {
    fail(
      "NOVELX_STORY_NOVEL_WRITER_SESSION_REQUIRED",
      "Later novel chapters require the committed first chapter writer task session.",
    )
  }
  const previousId = chapterIndex > 0 ? current.novel?.chapters[chapterIndex - 1] : undefined
  const previous = previousId ? requireDocument(current, previousId) : undefined
  const previousMarkdown = previous ? requireCommittedContent(current, previous.id, committedContents) : undefined
  return {
    openingState: authority.openingState,
    wound: authority.wound,
    relationships: [...authority.initialRelationships],
    requiredOpeningAnchors: chapterIndex === 0 ? anchors : [],
    novelWriterTaskSessionId: chapterIndex === 0 ? null : first.taskSessionId,
    previousNovelChapter:
      previous && previousMarkdown
        ? { title: previous.title, endingExcerpt: [...previousMarkdown.trimEnd()].slice(-1_200).join("") }
        : null,
  }
}

function requiredOpeningAnchors(current: NovelXStory.Materialization, authority: StoryContinuityAuthority) {
  const firstId = current.novel?.chapters[0]
  if (!firstId) fail("NOVELX_STORY_NOVEL_DOCUMENT_INVALID", "Story Growth has no registered first novel chapter.")
  return longestCommonHanFragments(requireDocument(current, firstId).brief, authority.openingState)
}

function assertNovelWriterSession(
  current: NovelXStory.Materialization,
  record: NovelXStory.DocumentRecord,
  taskSessionId: string,
) {
  if (current.schemaVersion !== 2 || record.kind !== "novel_chapter") return
  const firstId = current.novel?.chapters[0]
  if (!firstId) fail("NOVELX_STORY_NOVEL_DOCUMENT_INVALID", "Story Growth has no registered first novel chapter.")
  const first = requireDocument(current, firstId)
  if (record.id === first.id) {
    if (first.status === "committed" && first.taskSessionId !== taskSessionId) {
      fail(
        "NOVELX_STORY_NOVEL_WRITER_SESSION_INVALID",
        "Replaying the first novel chapter requires its original writer task session.",
      )
    }
    return
  }
  if (first.status !== "committed" || !first.taskSessionId) {
    fail(
      "NOVELX_STORY_NOVEL_WRITER_SESSION_REQUIRED",
      "Later novel chapters require the committed first chapter writer task session.",
    )
  }
  if (taskSessionId !== first.taskSessionId) {
    fail(
      "NOVELX_STORY_NOVEL_WRITER_SESSION_INVALID",
      `All novel chapters must resume the first chapter writer task session ${first.taskSessionId}.`,
    )
  }
}

function requireCommittedContent(
  current: NovelXStory.Materialization,
  documentId: string,
  contents: Record<string, string>,
) {
  const record = requireDocument(current, documentId)
  const value = contents[documentId]
  if (record.status !== "committed" || !value || worldSha256(normalizeMarkdown(value)) !== record.committedSha256) {
    fail("NOVELX_STORY_DEPENDENCY_INCOMPLETE", `Committed content for ${record.title} is missing or stale.`)
  }
  return normalizeMarkdown(value)
}

function protagonistContext(current: NovelXStory.Materialization, markdown: string | undefined) {
  if (current.schemaVersion === 1) return null
  const protagonist = current.protagonist
  if (!protagonist) fail("NOVELX_STORY_CHARACTER_REQUIRED", "Story v2 is missing its protagonist source.")
  if (!markdown || worldSha256(normalizeMarkdown(markdown)) !== protagonist.sha256) {
    fail("NOVELX_STORY_CHARACTER_SOURCE_DRIFT", `Frozen protagonist source ${protagonist.path} is missing or changed.`)
  }
  return { ...protagonist, markdown: normalizeMarkdown(markdown) }
}

function requireDocument(current: NovelXStory.Materialization, id: string) {
  const record = current.documents.find((document) => document.id === id)
  if (!record) fail("NOVELX_STORY_DOCUMENT_UNKNOWN", `Unknown story document ${id}.`)
  return record
}

function assertEditor(current: NovelXStory.Materialization, editorSessionId: string) {
  if (current.editorSessionId !== editorSessionId)
    fail("NOVELX_STORY_EDITOR_SESSION_INVALID", "Only the bound Story editor may mutate this run.")
}

function updateDocument<T extends NovelXStory.Materialization>(
  current: T,
  record: NovelXStory.DocumentRecord,
  now: number,
): T {
  return withIntegrity({
    ...withoutIntegrity(current),
    updatedAt: now,
    documents: current.documents.map((candidate) => (candidate.id === record.id ? record : candidate)),
  }) as unknown as T
}

function withoutIntegrity<T extends NovelXStory.Materialization>(current: T): Omit<T, "integritySha256"> {
  const { integritySha256: _, ...draft } = current
  return draft
}

function withIntegrity<T extends Record<string, unknown>>(draft: T): T & { integritySha256: string } {
  return { ...draft, integritySha256: worldSha256(draft) }
}

function normalizeMarkdown(value: string) {
  return value.replaceAll("\r\n", "\n").trim() + "\n"
}

function stableId(...parts: Array<string | number>) {
  return `nx-${worldSha256(parts).slice(0, 24)}`
}

function sha256(value: string, field: string) {
  if (!/^[a-f0-9]{64}$/u.test(value)) fail("NOVELX_STORY_SHA256_INVALID", `${field} is not a SHA-256 digest.`)
  return value
}

function concreteLabel(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (!normalized || normalized.length > 120 || /(?:待命名|未命名|待填充|TODO|TBD)/iu.test(normalized)) {
    fail("NOVELX_STORY_TEXT_INVALID", `${field} must contain a concrete name.`)
  }
  return normalized
}

function detail(value: string, field: string) {
  const normalized = value.trim().replace(/\s+/gu, " ")
  if (normalized.length < 8 || normalized.length > 2_400 || /(?:待填充|待补充|TODO|TBD)/iu.test(normalized)) {
    fail("NOVELX_STORY_DETAIL_INVALID", `${field} must contain concrete content.`)
  }
  return normalized
}

function safePath(value: string) {
  if (!safeRelativePath(value)) fail("NOVELX_STORY_TARGET_PATH_INVALID", `Unsafe project path ${value}.`)
  return value.replaceAll("\\", "/")
}

function safeRelativePath(value: string) {
  const normalized = value.replaceAll("\\", "/")
  return !normalized.startsWith("/") && !normalized.includes("..") && !/[<>:"|?*\u0000-\u001f]/u.test(normalized)
}

function safeSegment(value: string) {
  const normalized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-")
    .replace(/[. ]+$/u, "")
    .trim()
    .slice(0, 80)
  if (!normalized) fail("NOVELX_STORY_TARGET_PATH_INVALID", "A story path segment is empty.")
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(normalized) ? `${normalized}-项目` : normalized
}

function unique(values: string[], field: string) {
  const normalized = values.map((value) => value.toLocaleLowerCase("zh-CN"))
  if (new Set(normalized).size !== normalized.length)
    fail("NOVELX_STORY_VALUE_DUPLICATE", `Duplicate ${field} values are not allowed.`)
}

function fail(code: string, message: string): never {
  throw new StoryMaterializationError(code, message)
}
