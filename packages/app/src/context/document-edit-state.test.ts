import { describe, expect, test } from "bun:test"
import {
  createDocumentEditState,
  documentConflicted,
  documentEdited,
  documentExternalChanged,
  documentLoaded,
  documentHasUnsavedChanges,
  documentSaveFailed,
  documentSaved,
  documentSaving,
  joinFrontMatter,
  markdownVisualSupport,
  preserveMarkdownLineEndings,
  preserveSourceLineEndings,
  splitFrontMatter,
} from "./document-edit-state"

describe("document edit state", () => {
  test("tracks exact baselines through load, edit, save, and a reverted draft", () => {
    const loading = createDocumentEditState("World/北境.md")
    expect(loading).toMatchObject({ path: "World/北境.md", status: "loading", baseline: "", draft: "" })

    const loaded = documentLoaded(loading, { content: "# 北境\r\n\r\n雪。\r\n", bom: true })
    expect(loaded).toMatchObject({ status: "clean", bom: true, baseline: "# 北境\r\n\r\n雪。\r\n" })

    const dirty = documentEdited(loaded, "# 北境\r\n\r\n终年积雪。\r\n")
    expect(dirty.status).toBe("dirty")
    expect(documentEdited(dirty, loaded.baseline).status).toBe("clean")

    const saving = documentSaving(dirty)
    expect(saving.status).toBe("saving")
    expect(documentSaved(saving).status).toBe("clean")
    expect(documentSaved(saving).baseline).toBe(dirty.draft)
  })

  test("keeps a dirty draft on save failure, conflict, and external modification", () => {
    const dirty = documentEdited(
      documentLoaded(createDocumentEditState("World/map.md"), { content: "old", bom: false }),
      "mine",
    )
    expect(documentSaveFailed(documentSaving(dirty), "disk full")).toMatchObject({
      status: "error",
      draft: "mine",
      baseline: "old",
      error: "disk full",
    })
    expect(documentConflicted(documentSaving(dirty))).toMatchObject({
      status: "conflict",
      draft: "mine",
      baseline: "old",
      externalChanged: true,
    })
    expect(documentExternalChanged(dirty)).toMatchObject({ status: "dirty", externalChanged: true, draft: "mine" })
    expect(documentHasUnsavedChanges(documentSaveFailed(documentSaving(dirty), "disk full"))).toBe(true)
    expect(documentHasUnsavedChanges(documentConflicted(documentSaving(dirty)))).toBe(true)
  })

  test("marks a clean externally changed document for a safe reload", () => {
    const clean = documentLoaded(createDocumentEditState("World/map.md"), { content: "old", bom: false })
    expect(documentExternalChanged(clean)).toMatchObject({ status: "loading", externalChanged: true })
  })

  test("does not treat a read failure with no draft as unsaved work", () => {
    const failed = documentSaveFailed(createDocumentEditState("image.png"), "binary")
    expect(documentHasUnsavedChanges(failed)).toBe(false)
  })
})

describe("Markdown visual editing boundary", () => {
  test("preserves YAML front matter byte-for-byte around a visual body", () => {
    const text = "---\r\ntitle: 北境\r\ntags: [冰雪]\r\n---\r\n# 北境\r\n\r\n正文\r\n"
    const split = splitFrontMatter(text)
    expect(split).toEqual({
      frontMatter: "---\r\ntitle: 北境\r\ntags: [冰雪]\r\n---\r\n",
      body: "# 北境\r\n\r\n正文\r\n",
    })
    expect(joinFrontMatter(split.frontMatter, split.body)).toBe(text)
  })

  test("does not mistake an unclosed front matter marker for metadata", () => {
    expect(splitFrontMatter("---\ntitle: draft\n# Body")).toEqual({
      frontMatter: "",
      body: "---\ntitle: draft\n# Body",
    })
  })

  test("keeps the loaded document's line ending and trailing-newline convention after visual serialization", () => {
    expect(preserveMarkdownLineEndings("# 北境\n\n新正文", "# 北境\r\n\r\n旧正文\r\n")).toBe("# 北境\r\n\r\n新正文\r\n")
    expect(preserveMarkdownLineEndings("text", "old")).toBe("text")
  })

  test("restores CRLF after a textarea normalizes source input to LF", () => {
    expect(preserveSourceLineEndings("# 北境\n\n新正文\n", "# 北境\r\n\r\n旧正文\r\n")).toBe("# 北境\r\n\r\n新正文\r\n")
    expect(preserveSourceLineEndings("one\r\ntwo", "one\ntwo")).toBe("one\ntwo")
  })

  test("allows CommonMark but fails closed for syntax the visual editor cannot round-trip", () => {
    expect(markdownVisualSupport("# Title\n\n- item\n\n```html\n<table></table>\n```")).toEqual({ supported: true })

    const unsupported = [
      ["<section>raw</section>", "raw-html"],
      ["| A | B |\n|---|---|\n| 1 | 2 |", "table"],
      ["- [x] done", "task-list"],
      ["A note[^1]\n\n[^1]: detail", "footnote"],
      ["$$\nx + y\n$$", "math"],
      [":::warning\ntext\n:::", "directive"],
    ] as const

    for (const [source, reason] of unsupported) {
      expect(markdownVisualSupport(source)).toEqual({ supported: false, reason })
    }
  })
})
