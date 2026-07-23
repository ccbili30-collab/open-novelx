import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { NovelXCharacterVisual } from "@opencode-ai/schema/novelx-character-visual"
import {
  characterPortraitProviderPrompt,
  compileCharacterVisual,
  retryCharacterPortraitTask,
  updateCharacterPortraitTask,
  verifyCharacterVisual,
} from "../../src/novelx/character-visual"
import { completedCharacterFixture } from "./character-visual.fixture"
import { worldSha256 } from "../../src/novelx/world-blueprint"

describe("NovelX canonical character portrait", () => {
  test("compiles exactly one source-bound portrait with the approved composition", () => {
    const character = completedCharacterFixture().manifest
    const manifest = compileCharacterVisual({
      character,
      editorSessionId: "ses-visual-editor",
      visualLanguage: "冷色写实奇幻，重视寒地材料、磨损痕迹和自然散射光，不采用现代摄影棚背景。",
      prompt: "弥娅站在封关前的雪路边，灰白发梢、旧驼绒斗篷、黄铜关印和冻伤左手均清晰可辨。",
      now: 100,
    })

    expect(manifest.status).toBe("queued")
    expect(manifest.task).toMatchObject({
      type: "individual",
      subtype: "canonical_portrait",
      ownerId: character.protagonist!.id,
      aspect: "portrait",
      composition: { ratio: "2:3", faceView: "three_quarter", crop: "upper_two_thirds" },
      sourceDocumentId: character.document!.id,
      sourceDocumentSha256: character.document!.committedSha256,
      sourceEntityIds: ["world-north"],
      targetPath: `Characters/Media/portraits/${character.protagonist!.id}.png`,
    })
    const decoded = Schema.decodeUnknownSync(NovelXCharacterVisual.Manifest)(JSON.parse(JSON.stringify(manifest)))
    expect(verifyCharacterVisual(decoded, character)).toEqual(decoded)
  })

  test("rejects a source list whose IDs and hashes no longer pair exactly", () => {
    const character = completedCharacterFixture().manifest
    const manifest = compileCharacterVisual({
      character,
      editorSessionId: "ses-visual-editor",
      visualLanguage: "冷色写实奇幻，重视寒地材料、磨损痕迹和自然散射光，不采用现代摄影棚背景。",
      prompt: "弥娅站在封关前的雪路边，灰白发梢、旧驼绒斗篷、黄铜关印和冻伤左手均清晰可辨。",
      now: 100,
    })
    const { integritySha256: _, ...draft } = manifest
    const changed = { ...draft, task: { ...draft.task, sourceSha256s: [] } }

    expect(() => verifyCharacterVisual({ ...changed, integritySha256: worldSha256(changed) }, character)).toThrow(
      "NOVELX_CHARACTER_PORTRAIT_SOURCE_DRIFT",
    )
  })

  test("freezes the provider prompt and reaches an explicit terminal state", () => {
    const character = completedCharacterFixture().manifest
    let manifest = compileCharacterVisual({
      character,
      editorSessionId: "ses-visual-editor",
      visualLanguage: "冷色写实奇幻，重视寒地材料、磨损痕迹和自然散射光，不采用现代摄影棚背景。",
      prompt: "弥娅站在封关前的雪路边，灰白发梢、旧驼绒斗篷、黄铜关印和冻伤左手均清晰可辨。",
      now: 100,
    })
    const providerPrompt = characterPortraitProviderPrompt(manifest)
    manifest = updateCharacterPortraitTask({ manifest, status: "generating", now: 110, model: "test/image" })
    manifest = updateCharacterPortraitTask({ manifest, status: "validating", now: 120 })
    manifest = updateCharacterPortraitTask({
      manifest,
      status: "attached",
      now: 130,
      mime: "image/png",
      assetSha256: "b".repeat(64),
    })
    expect(manifest.status).toBe("ready")
    expect(characterPortraitProviderPrompt(manifest)).toBe(providerPrompt)

    let failed = compileCharacterVisual({
      character,
      editorSessionId: "ses-visual-editor",
      visualLanguage: "冷色写实奇幻，重视寒地材料、磨损痕迹和自然散射光，不采用现代摄影棚背景。",
      prompt: "弥娅站在封关前的雪路边，灰白发梢、旧驼绒斗篷、黄铜关印和冻伤左手均清晰可辨。",
      now: 100,
    })
    for (let attempt = 0; attempt < 3; attempt++) {
      failed = updateCharacterPortraitTask({ manifest: failed, status: "generating", now: 140 + attempt * 2 })
      failed = updateCharacterPortraitTask({
        manifest: failed,
        status: "failed",
        now: 141 + attempt * 2,
        errorCode: "NOVELX_IMAGE_PROVIDER_FAILED",
      })
    }
    expect(failed.status).toBe("failed")
    expect(() => updateCharacterPortraitTask({ manifest: failed, status: "generating", now: 200 })).toThrow(
      "NOVELX_CHARACTER_PORTRAIT_TRANSITION_INVALID",
    )
    const retried = retryCharacterPortraitTask(failed, 210)
    expect(retried).toMatchObject({ status: "queued", task: { status: "queued", attempts: 0, errorCode: null } })
    expect(verifyCharacterVisual(retried, character)).toEqual(retried)
  })
})
