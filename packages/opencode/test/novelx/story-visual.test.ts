import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import * as NovelXStoryVisual from "@opencode-ai/schema/novelx-story-visual"
import {
  compileStoryVisual,
  storyCoverProviderPrompt,
  updateStoryImageTask,
  verifyStoryVisual,
} from "../../src/novelx/story-visual"
import { finishStoryText } from "../../src/novelx/story-materialization"
import { registeredStoryFixture } from "./story-visual.fixture"

describe("NovelX story covers", () => {
  test("requires one novel, every history book and one theme cover", () => {
    const story = finishStoryText({
      manifest: registeredStoryFixture(),
      editorSessionId: "ses-story-editor",
      now: 700,
    })
    const owners = [story.novel.id, ...story.historyBooks.map((book) => book.id), story.novel.theme.id]
    const manifest = compileStoryVisual({
      story,
      editorSessionId: "ses-cover-editor",
      visualLanguage: "延续灰潮大陆的冷色写实奇幻视觉，以风雪、磨损金属、旧纸和边境火光形成统一识别。",
      covers: owners.map((ownerId, index) => ({
        ownerId,
        prompt: `最终封面提示词 ${index + 1}：完整构图，保留清晰标题区，表现作品独有的时代压力。`,
      })),
      now: 800,
    })

    expect(manifest.tasks.map((task) => task.subtype)).toEqual(["novel", "history", "theme"])
    expect(manifest.tasks.map((task) => task.aspect)).toEqual(["portrait", "portrait", "landscape"])
    expect(manifest.tasks.every((task) => task.type === "cover")).toBe(true)
    expect(manifest.tasks.map((task) => task.prompt)).toEqual([
      "最终封面提示词 1：完整构图，保留清晰标题区，表现作品独有的时代压力。",
      "最终封面提示词 2：完整构图，保留清晰标题区，表现作品独有的时代压力。",
      "最终封面提示词 3：完整构图，保留清晰标题区，表现作品独有的时代压力。",
    ])
    expect(storyCoverProviderPrompt(manifest, manifest.tasks[0]!)).toBe(
      `${manifest.visualLanguage}\n\n${manifest.tasks[0]!.prompt}`,
    )
    expect(verifyStoryVisual(manifest, story)).toEqual(manifest)
  })

  test("rejects a missing mandatory cover and projects attached/failed terminal states", () => {
    const story = finishStoryText({
      manifest: registeredStoryFixture(),
      editorSessionId: "ses-story-editor",
      now: 700,
    })
    expect(() =>
      compileStoryVisual({
        story,
        editorSessionId: "ses-cover-editor",
        visualLanguage: "延续同一个世界的视觉语言，保持时代、材质和地理气候的一致性。",
        covers: [{ ownerId: story.novel.id, prompt: "绘制小说主封面的最终构图。" }],
        now: 800,
      }),
    ).toThrow("NOVELX_STORY_COVER_REQUIRED")

    const owners = [story.novel.id, ...story.historyBooks.map((book) => book.id), story.novel.theme.id]
    let manifest = compileStoryVisual({
      story,
      editorSessionId: "ses-cover-editor",
      visualLanguage: "延续灰潮大陆的冷色写实奇幻视觉，以风雪、磨损金属、旧纸和边境火光形成统一识别。",
      covers: owners.map((ownerId) => ({
        ownerId,
        prompt: "这是直接提交图片模型的最终提示词，包含完整环境线索与明确题名区。",
      })),
      now: 800,
    })
    const [first, second, third] = manifest.tasks
    manifest = updateStoryImageTask({ manifest, taskId: first!.id, status: "generating", now: 810, model: "test/image" })
    manifest = updateStoryImageTask({ manifest, taskId: first!.id, status: "validating", now: 820 })
    manifest = updateStoryImageTask({
      manifest,
      taskId: first!.id,
      status: "attached",
      now: 830,
      mime: "image/png",
      assetSha256: "a".repeat(64),
    })
    for (let attempt = 0; attempt < 3; attempt++) {
      manifest = updateStoryImageTask({ manifest, taskId: second!.id, status: "generating", now: 840 + attempt * 2 })
      manifest = updateStoryImageTask({
        manifest,
        taskId: second!.id,
        status: "failed",
        now: 841 + attempt * 2,
        errorCode: "NOVELX_IMAGE_PROVIDER_FAILED",
      })
    }
    manifest = updateStoryImageTask({ manifest, taskId: third!.id, status: "generating", now: 900 })
    manifest = updateStoryImageTask({ manifest, taskId: third!.id, status: "validating", now: 901 })
    manifest = updateStoryImageTask({
      manifest,
      taskId: third!.id,
      status: "attached",
      now: 902,
      mime: "image/png",
      assetSha256: "b".repeat(64),
    })

    expect(manifest.status).toBe("partial")
    expect(manifest.tasks.find((task) => task.id === second!.id)?.attempts).toBe(3)
  })

  test("worker state transitions never rewrite the tool branch final prompt", () => {
    const story = finishStoryText({
      manifest: registeredStoryFixture(),
      editorSessionId: "ses-story-editor",
      now: 700,
    })
    const owners = [story.novel.id, ...story.historyBooks.map((book) => book.id), story.novel.theme.id]
    let manifest = compileStoryVisual({
      story,
      editorSessionId: "ses-cover-editor",
      visualLanguage: "延续灰潮大陆的冷色写实奇幻视觉，以风雪、磨损金属、旧纸和边境火光形成统一识别。",
      covers: owners.map((ownerId) => ({
        ownerId,
        prompt: `直接提交图片模型的最终提示词：${ownerId}，不得由 Worker 改写。`,
      })),
      now: 800,
    })
    const first = manifest.tasks[0]!
    const finalPrompt = first.prompt
    manifest = updateStoryImageTask({ manifest, taskId: first.id, status: "generating", now: 810 })
    manifest = updateStoryImageTask({ manifest, taskId: first.id, status: "validating", now: 811 })
    manifest = updateStoryImageTask({
      manifest,
      taskId: first.id,
      status: "attached",
      now: 812,
      mime: "image/png",
      assetSha256: "d".repeat(64),
    })
    expect(manifest.tasks[0]?.prompt).toBe(finalPrompt)
    const decoded = Schema.decodeUnknownSync(NovelXStoryVisual.Manifest)(JSON.parse(JSON.stringify(manifest)))
    expect(verifyStoryVisual(decoded, story)).toEqual(decoded)
  })
})
