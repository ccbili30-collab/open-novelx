const NOVELX_GROWTH_AGENTS = new Set([
  "growth",
  "novelx-stage-editor",
  "novelx-visual-editor",
  "novelx-publication-editor",
  "novelx-story-editor",
  "novelx-character-editor",
  "novelx-geography",
  "novelx-world-writer",
  "novelx-world-prose-writer",
  "novelx-story-writer",
  "novelx-character-writer",
])

export function isNovelXGrowthAgent(agent: string | undefined) {
  return !!agent && NOVELX_GROWTH_AGENTS.has(agent)
}
