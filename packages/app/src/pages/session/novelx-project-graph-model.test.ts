import { describe, expect, test } from "bun:test"
import { projectNovelXFileGraph } from "./novelx-project-graph-model"

describe("projectNovelXFileGraph", () => {
  test("prefers frontmatter title, then heading, then filename", () => {
    const result = projectNovelXFileGraph({
      projectName: "北境纪行",
      documents: [
        { path: "World/frontmatter.md", content: "---\ntitle: 风雪边境\n---\n# 被覆盖的标题\n\n正文。" },
        { path: "World/heading.md", content: "# 河谷王国\n\n沿河而建。" },
        { path: "World/plain-text.txt", content: "没有显式标题，只有一段普通正文。" },
      ],
    })

    expect(result.graph.nodes.find((node) => node.id === "document:world/frontmatter.md")?.label).toBe("风雪边境")
    expect(result.graph.nodes.find((node) => node.id === "document:world/heading.md")?.label).toBe("河谷王国")
    expect(result.graph.nodes.find((node) => node.id === "document:world/plain-text.txt")?.label).toBe("plain-text")
  })

  test("builds project, directory and document nodes from saved source files", () => {
    const result = projectNovelXFileGraph({
      projectName: "北境纪行",
      documents: [
        { path: "README.md", content: "# 北境纪行\n\n世界总览。" },
        { path: "World/北境.md", content: "# 北境\n\n终年积雪的边境山脉。" },
      ],
    })

    expect(result.documentCount).toBe(2)
    expect(result.graph.nodes.map((node) => node.id)).toEqual([
      "project:北境纪行",
      "document:readme.md",
      "directory:world",
      "document:world/北境.md",
    ])
    expect(result.graph.nodes.find((node) => node.id === "document:world/北境.md")?.sourcePath).toBe("World/北境.md")
    expect(result.graph.nodes.find((node) => node.id === "directory:world")?.sourcePath).toBeUndefined()
    expect(result.graph.edges.map((edge) => [edge.source, edge.target, edge.label])).toContainEqual([
      "directory:world",
      "document:world/北境.md",
      "包含",
    ])
  })

  test("projects unique markdown and wiki links without inventing broken relations", () => {
    const result = projectNovelXFileGraph({
      projectName: "北境纪行",
      documents: [
        {
          path: "World/北境.md",
          content:
            "# 北境\n\n通往[河谷王国](./王国.md)，也见于[[旅人手记]]。重复[河谷王国](./王国.md)。[失落档案](./missing.md)",
        },
        { path: "World/王国.md", content: "# 河谷王国\n\n沿河而建。" },
        { path: "Stories/旅人手记.md", content: "# 旅人手记\n\n一份私人记录。" },
      ],
    })

    const links = result.graph.edges.filter((edge) => edge.label === "引用")
    expect(links.map((edge) => [edge.source, edge.target])).toEqual([
      ["document:world/北境.md", "document:world/王国.md"],
      ["document:world/北境.md", "document:stories/旅人手记.md"],
    ])
  })

  test("leaves an empty project empty instead of fabricating a root node", () => {
    expect(projectNovelXFileGraph({ projectName: "空项目", documents: [] })).toEqual({
      graph: { nodes: [], edges: [] },
      documentCount: 0,
    })
  })
})
