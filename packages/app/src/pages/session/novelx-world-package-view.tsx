import { For, Show, createMemo, createSignal } from "solid-js"
import type { NovelXWorldPackage } from "@/novelx/world-package"
import { createNovelXWorldPackageStars, excerptNovelXWorldPackage } from "@/novelx/world-package"
import { downloadNovelXWorldPackage } from "@/novelx/world-package-export"
import "./novelx-world-package.css"

const PAGE_NAMES = ["封面", "世界地图", "历史与小说", "人物群像", "世界图谱"] as const
type MapMode = "idle" | "preview" | "detail"

export function NovelXWorldPackageView(props: {
  package: () => NovelXWorldPackage
  onOpenSource?: (path: string) => void
}) {
  const pkg = props.package
  const [opened, setOpened] = createSignal(false)
  const [page, setPage] = createSignal(0)
  const [locked, setLocked] = createSignal(false)
  const [mapMode, setMapMode] = createSignal<MapMode>("idle")
  const [activeRegion, setActiveRegion] = createSignal<string>()
  const [activeArchive, setActiveArchive] = createSignal<string>()
  const [activeCharacter, setActiveCharacter] = createSignal<string>()
  let dragStart = 0
  let dragDelta = 0

  const stars = createMemo(() => createNovelXWorldPackageStars(pkg().title))
  const selectedRegion = createMemo(() => pkg().map.regions.find((region) => region.id === activeRegion()))
  const archiveItems = createMemo(() => {
    const publications = pkg().publications.map((item) => ({
      id: item.id,
      title: item.title,
      label: item.kind === "atlas" ? "图志" : "纪行",
      summary: item.summary,
      sourcePath: item.sourcePath,
    }))
    const story = pkg().story.title
      ? [{
          id: "novelx-package-story",
          title: pkg().story.title!,
          label: "小说",
          summary: pkg().story.summary ?? "故事尚未提交。",
          sourcePath: pkg().story.chapters[0]?.sourcePath,
        }]
      : []
    return [...publications.slice(0, 1), ...story, ...publications.slice(1, 2)].slice(0, 3)
  })
  const selectedArchive = createMemo(() => archiveItems().find((item) => item.id === activeArchive()))
  const selectedCharacter = createMemo(() => pkg().characters.find((item) => item.id === activeCharacter()))
  const graphNodes = createMemo(() => pkg().graph.nodes.slice(0, 10))

  const pageClass = (index: number) => ({
    "is-active": page() === index,
    "is-before": page() > index,
    "is-after": page() < index,
  })
  const resetMap = () => {
    setMapMode("idle")
    setActiveRegion(undefined)
  }
  const go = (next: number) => {
    if (!opened() || locked() || mapMode() === "detail") return
    const target = Math.max(1, Math.min(PAGE_NAMES.length - 1, next))
    if (target === page()) return
    setLocked(true)
    setPage(target)
    if (target !== 1) resetMap()
    window.setTimeout(() => setLocked(false), 620)
  }
  const openWorld = () => {
    if (opened() || locked()) return
    setOpened(true)
    setLocked(true)
    window.setTimeout(() => {
      setLocked(false)
      go(1)
    }, 820)
  }
  const selectRegion = (id: string) => {
    if (activeRegion() === id && mapMode() === "preview") {
      setMapMode("detail")
      return
    }
    setActiveRegion(id)
    setMapMode("preview")
  }
  const selectArchive = (id: string, path?: string) => {
    if (activeArchive() === id && path) {
      props.onOpenSource?.(path)
      return
    }
    setActiveArchive(id)
  }
  const selectCharacter = (id: string, path?: string) => {
    if (activeCharacter() === id && path) {
      props.onOpenSource?.(path)
      return
    }
    setActiveCharacter(id)
  }
  const stateDetail = () => {
    if (!opened()) return "等待开启"
    if (mapMode() === "detail") return "正在阅读完整档案"
    if (mapMode() === "preview") return "地域预览已展开"
    return `${page()} / ${PAGE_NAMES.length - 1}`
  }
  const onWheel = (event: WheelEvent) => {
    if (!opened() || locked() || mapMode() === "detail" || Math.abs(event.deltaY) < 18) return
    event.preventDefault()
    go(page() + (event.deltaY > 0 ? 1 : -1))
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!opened() && (event.key === "Enter" || event.key === " ")) return openWorld()
    if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown") go(page() + 1)
    if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") go(page() - 1)
    if (event.key === "Escape" && mapMode() === "detail") setMapMode("preview")
  }

  return (
    <article
      class="novelx-world-package-view"
      aria-label="NovelX 世界包展览"
      tabindex="0"
      onWheel={onWheel}
      onKeyDown={onKeyDown}
    >
      <div class="novelx-package-void-glow" aria-hidden="true" />
      <div class="novelx-package-starfield" aria-hidden="true">
        <For each={stars()}>
          {(star) => (
            <i
              class={`novelx-package-star is-${star.depth} is-${star.tone}`}
              style={`--x:${star.x}%;--y:${star.y}%;--size:${star.size}px;--alpha:${star.opacity};--duration:${star.duration}s;--delay:${star.delay}s;--drift-x:${star.driftX}px;--drift-y:${star.driftY}px`}
            />
          )}
        </For>
      </div>

      <div class="novelx-package-brand"><span class="novelx-package-brand-mark" /><span>NOVELX · WORLD ARCHIVE</span></div>
      <div class="novelx-package-state" aria-live="polite">
        <strong>{PAGE_NAMES[page()]}</strong>
        <span>{stateDetail()}</span>
        <button type="button" onClick={() => downloadNovelXWorldPackage(pkg())}>导出 .zib</button>
      </div>

      <section
        class="novelx-package-stage"
        classList={{ "is-dragging": dragDelta !== 0 }}
        onPointerDown={(event) => {
          dragStart = event.clientX
          dragDelta = 0
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          dragDelta = event.clientX - dragStart
        }}
        onPointerUp={(event) => {
          if (Math.abs(dragDelta) > 64) go(page() + (dragDelta < 0 ? 1 : -1))
          dragDelta = 0
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
      >
        <article class="novelx-package-page novelx-package-cover-page" classList={{ ...pageClass(0), "is-opening": opened() }}>
          <button type="button" class="novelx-package-cover-book" onClick={openWorld} aria-label="打开世界包">
            <Show when={pkg().cover.source}>
              {(source) => <img src={source()} alt="" />}
            </Show>
            <div class="novelx-package-cover-inscription">
              <span class="novelx-package-cover-sigil" />
              <h1>{pkg().title}</h1>
              <p>点击封面 · 进入世界</p>
            </div>
          </button>
        </article>

        <article class="novelx-package-page novelx-package-map-page" classList={{ ...pageClass(1), "is-detail": mapMode() === "detail" }}>
          <div class="novelx-package-page-surface">
            <span class="novelx-package-page-label">I · 世界地图</span>
            <div class="novelx-package-map-wrap">
              <svg class="novelx-package-map-sheet" viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="世界地图">
                <defs>
                  <radialGradient id="novelx-package-land" cx="48%" cy="48%" r="62%">
                    <stop stop-color="#354b49" stop-opacity=".94" />
                    <stop offset="1" stop-color="#151e27" stop-opacity=".96" />
                  </radialGradient>
                </defs>
                <rect width="1" height="1" fill="url(#novelx-package-land)" rx=".34" />
                <Show when={pkg().map.raster}>{(source) => <image href={source()} width="1" height="1" preserveAspectRatio="xMidYMid slice" opacity=".78" />}</Show>
                <For each={pkg().map.regions}>
                  {(region) => (
                    <g classList={{ "is-selected": activeRegion() === region.id }} onClick={() => selectRegion(region.id)}>
                      <polygon class="novelx-package-region" points={region.polygon.map((point) => `${point.x},${point.y}`).join(" ")} />
                      <text class="novelx-package-region-label" x={region.labelPoint.x} y={region.labelPoint.y}>{region.label}</text>
                    </g>
                  )}
                </For>
              </svg>
            </div>
            <Show when={selectedRegion()}>
              {(region) => (
                <button type="button" class="novelx-package-map-caption" classList={{ "is-visible": mapMode() === "preview" }} onClick={() => selectRegion(region().id)}>
                  <small>区域预览 · 再次点击进入</small>
                  <h2>{region().label}</h2>
                  <p>{excerptNovelXWorldPackage(region().summary, 180)}</p>
                </button>
              )}
            </Show>
            <Show when={selectedRegion()}>
              {(region) => (
                <button type="button" class="novelx-package-detail-sheet" onClick={() => setMapMode("preview")}>
                  <small>完整图志 · 点击正文返回地图</small>
                  <h2>{region().label}</h2>
                  <p>{region().summary}</p>
                  <Show when={region().sourcePath}>
                    {(path) => <span class="novelx-package-source-link" onClick={(event) => { event.stopPropagation(); props.onOpenSource?.(path()) }}>打开完整档案 ↗</span>}
                  </Show>
                </button>
              )}
            </Show>
            <Show when={!pkg().map.regions.length}>
              <div class="novelx-package-stage-empty">地图骨架尚未生成</div>
            </Show>
          </div>
        </article>

        <article class="novelx-package-page" classList={pageClass(2)}>
          <div class="novelx-package-page-surface">
            <span class="novelx-package-page-label">II · 历史、文献与小说</span>
            <div class="novelx-package-floating-collection is-books">
              <For each={archiveItems()}>
                {(item) => (
                  <button type="button" class="novelx-package-book" classList={{ "is-selected": activeArchive() === item.id }} onClick={() => selectArchive(item.id, item.sourcePath)}>
                    <small>{item.label}</small><strong>{item.title}</strong>
                  </button>
                )}
              </For>
              <Show when={!archiveItems().length}><div class="novelx-package-stage-empty">历史与故事尚未生成</div></Show>
            </div>
            <Show when={selectedArchive()}>
              {(item) => <aside class="novelx-package-entity-caption"><small>{item().label} · 再次点击打开</small><h2>{item().title}</h2><p>{excerptNovelXWorldPackage(item().summary, 220)}</p></aside>}
            </Show>
          </div>
        </article>

        <article class="novelx-package-page" classList={pageClass(3)}>
          <div class="novelx-package-page-surface">
            <span class="novelx-package-page-label">III · 人物群像</span>
            <div class="novelx-package-floating-collection is-portraits">
              <For each={pkg().characters.slice(0, 4)}>
                {(character) => (
                  <button type="button" class="novelx-package-portrait" classList={{ "is-selected": activeCharacter() === character.id }} onClick={() => selectCharacter(character.id, character.sourcePath)}>
                    <Show when={character.portrait}>{(source) => <img src={source()} alt="" />}</Show>
                    <span>{character.name}</span>
                  </button>
                )}
              </For>
              <Show when={!pkg().characters.length}><div class="novelx-package-stage-empty">人物尚未生成</div></Show>
            </div>
            <Show when={selectedCharacter()}>
              {(item) => <aside class="novelx-package-entity-caption"><small>人物档案 · 再次点击打开</small><h2>{item().name}</h2><p>{excerptNovelXWorldPackage(item().summary, 220)}</p></aside>}
            </Show>
          </div>
        </article>

        <article class="novelx-package-page" classList={pageClass(4)}>
          <div class="novelx-package-page-surface">
            <span class="novelx-package-page-label">IV · 世界图谱</span>
            <div class="novelx-package-graph-space">
              <div class="novelx-package-graph-orbit" />
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <For each={graphNodes()}>{(_, index) => { const point = graphPoint(index(), graphNodes().length); return <line x1="50" y1="50" x2={point.x} y2={point.y} /> }}</For>
              </svg>
              <For each={graphNodes()}>
                {(node, index) => {
                  const point = () => graphPoint(index(), graphNodes().length)
                  return <button type="button" class="novelx-package-node" style={`--node-x:${point().x}%;--node-y:${point().y}%`} onClick={() => node.sourcePath && props.onOpenSource?.(node.sourcePath)}><i /><span>{node.label}</span><small>{node.typeLabel}</small></button>
                }}
              </For>
              <Show when={!graphNodes().length}><div class="novelx-package-stage-empty">图谱尚未生成</div></Show>
            </div>
          </div>
        </article>
      </section>

      <nav class="novelx-package-page-rail" aria-label="展览页导航">
        <For each={PAGE_NAMES}>
          {(name, index) => <button type="button" classList={{ "is-active": page() === index() }} aria-label={`前往${name}`} onClick={() => index() === 0 ? undefined : go(index())} />}
        </For>
      </nav>
      <div class="novelx-package-hint" classList={{ "is-visible": opened() }}><i /><span>滚轮向下或左右拖动翻页</span></div>
    </article>
  )
}

function graphPoint(index: number, total: number) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(total, 1)
  const radius = index % 2 === 0 ? 33 : 25
  return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius }
}
