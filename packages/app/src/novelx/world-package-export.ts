import type { NovelXWorldPackage } from "./world-package"

const encoder = new TextEncoder()

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

const crc32 = (bytes: Uint8Array) => {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

const write32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value >>> 0, true)
const write16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true)

type ZipEntry = { name: string; bytes: Uint8Array }

export function createNovelXWorldPackageHtml(pkg: NovelXWorldPackage) {
  const serialized = JSON.stringify(pkg).replaceAll("<", "\\u003c")
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(pkg.title)} · NovelX 世界包</title>
<style>
:root{color-scheme:dark;--ink:#f6f0e6;--muted:#a7abc0;--gold:#e4c27a;--line:#64709a55;--panel:#11182bd9}*{box-sizing:border-box}html,body{margin:0;background:#050817;color:var(--ink);font-family:ui-serif,Georgia,"Noto Serif SC",serif}body{overflow-x:hidden}body:before{content:"";position:fixed;inset:0;background:radial-gradient(circle at 50% 35%,#26355f99,transparent 38%),radial-gradient(circle at 18% 80%,#38275188,transparent 34%);pointer-events:none}.stars{position:fixed;inset:0;opacity:.75;background-image:radial-gradient(#fff 1px,transparent 1px),radial-gradient(#98b6ff 1px,transparent 1px);background-size:97px 113px,157px 181px;background-position:20px 30px,80px 70px;animation:drift 28s linear infinite}.shell{position:relative;z-index:1;max-width:1240px;margin:auto;padding:36px 30px 120px}.top{position:sticky;top:18px;z-index:3;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border:1px solid #ffffff1c;background:#080d1bd9;backdrop-filter:blur(18px);border-radius:18px}.top strong{letter-spacing:.08em}.top button{border:1px solid #ffffff2c;background:#ffffff0d;color:var(--ink);border-radius:999px;padding:8px 14px;cursor:pointer}.hero{min-height:78vh;display:grid;place-items:center;text-align:center;padding:8vh 0}.hero-card{max-width:820px;padding:58px 50px;border:1px solid #ffffff25;border-radius:32px;background:linear-gradient(135deg,#18234bd9,#080d1bd9);box-shadow:0 35px 120px #0008;animation:rise 1.2s ease both}.eyebrow{color:var(--gold);letter-spacing:.22em;text-transform:uppercase;font-size:12px}.hero h1{font-size:clamp(42px,8vw,92px);margin:18px 0 12px;line-height:1.04}.hero p{color:#d9d9e3;line-height:1.9;font-size:18px}.section{min-height:75vh;padding:86px 0;scroll-margin-top:80px}.section h2{font-size:36px;margin:0 0 12px}.section>p{color:var(--muted);max-width:720px;line-height:1.8}.overview,.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:28px}.panel,.card{border:1px solid #ffffff1d;border-radius:20px;background:var(--panel);padding:22px;box-shadow:0 12px 40px #0003}.panel p,.card p{color:#c2c6d3;line-height:1.75}.map-wrap{position:relative;border:1px solid #ffffff1d;border-radius:28px;background:#071126cc;padding:20px;margin-top:28px;overflow:hidden}.map{width:100%;aspect-ratio:1.7;display:block;background:radial-gradient(circle,#142548,#08101f)}.region{fill:#8e9bb944;stroke:#e4c27a66;stroke-width:.0018;cursor:pointer;transition:fill .25s,stroke .25s}.region:hover,.region.active{fill:#e4c27a99;stroke:#fff;stroke-width:.003}.region-label{font-size:.018px;fill:#f4eddf;pointer-events:none}.map-detail{position:absolute;right:26px;bottom:26px;width:min(330px,calc(100% - 52px));padding:18px;border:1px solid #ffffff2b;border-radius:18px;background:#0a1020e8;backdrop-filter:blur(14px)}.map-detail h3{margin:4px 0}.map-detail p{color:#c6cada;line-height:1.65}.muted{color:var(--muted)}.node-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.node{border:1px solid #ffffff1c;border-radius:16px;padding:16px;background:#10182bba}.node strong{display:block}.node small{color:var(--gold)}.footer{text-align:center;color:#7c8299;padding-top:70px}@keyframes drift{to{background-position:90px 10px,10px 140px}}@keyframes rise{from{opacity:0;transform:translateY(24px) scale(.98)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}@media(max-width:700px){.shell{padding:16px 14px 80px}.hero-card{padding:38px 22px}.section{min-height:auto;padding:62px 0}}
</style></head><body><div class="stars"></div><main class="shell"><header class="top"><strong>NovelX · 世界展览</strong><nav><button data-scroll="overview">进入展览</button></nav></header><section class="hero" id="cover"><div class="hero-card"><div class="eyebrow">WORLD PACKAGE · ${escapeHtml(pkg.cover.status)}</div><h1>${escapeHtml(pkg.title)}</h1><p>${escapeHtml(pkg.summary)}</p></div></section><section class="section" id="overview"><h2>${escapeHtml(pkg.overview.title)}</h2><p>${escapeHtml(pkg.overview.text)}</p><div class="overview"><div class="panel"><span class="eyebrow">MAP</span><h3>${pkg.map.regions.length} 个公开区域</h3><p>区域边界来自正式泰森网格，地图美术只是视觉层。</p></div><div class="panel"><span class="eyebrow">GRAPH</span><h3>${pkg.graph.nodes.length} 个节点</h3><p>${pkg.graph.edges.length} 条关系连接世界事实。</p></div><div class="panel"><span class="eyebrow">TEXT</span><h3>${pkg.publications.length + pkg.story.chapters.length} 份文稿</h3><p>图志、纪行与故事共同构成世界的公开记忆。</p></div></div></section><section class="section" id="map"><h2>地图</h2><p>点击区域高亮，再次点击查看它的公开档案。</p><div class="map-wrap"><svg class="map" viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="世界地图"><g id="regions"></g></svg><div class="map-detail" id="map-detail"><span class="muted">选择一块区域</span></div></div></section><section class="section" id="publications"><h2>世界文稿</h2><p>图志提供全貌，纪行留下个人视野。</p><div class="cards" id="publication-cards"></div></section><section class="section" id="story"><h2 id="story-title">故事</h2><p id="story-summary"></p><div class="cards" id="story-cards"></div></section><section class="section" id="characters"><h2>角色</h2><div class="cards" id="character-cards"></div></section><section class="section" id="graph"><h2>图谱</h2><p>世界事实在这里彼此相连。</p><div class="node-grid" id="graph-nodes"></div></section><footer class="footer">由 NovelX 世界包生成 · 公开展示层不包含内部 Agent 记录</footer></main><script>const PKG=${serialized};const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));const by=id=>document.getElementById(id);document.querySelectorAll('[data-scroll]').forEach(b=>b.onclick=()=>by(b.dataset.scroll)?.scrollIntoView({behavior:'smooth'}));const svgNS='http://www.w3.org/2000/svg';let selected;for(const r of PKG.map.regions){const p=document.createElementNS(svgNS,'polygon');p.className.baseVal='region';p.dataset.id=r.id;p.setAttribute('points',r.polygon.map(x=>x.x+','+x.y).join(' '));p.onclick=()=>{if(selected===r.id){by('map-detail').innerHTML='<span class=\"muted\">'+esc(r.label)+'</span>';selected=undefined;p.classList.remove('active');return}document.querySelectorAll('.region.active').forEach(x=>x.classList.remove('active'));selected=r.id;p.classList.add('active');by('map-detail').innerHTML='<small>'+esc(r.kind)+'</small><h3>'+esc(r.label)+'</h3><p>'+esc(r.summary)+'</p><span class=\"muted\">'+esc(r.sourcePath||'档案尚未提交')+'</span>'};by('regions').appendChild(p);const t=document.createElementNS(svgNS,'text');t.className.baseVal='region-label';t.setAttribute('x',r.labelPoint.x);t.setAttribute('y',r.labelPoint.y);t.textContent=r.label;by('regions').appendChild(t)};const cards=(id,items,render)=>by(id).innerHTML=items.length?items.map(render).join(''):'<div class=\"panel\"><span class=\"muted\">尚未生成</span></div>';cards('publication-cards',PKG.publications,x=>'<article class=\"card\"><small>'+esc(x.kind)+'</small><h3>'+esc(x.title)+'</h3><p>'+esc(x.summary)+'</p></article>');by('story-title').textContent=PKG.story.title||'故事';by('story-summary').textContent=PKG.story.summary||'故事尚未生成。';cards('story-cards',PKG.story.chapters,x=>'<article class=\"card\"><h3>'+esc(x.title)+'</h3><p>'+esc(x.summary)+'</p></article>');cards('character-cards',PKG.characters,x=>'<article class=\"card\"><small>角色</small><h3>'+esc(x.name)+'</h3><p>'+esc(x.summary)+'</p></article>');cards('graph-nodes',PKG.graph.nodes,x=>'<article class=\"node\"><small>'+esc(x.typeLabel)+'</small><strong>'+esc(x.label)+'</strong><p>'+esc(x.summary)+'</p></article>');</script></body></html>`
}

export function createNovelXWorldPackageZip(pkg: NovelXWorldPackage) {
  const entries: ZipEntry[] = [
    { name: "index.html", bytes: encoder.encode(createNovelXWorldPackageHtml(pkg)) },
    { name: "data/world.json", bytes: encoder.encode(JSON.stringify(pkg, null, 2)) },
    { name: "README.txt", bytes: encoder.encode("NovelX 世界包\r\n解压后直接打开 index.html。\r\n") },
  ]
  return new Blob([zipStore(entries)], { type: "application/zip" })
}

export function downloadNovelXWorldPackage(pkg: NovelXWorldPackage) {
  const url = URL.createObjectURL(createNovelXWorldPackageZip(pkg))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${safeFilename(pkg.title)}.zib`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFilename(value: string) {
  return value.replaceAll(/[<>:"/\\|?*]/gu, "_").trim() || "NovelX-世界包"
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function zipStore(entries: readonly ZipEntry[]) {
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.bytes)
    const record = new Uint8Array(30 + name.length + entry.bytes.length)
    const view = new DataView(record.buffer)
    write32(view, 0, 0x04034b50); write16(view, 4, 20); write16(view, 6, 0x800); write16(view, 8, 0)
    write16(view, 10, 0); write16(view, 12, 0); write32(view, 14, crc); write32(view, 18, entry.bytes.length)
    write32(view, 22, entry.bytes.length); write16(view, 26, name.length); write16(view, 28, 0)
    record.set(name, 30); record.set(entry.bytes, 30 + name.length); local.push(record)
    const directory = new Uint8Array(46 + name.length); const directoryView = new DataView(directory.buffer)
    write32(directoryView, 0, 0x02014b50); write16(directoryView, 4, 20); write16(directoryView, 6, 20); write16(directoryView, 8, 0x800)
    write16(directoryView, 10, 0); write16(directoryView, 12, 0); write16(directoryView, 14, 0); write32(directoryView, 16, crc)
    write32(directoryView, 20, entry.bytes.length); write32(directoryView, 24, entry.bytes.length); write16(directoryView, 28, name.length)
    write16(directoryView, 30, 0); write16(directoryView, 32, 0); write16(directoryView, 34, 0); write16(directoryView, 36, 0)
    write32(directoryView, 38, 0); write32(directoryView, 42, offset); directory.set(name, 46); central.push(directory); offset += record.length
  }
  const size = local.reduce((sum, item) => sum + item.length, 0); const directorySize = central.reduce((sum, item) => sum + item.length, 0)
  const end = new Uint8Array(22); const endView = new DataView(end.buffer); write32(endView, 0, 0x06054b50); write16(endView, 8, entries.length); write16(endView, 10, entries.length); write32(endView, 12, directorySize); write32(endView, 16, size)
  return concat([...local, ...central, end])
}

function concat(chunks: readonly Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0)); let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

