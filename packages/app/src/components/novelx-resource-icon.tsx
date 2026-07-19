import characters from "@/assets/novelx-icons/characters.svg"
import files from "@/assets/novelx-icons/files.svg"
import graph from "@/assets/novelx-icons/graph.svg"
import packageIcon from "@/assets/novelx-icons/package.svg"
import story from "@/assets/novelx-icons/story.svg"
import world from "@/assets/novelx-icons/world.svg"
import type { NovelXResource } from "@/context/novelx-workspace"

const glyphs = { files, world, characters, graph, story, package: packageIcon }

export function NovelXResourceIcon(props: { resource: NovelXResource; size?: number; class?: string }) {
  const size = () => `${props.size ?? 20}px`
  return (
    <span
      class={`novelx-resource-icon${props.class ? ` ${props.class}` : ""}`}
      style={{
        "--novelx-resource-icon": `url("${glyphs[props.resource]}")`,
        width: size(),
        height: size(),
      }}
      aria-hidden="true"
    />
  )
}
