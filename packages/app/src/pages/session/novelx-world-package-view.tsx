import { For, Show, createSignal } from "solid-js"
import type { NovelXWorldPackage } from "@/novelx/world-package"
import { downloadNovelXWorldPackage } from "@/novelx/world-package-export"
import { excerptNovelXWorldPackage } from "@/novelx/world-package"
import "./novelx-world-package.css"

export function NovelXWorldPackageView(props: {
  package: () => NovelXWorldPackage
  onOpenSource?: (path: string) => void
}) {
  const [activeRegion, setActiveRegion] = createSignal<string>()
  const [mapZoomed, setMapZoomed] = createSignal(false)
  const pkg = props.package
  const selectedRegion = () => pkg().map.regions.find((region) => region.id === activeRegion())
  const selectRegion = (id: string) => {
    if (activeRegion() === id) {
      setMapZoomed(!mapZoomed())
      return
    }
    setActiveRegion(id)
    setMapZoomed(false)
  }
  const openSource = (path?: string) => {
    if (path) props.onOpenSource?.(path)
  }
  return (
    <article class="novelx-world-package-view" aria-label="世界包展览">
      <div class="novelx-package-stars" aria-hidden="true" />
      <nav class="novelx-package-rail" aria-label="展览章节">
        <For each={pkg().sections}>
          {(section, index) => (
            <a href={`#package-${section}`} classList={{ "is-current": index() === 0 }}>
              <span>{String(index() + 1).padStart(2, "0")}</span>
              <small>{sectionName(section)}</small>
            </a>
          )}
        </For>
      </nav>
      <header class="novelx-package-topbar">
        <span>NovelX · 世界展览</span>
        <div>
          <button type="button" onClick={() => downloadNovelXWorldPackage(pkg())}>
            导出 .zib
          </button>
          <span class="novelx-package-status">公开展示层</span>
        </div>
      </header>
      <section class="novelx-package-hero" id="package-cover">
        <div class="novelx-package-hero-orbit" aria-hidden="true" />
        <div class="novelx-package-hero-copy">
          <span class="novelx-package-kicker">WORLD PACKAGE · {pkg().cover.status}</span>
          <Show when={pkg().cover.source}>
            {(source) => <img class="novelx-package-cover-image" src={source()} alt={`${pkg().title}封面`} />}
          </Show>
          <h1>{pkg().title}</h1>
          <p>{pkg().summary}</p>
          <a class="novelx-package-enter" href="#package-overview">
            进入展览 <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>
      <section class="novelx-package-section" id="package-overview">
        <div class="novelx-package-section-heading">
          <span class="novelx-package-kicker">01 · ORIENTATION</span>
          <h2>{pkg().overview.title}</h2>
          <p>{pkg().overview.text}</p>
        </div>
        <div class="novelx-package-metric-grid">
          <Metric label="公开区域" value={String(pkg().map.regions.length)} detail="泰森网格区域" />
          <Metric label="关系节点" value={String(pkg().graph.nodes.length)} detail="事实与角色" />
          <Metric label="公开文稿" value={String(pkg().publications.length + pkg().story.chapters.length)} detail="图志与故事" />
        </div>
      </section>
      <section class="novelx-package-section is-map" id="package-map">
        <div class="novelx-package-section-heading">
          <span class="novelx-package-kicker">02 · CARTOGRAPHY</span>
          <h2>地图</h2>
          <p>第一次点击高亮，第二次点击放大；区域归属永远以泰森网格为准。</p>
        </div>
        <div classList={{ "novelx-package-map-frame": true, "is-zoomed": mapZoomed() }}>
          <svg class="novelx-package-map" viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label="世界泰森网格地图">
            <defs>
              <radialGradient id="package-map-glow"><stop stop-color="#9ad8ff" stop-opacity=".22" /><stop offset="1" stop-color="#071123" stop-opacity="0" /></radialGradient>
            </defs>
            <rect width="1" height="1" fill="url(#package-map-glow)" />
            <Show when={pkg().map.raster}>
              {(source) => <image href={source()} width="1" height="1" preserveAspectRatio="xMidYMid slice" opacity=".72" />}
            </Show>
            <For each={pkg().map.regions}>
              {(region) => (
                <g classList={{ "is-active": activeRegion() === region.id }} onClick={() => selectRegion(region.id)}>
                  <polygon class="novelx-package-region" points={region.polygon.map((point) => `${point.x},${point.y}`).join(" ")} />
                  <text class="novelx-package-region-label" x={region.labelPoint.x} y={region.labelPoint.y}>
                    {region.label}
                  </text>
                </g>
              )}
            </For>
          </svg>
          <Show when={selectedRegion()} fallback={<div class="novelx-package-map-empty">地图美术尚未返回，泰森网格仍可浏览。</div>}>
            {(region) => (
              <aside class="novelx-package-map-card">
                <span>{region().kind} · {region().surface}</span>
                <h3>{region().label}</h3>
                <p>{excerptNovelXWorldPackage(region().summary, 220)}</p>
                <Show when={region().sourcePath} fallback={<small>正式档案尚未提交</small>}>
                  {(path) => <button type="button" onClick={() => openSource(path())}>打开完整档案 ↗</button>}
                </Show>
              </aside>
            )}
          </Show>
        </div>
      </section>
      <section class="novelx-package-section" id="package-publications">
        <div class="novelx-package-section-heading"><span class="novelx-package-kicker">03 · FIELD NOTES</span><h2>图志与纪行</h2><p>一份全面的图志，一组不完全可靠但真实可感的个人视野。</p></div>
        <div class="novelx-package-card-grid"><For each={pkg().publications}>{(item) => <button type="button" class="novelx-package-card" onClick={() => openSource(item.sourcePath)}><span>{item.kind === "atlas" ? "图志" : "纪行"}</span><h3>{item.title}</h3><p>{item.summary}</p></button>}</For><Show when={!pkg().publications.length}><Empty /></Show></div>
      </section>
      <section class="novelx-package-section" id="package-story">
        <div class="novelx-package-section-heading"><span class="novelx-package-kicker">04 · CHRONICLE</span><h2>{pkg().story.title ?? "故事"}</h2><p>{pkg().story.summary ?? "故事尚未生成。"}</p></div>
        <div class="novelx-package-card-grid"><For each={pkg().story.chapters}>{(chapter) => <button type="button" class="novelx-package-card" onClick={() => openSource(chapter.sourcePath)}><span>章节</span><h3>{chapter.title}</h3><p>{chapter.summary}</p></button>}</For><Show when={!pkg().story.chapters.length}><Empty /></Show></div>
      </section>
      <section class="novelx-package-section" id="package-characters">
        <div class="novelx-package-section-heading"><span class="novelx-package-kicker">05 · PERSONAE</span><h2>角色</h2><p>从世界事实中长出来的人。</p></div>
        <div class="novelx-package-card-grid"><For each={pkg().characters}>{(character) => <button type="button" class="novelx-package-card" onClick={() => openSource(character.sourcePath)}><span>角色档案</span><h3>{character.name}</h3><p>{character.summary}</p></button>}</For><Show when={!pkg().characters.length}><Empty /></Show></div>
      </section>
      <section class="novelx-package-section is-graph" id="package-graph">
        <div class="novelx-package-section-heading"><span class="novelx-package-kicker">06 · CONSTELLATION</span><h2>图谱</h2><p>关系不是说明书，而是世界事实留下的星座。</p></div>
        <div class="novelx-package-node-cloud"><For each={pkg().graph.nodes}>{(node) => <button type="button" class="novelx-package-node" onClick={() => openSource(node.sourcePath)}><span>{node.typeLabel}</span><strong>{node.label}</strong><small>{excerptNovelXWorldPackage(node.summary, 100)}</small></button>}</For><Show when={!pkg().graph.nodes.length}><Empty /></Show></div>
      </section>
      <footer class="novelx-package-footer">公开展示层 · 内部 Agent、Prompt、工具调用与会话记录不会进入世界包</footer>
    </article>
  )
}

function Metric(props: { label: string; value: string; detail: string }) {
  return <div class="novelx-package-metric"><span>{props.label}</span><strong>{props.value}</strong><small>{props.detail}</small></div>
}

function Empty() {
  return <div class="novelx-package-empty"><span>尚未生成</span><small>正式内容完成后会自动出现在这里。</small></div>
}

function sectionName(section: string) {
  return ({ cover: "封面", overview: "总览", map: "地图", publications: "文稿", story: "故事", characters: "角色", graph: "图谱" } as Record<string, string>)[section] ?? section
}
