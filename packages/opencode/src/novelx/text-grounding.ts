export type TextGroundingSource = {
  entityId: string
  title: string
}

export type ConfusableProperNameDrift = {
  sourceTitle: string
  authoritativePrefix: string
  candidate: string
}

export function inspectSourceTitleGrounding(input: {
  markdown: string
  requiredSourceEntityIds: readonly string[]
  worldSources: readonly TextGroundingSource[]
}) {
  const sources = new Map(input.worldSources.map((source) => [source.entityId, source]))
  const requiredTitles = [
    ...new Set(
      input.requiredSourceEntityIds
        .map((entityId) => sources.get(entityId)?.title)
        .filter((title): title is string => title !== undefined),
    ),
  ]
  return {
    missingTitles: requiredTitles.filter((title) => !input.markdown.includes(title)),
    confusableDrifts: findConfusableProperNameDrifts(input.markdown, input.worldSources),
  }
}

export function longestCommonHanFragments(left: string, right: string, minimumLength = 3) {
  const candidates = new Set<string>()
  const leftRuns = left.match(/\p{Script=Han}+/gu) ?? []
  const rightRuns = right.match(/\p{Script=Han}+/gu) ?? []

  for (const leftRun of leftRuns) {
    const leftCharacters = [...leftRun]
    for (const rightRun of rightRuns) {
      const rightCharacters = [...rightRun]
      let previous = new Uint16Array(rightCharacters.length + 1)
      for (let leftIndex = 1; leftIndex <= leftCharacters.length; leftIndex++) {
        const current = new Uint16Array(rightCharacters.length + 1)
        for (let rightIndex = 1; rightIndex <= rightCharacters.length; rightIndex++) {
          if (leftCharacters[leftIndex - 1] !== rightCharacters[rightIndex - 1]) continue
          current[rightIndex] = previous[rightIndex - 1]! + 1
          const length = current[rightIndex]!
          if (length < minimumLength) continue
          if (
            leftIndex < leftCharacters.length &&
            rightIndex < rightCharacters.length &&
            leftCharacters[leftIndex] === rightCharacters[rightIndex]
          ) {
            continue
          }
          candidates.add(leftCharacters.slice(leftIndex - length, leftIndex).join(""))
        }
        previous = current
      }
    }
  }

  const maximal = [...candidates]
    .sort((first, second) => second.length - first.length || first.localeCompare(second, "zh-CN"))
    .filter((fragment, index, sorted) => !sorted.slice(0, index).some((longer) => longer.includes(fragment)))
  return maximal.sort(
    (first, second) =>
      left.indexOf(first) - left.indexOf(second) ||
      right.indexOf(first) - right.indexOf(second) ||
      second.length - first.length ||
      first.localeCompare(second, "zh-CN"),
  )
}

function findConfusableProperNameDrifts(markdown: string, worldSources: readonly TextGroundingSource[]) {
  const prefixes = [
    ...new Map(
      worldSources
        .flatMap((source) =>
          hanPrefixes(source.title).map((authoritativePrefix, index) => ({
            sourceTitle: source.title,
            authoritativePrefix,
            isLongest: index === 0,
          })),
        )
        .map((entry) => [entry.authoritativePrefix, entry]),
    ).values(),
  ]
  const authoritative = new Set(prefixes.map((entry) => entry.authoritativePrefix))
  const runs = markdown.match(/\p{Script=Han}+/gu) ?? []
  const drifts = new Map<string, ConfusableProperNameDrift>()

  for (const entry of prefixes) {
    const expected = [...entry.authoritativePrefix]
    for (const run of runs) {
      const characters = [...run]
      for (let index = 0; index <= characters.length - expected.length; index++) {
        const candidate = characters.slice(index, index + expected.length).join("")
        if (candidate === entry.authoritativePrefix || authoritative.has(candidate)) continue
        if (isNumericOrMeasureBoundary(characters[index + expected.length - 1])) continue
        if (!isProperNameRightBoundary(characters[index + expected.length])) continue
        const differenceIndex = hammingDifferenceIndex(expected, characters, index)
        if (
          differenceIndex === undefined ||
          (differenceIndex === expected.length - 1 && !isProperNameEnding(characters[index + expected.length - 1]))
        ) {
          continue
        }
        drifts.set(`${entry.sourceTitle}\u0000${candidate}`, {
          sourceTitle: entry.sourceTitle,
          authoritativePrefix: entry.authoritativePrefix,
          candidate,
        })
      }
    }
  }
  return [...drifts.values()]
}

function isProperNameRightBoundary(character: string | undefined) {
  if (character === undefined) return true
  return (
    isNumericOrMeasureBoundary(character) ||
    /^[的了着过和与及或在于从向往对把被将由以为是有无中内外上下来前后旁边时里便则乃亦却仍又才就会能可需须应曾正并未已要让使给随因若虽但而]$/u.test(
      character,
    )
  )
}

function isNumericOrMeasureBoundary(character: string | undefined) {
  if (character === undefined) return false
  return /^[0-9０-９零〇一二三四五六七八九十百千万亿两几第每各数多半壹贰叁肆伍陆柒捌玖拾佰仟个只条座片群支枚道处名位段层场次种部艘队所间株棵头轮份批件年]$/u.test(
    character,
  )
}

function hanPrefixes(title: string) {
  const characters = [...title]
  const length = characters.findIndex((character) => !/\p{Script=Han}/u.test(character))
  const prefix = characters.slice(0, length === -1 ? characters.length : length)
  return Array.from({ length: Math.max(0, prefix.length - 2) }, (_, index) =>
    prefix.slice(0, prefix.length - index).join(""),
  ).filter((candidate, index) => index === 0 || isProperNameEnding([...candidate].at(-1)))
}

function isProperNameEnding(character: string | undefined) {
  return (
    character !== undefined &&
    /^[山岭峰脉系河江湖海湾洋洲岛原漠林谷地城镇村港关院社会盟国邦领宫殿寺教团舰站域带路道矿井塔门桥渠坝仓场厂星球月环庭署司部队族民]$/u.test(
      character,
    )
  )
}

function hammingDifferenceIndex(expected: readonly string[], candidate: readonly string[], offset: number) {
  let differenceIndex: number | undefined
  for (let index = 0; index < expected.length; index++) {
    if (expected[index] === candidate[offset + index]) continue
    if (differenceIndex !== undefined) return undefined
    differenceIndex = index
  }
  return differenceIndex
}
