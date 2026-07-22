import { Markdown } from "@opencode-ai/session-ui/markdown"
import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js"
import type { NovelXWorldPackage } from "@/novelx/world-package"
import { createNovelXWorldPackageStars, excerptNovelXWorldPackage } from "@/novelx/world-package"
import { downloadNovelXWorldPackage } from "@/novelx/world-package-export"
import { NovelXGraphView } from "./novelx-graph-view"
import "./novelx-world-package.css"

const PAGE_NAMES = ["封面", "世界地图", "历史与小说", "人物群像", "世界图谱"] as const
type MapMode = "idle" | "preview" | "detail"
type StoryReader = {
  kind: "story"
  title: string
  summary: string
  chapters: NovelXWorldPackage["story"]["chapters"]
}
type DocumentReader = {
  kind: "document"
  title: string
  path: string
  status: "loading" | "ready" | "error"
  content?: string
  message?: string
  returnTo?: StoryReader
}
type PackageReader = StoryReader | DocumentReader

export function NovelXWorldPackageView(props: {
  package: () => NovelXWorldPackage
  graphStorageKey: string
  readSource: (path: string) => Promise<string | undefined>
  onRefreshGraph: () => Promise<void>
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
  const [reader, setReader] = createSignal<PackageReader>()
  let dragStart = 0
  let dragDelta = 0
  let readerVersion = 0
  let readerOpener: HTMLElement | SVGElement | undefined

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
    if (!opened() || locked() || mapMode() === "detail" || reader()) return
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
  const selectRegion = (id: string, opener?: HTMLElement | SVGElement) => {
    if (activeRegion() === id && mapMode() === "preview") {
      const region = pkg().map.regions.find((item) => item.id === id)
      if (region?.sourcePath) void openDocument(region.label, region.sourcePath, opener)
      else setMapMode("detail")
      return
    }
    setActiveRegion(id)
    setMapMode("preview")
  }
  const selectArchive = (id: string) => setActiveArchive(id)
  const selectCharacter = (id: string) => setActiveCharacter(id)
  async function openDocument(
    title: string,
    path: string,
    opener?: HTMLElement | SVGElement,
    returnTo?: StoryReader,
  ) {
    const version = ++readerVersion
    if (opener) readerOpener = opener
    setReader({ kind: "document", title, path, status: "loading", returnTo })
    try {
      const content = await props.readSource(path)
      if (version !== readerVersion) return
      if (content === undefined) throw new Error("正式原文不存在或尚未提交。")
      setReader({ kind: "document", title, path, status: "ready", content, returnTo })
    } catch (error) {
      if (version !== readerVersion) return
      setReader({
        kind: "document",
        title,
        path,
        status: "error",
        message: error instanceof Error ? error.message : "无法读取正式原文。",
        returnTo,
      })
    }
  }
  const closeReader = () => {
    const current = reader()
    if (current?.kind === "document" && current.returnTo) {
      readerVersion++
      setReader(current.returnTo)
      return
    }
    readerVersion++
    setReader(undefined)
    queueMicrotask(() => readerOpener?.focus())
  }
  const openStory = (opener?: HTMLElement | SVGElement) => {
    const title = pkg().story.title
    if (!title) return
    if (opener) readerOpener = opener
    setReader({
      kind: "story",
      title,
      summary: pkg().story.summary ?? "故事尚未提交。",
      chapters: pkg().story.chapters,
    })
  }
  const openArchive = (item: ReturnType<typeof archiveItems>[number], opener?: HTMLElement) => {
    if (item.id === "novelx-package-story") {
      openStory(opener)
      return
    }
    if (item.sourcePath) void openDocument(item.title, item.sourcePath, opener)
  }
  const openCharacter = (character: NovelXWorldPackage["characters"][number], opener?: HTMLElement) => {
    if (character.sourcePath) void openDocument(character.name, character.sourcePath, opener)
  }
  const activateArchive = (item: ReturnType<typeof archiveItems>[number], opener: HTMLElement) => {
    if (activeArchive() === item.id) return openArchive(item, opener)
    selectArchive(item.id)
  }
  const activateCharacter = (character: NovelXWorldPackage["characters"][number], opener: HTMLElement) => {
    if (activeCharacter() === character.id) return openCharacter(character, opener)
    selectCharacter(character.id)
  }
  const stateDetail = () => {
    if (!opened()) return "等待开启"
    if (mapMode() === "detail") return "正在阅读完整档案"
    if (mapMode() === "preview") return "地域预览已展开"
    return `${page()} / ${PAGE_NAMES.length - 1}`
  }
  const readerBackLabel = () => {
    const current = reader()
    return current?.kind === "document" && current.returnTo ? "返回小说目录" : "返回世界包"
  }
  const onWheel = (event: WheelEvent) => {
    if (reader() || !opened() || locked() || mapMode() === "detail" || Math.abs(event.deltaY) < 18) return
    event.preventDefault()
    go(page() + (event.deltaY > 0 ? 1 : -1))
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && reader()) return closeReader()
    if (!opened() && (event.key === "Enter" || event.key === " ")) return openWorld()
    if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown") go(page() + 1)
    if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") go(page() - 1)
    if (event.key === "Escape" && mapMode() === "detail") setMapMode("preview")
  }

  return (
    <article
      class="novelx-world-package-view"
      classList={{ "is-reading": Boolean(reader()) }}
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
          const target = event.target
          if (target instanceof Element && target.closest("button,a,input,textarea,select,[role='button'],[data-package-interactive]")) return
          dragStart = event.clientX
          dragDelta = 0
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          dragDelta = event.clientX - dragStart
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
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
                    <g
                      data-package-interactive
                      classList={{ "is-selected": activeRegion() === region.id }}
                      role="button"
                      tabIndex={0}
                      aria-label={`查看${region.label}`}
                      onClick={(event) => selectRegion(region.id, event.currentTarget)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return
                        event.preventDefault()
                        selectRegion(region.id, event.currentTarget)
                      }}
                    >
                      <polygon class="novelx-package-region" points={region.polygon.map((point) => `${point.x},${point.y}`).join(" ")} />
                      <text class="novelx-package-region-label" x={region.labelPoint.x} y={region.labelPoint.y}>{region.label}</text>
                    </g>
                  )}
                </For>
              </svg>
            </div>
            <Show when={selectedRegion()}>
              {(region) => (
                <button type="button" class="novelx-package-map-caption" classList={{ "is-visible": mapMode() === "preview" }} onClick={(event) => selectRegion(region().id, event.currentTarget)}>
                  <small>区域预览 · 再次点击进入</small>
                  <h2>{region().label}</h2>
                  <p>{excerptNovelXWorldPackage(region().summary, 180)}</p>
                </button>
              )}
            </Show>
            <Show when={selectedRegion()}>
              {(region) => (
                <article class="novelx-package-detail-sheet">
                  <small>区域详情</small>
                  <h2>{region().label}</h2>
                  <p>{region().summary}</p>
                  <Show when={region().sourcePath}>
                    {(path) => <button type="button" class="novelx-package-source-link" onClick={(event) => void openDocument(region().label, path(), event.currentTarget)}>阅读正式原文</button>}
                  </Show>
                  <button type="button" class="novelx-package-detail-return" onClick={() => setMapMode("preview")}>返回地图</button>
                </article>
              )}
            </Show>
            <Show when={!pkg().map.regions.length}>
              <div class="novelx-package-stage-empty">地图骨架尚未生成</div>
            </Show>
          </div>
        </article>

        <article class="novelx-package-page novelx-package-archive-page" classList={pageClass(2)}>
          <div class="novelx-package-page-surface">
            <span class="novelx-package-page-label">II · 历史、文献与小说</span>
            <div class="novelx-package-floating-collection is-books">
              <For each={archiveItems()}>
                {(item) => (
                  <button
                    type="button"
                    class="novelx-package-book"
                    classList={{ "is-selected": activeArchive() === item.id }}
                    onClick={(event) => activateArchive(item, event.currentTarget)}
                  >
                    <small>{item.label}</small><strong>{item.title}</strong>
                  </button>
                )}
              </For>
              <Show when={!archiveItems().length}><div class="novelx-package-stage-empty">历史与故事尚未生成</div></Show>
            </div>
            <Show when={selectedArchive()}>
              {(item) => <aside class="novelx-package-entity-caption"><small>{item().label} · 双击封面或点击下方按钮</small><h2>{item().title}</h2><p>{excerptNovelXWorldPackage(item().summary, 220)}</p><button type="button" onClick={(event) => openArchive(item(), event.currentTarget)}>打开阅读</button></aside>}
            </Show>
          </div>
        </article>

        <article class="novelx-package-page novelx-package-character-page" classList={pageClass(3)}>
          <div class="novelx-package-page-surface">
            <span class="novelx-package-page-label">III · 人物群像</span>
            <div class="novelx-package-floating-collection is-portraits">
              <For each={pkg().characters.slice(0, 4)}>
                {(character) => (
                  <button
                    type="button"
                    class="novelx-package-portrait"
                    classList={{ "is-selected": activeCharacter() === character.id }}
                    onClick={(event) => activateCharacter(character, event.currentTarget)}
                  >
                    <Show when={character.portrait}>{(source) => <img src={source()} alt="" />}</Show>
                    <span>{character.name}</span>
                  </button>
                )}
              </For>
              <Show when={!pkg().characters.length}><div class="novelx-package-stage-empty">人物尚未生成</div></Show>
            </div>
            <Show when={selectedCharacter()}>
              {(item) => <aside class="novelx-package-entity-caption"><small>人物档案 · 双击肖像或点击下方按钮</small><h2>{item().name}</h2><p>{excerptNovelXWorldPackage(item().summary, 220)}</p><Show when={item().sourcePath}><button type="button" onClick={(event) => openCharacter(item(), event.currentTarget)}>打开档案</button></Show></aside>}
            </Show>
          </div>
        </article>

        <article class="novelx-package-page novelx-package-graph-page" classList={pageClass(4)}>
          <div class="novelx-package-page-surface">
            <div class="novelx-package-graph-embedded" data-package-interactive>
              <NovelXGraphView
                graph={() => pkg().graph}
                storageKey={props.graphStorageKey}
                readSource={props.readSource}
                onOpenSource={(path) => {
                  const node = pkg().graph.nodes.find((item) => item.sourcePath === path)
                  void openDocument(node?.label ?? path, path)
                }}
                onRefresh={props.onRefreshGraph}
              />
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
      <Show when={reader()}>
        {(current) => (
          <article class="novelx-package-reader" aria-label="世界包正文阅读" onWheel={(event) => event.stopPropagation()}>
            <header>
              <button type="button" onClick={closeReader}>← {readerBackLabel()}</button>
              <div><small>{current().kind === "story" ? "小说目录" : "正式原文"}</small><h2>{current().title}</h2></div>
              <Show when={current().kind === "document" && props.onOpenSource}>
                <button type="button" onClick={() => { const value = current(); if (value.kind === "document") props.onOpenSource?.(value.path) }}>在文件中打开</button>
              </Show>
            </header>
            <Switch>
              <Match when={current().kind === "story" ? current() as StoryReader : undefined}>
                {(story) => (
                  <div class="novelx-package-story-reader">
                    <p>{story().summary}</p>
                    <ol>
                      <For each={story().chapters}>
                        {(chapter, index) => (
                          <li>
                            <button
                              type="button"
                              disabled={!chapter.sourcePath}
                              onClick={() => chapter.sourcePath && void openDocument(chapter.title, chapter.sourcePath, undefined, story())}
                            >
                              <small>第 {index() + 1} 章</small>
                              <strong>{chapter.title}</strong>
                              <span>{excerptNovelXWorldPackage(chapter.summary, 180)}</span>
                            </button>
                          </li>
                        )}
                      </For>
                    </ol>
                  </div>
                )}
              </Match>
              <Match when={current().kind === "document" ? current() as DocumentReader : undefined}>
                {(document) => (
                  <div class="novelx-package-document-reader">
                    <Switch>
                      <Match when={document().status === "loading"}><div class="novelx-package-reader-status" role="status">正在读取正式原文…</div></Match>
                      <Match when={document().status === "error"}>
                        <div class="novelx-package-reader-status is-error" role="alert"><strong>无法读取正式原文</strong><p>{document().message}</p><button type="button" onClick={() => void openDocument(document().title, document().path, undefined, document().returnTo)}>重试</button></div>
                      </Match>
                      <Match when={document().status === "ready"}><Markdown text={document().content ?? ""} /></Match>
                    </Switch>
                  </div>
                )}
              </Match>
            </Switch>
          </article>
        )}
      </Show>
    </article>
  )
}
