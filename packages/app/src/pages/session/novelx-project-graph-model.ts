import { novelXGraphExcerpt, type NovelXGraph, type NovelXGraphEdge, type NovelXGraphNode } from "./novelx-graph-model"

export type NovelXProjectGraphDocument = {
  path: string
  content: string
}

export type NovelXProjectGraphResult = {
  graph: NovelXGraph
  documentCount: number
}

const normalizePath = (value: string) => {
  const parts: string[] = []
  for (const part of value.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join("/")
}

const pathKey = (value: string) => normalizePath(value).toLocaleLowerCase()
const projectId = (name: string) => `project:${name.trim().toLocaleLowerCase() || "project"}`
const directoryId = (path: string) => `directory:${pathKey(path)}`
const documentId = (path: string) => `document:${pathKey(path)}`

const withoutExtension = (value: string) => value.replace(/\.[^.]+$/u, "")
const filename = (path: string) => normalizePath(path).split("/").at(-1) ?? path
const dirname = (path: string) => normalizePath(path).split("/").slice(0, -1).join("/")

const unquote = (value: string) => {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

const documentTitle = (document: NovelXProjectGraphDocument) => {
  const frontmatter = document.content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---(?:[\r\n]+|$)/u)?.[1]
  const title = frontmatter?.match(/^title\s*:\s*(.+)$/imu)?.[1]
  if (title && unquote(title)) return unquote(title)
  const heading = document.content.match(/^#\s+(.+)$/mu)?.[1]?.trim()
  if (heading) return heading
  return withoutExtension(filename(document.path))
}

const typeLabel = (path: string) => {
  const extension = filename(path).split(".").at(-1)?.toLocaleLowerCase()
  if (extension === "md" || extension === "markdown") return "Markdown 文档"
  if (extension === "rst") return "reStructuredText 文档"
  if (extension === "adoc") return "AsciiDoc 文档"
  return "文本文档"
}

const resolveRelativePath = (sourcePath: string, target: string): string | undefined => {
  const clean = target.split("#", 1)[0]?.split("?", 1)[0]?.trim()
  if (!clean || clean.startsWith("#") || /^[a-z][a-z\d+.-]*:/iu.test(clean) || clean.startsWith("//")) return undefined
  let decoded = clean
  try {
    decoded = decodeURIComponent(clean)
  } catch {
    // Keep the literal link when it contains invalid percent encoding.
  }
  return normalizePath(decoded.startsWith("/") ? decoded : `${dirname(sourcePath)}/${decoded}`)
}

const markdownTargets = (content: string) => {
  const result: string[] = []
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu)) {
    const target = match[1]
    if (target) result.push(target)
  }
  return result
}

const wikiTargets = (content: string) => {
  const result: string[] = []
  for (const match of content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/gu)) {
    const target = match[1]?.trim()
    if (target) result.push(target)
  }
  return result
}

const addNode = (nodes: Map<string, NovelXGraphNode>, node: NovelXGraphNode) => {
  if (!nodes.has(node.id)) nodes.set(node.id, node)
}

const addEdge = (edges: Map<string, NovelXGraphEdge>, edge: NovelXGraphEdge) => {
  if (!edges.has(edge.id)) edges.set(edge.id, edge)
}

export function projectNovelXFileGraph(input: {
  projectName: string
  documents: readonly NovelXProjectGraphDocument[]
}): NovelXProjectGraphResult {
  const documents = new Map<string, NovelXProjectGraphDocument>()
  for (const document of input.documents) {
    const path = normalizePath(document.path)
    if (!path) continue
    const key = pathKey(path)
    if (!documents.has(key)) documents.set(key, { path, content: document.content })
  }
  if (!documents.size) return { graph: { nodes: [], edges: [] }, documentCount: 0 }

  const nodes = new Map<string, NovelXGraphNode>()
  const edges = new Map<string, NovelXGraphEdge>()
  const rootId = projectId(input.projectName)
  addNode(nodes, {
    id: rootId,
    label: input.projectName.trim() || "当前项目",
    typeLabel: "项目",
    summary: `由 ${documents.size} 份已保存文档生成的项目关系入口。`,
    status: "committed",
  })

  const titles = new Map<string, string[]>()
  const registerTitle = (value: string, id: string) => {
    const key = value.trim().toLocaleLowerCase()
    if (!key) return
    titles.set(key, [...new Set([...(titles.get(key) ?? []), id])])
  }

  for (const document of [...documents.values()].sort((a, b) => pathKey(a.path).localeCompare(pathKey(b.path)))) {
    const parts = dirname(document.path).split("/").filter(Boolean)
    let parentId = rootId
    let currentPath = ""
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const id = directoryId(currentPath)
      addNode(nodes, {
        id,
        label: part,
        typeLabel: "目录",
        summary: `${currentPath} 下的项目文档目录。`,
        status: "committed",
      })
      addEdge(edges, {
        id: `contains:${parentId}:${id}`,
        source: parentId,
        target: id,
        label: "包含",
        summary: `${nodes.get(parentId)?.label ?? "项目"} 包含 ${part}。`,
      })
      parentId = id
    }

    const id = documentId(document.path)
    const label = documentTitle(document)
    addNode(nodes, {
      id,
      label,
      typeLabel: typeLabel(document.path),
      summary: novelXGraphExcerpt(document.content, `${label} 项目文档。`),
      sourcePath: document.path,
      status: "committed",
    })
    addEdge(edges, {
      id: `contains:${parentId}:${id}`,
      source: parentId,
      target: id,
      label: "包含",
      summary: `${nodes.get(parentId)?.label ?? "项目"} 包含文档 ${label}。`,
    })
    registerTitle(label, id)
    registerTitle(withoutExtension(filename(document.path)), id)
  }

  const knownPaths = new Map(
    [...documents.values()].map((document) => [pathKey(document.path), documentId(document.path)]),
  )
  for (const document of documents.values()) {
    const source = documentId(document.path)
    const linked = new Set<string>()
    for (const target of markdownTargets(document.content)) {
      const resolved = resolveRelativePath(document.path, target)
      if (!resolved) continue
      const candidates = [resolved, `${resolved}.md`, `${resolved}.markdown`]
      const targetId = candidates.map((candidate) => knownPaths.get(pathKey(candidate))).find(Boolean)
      if (targetId && targetId !== source) linked.add(targetId)
    }
    for (const target of wikiTargets(document.content)) {
      const candidates = titles.get(target.toLocaleLowerCase()) ?? []
      if (candidates.length === 1 && candidates[0] !== source) linked.add(candidates[0])
    }
    for (const target of linked) {
      addEdge(edges, {
        id: `links:${source}:${target}`,
        source,
        target,
        label: "引用",
        summary: `${nodes.get(source)?.label ?? "来源文档"} 显式链接到 ${nodes.get(target)?.label ?? "目标文档"}。`,
      })
    }
  }

  return { graph: { nodes: [...nodes.values()], edges: [...edges.values()] }, documentCount: documents.size }
}
