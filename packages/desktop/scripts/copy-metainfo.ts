import { resolveChannel } from "./utils"

const arg = process.argv[2]
const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

const appId = channel === "prod" ? "ai.novelx.desktop" : `ai.novelx.desktop.${channel}`
const productName = channel === "prod" ? "NovelX" : `NovelX ${channel.charAt(0).toUpperCase() + channel.slice(1)}`
const summary = `Agent-native worldbuilding and fiction creation workbench${channel !== "prod" ? ` (${channel})` : ""}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="io.github.ccbili30-collab">
    <name>NovelX Contributors</name>
  </developer>

  <description>
    <p>
      NovelX is an Agent-native workbench for creating coherent worlds, stories, and original characters.
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <url type="bugtracker">https://github.com/ccbili30-collab/open-novelx/issues</url>
  <url type="homepage">https://github.com/ccbili30-collab/open-novelx</url>
  <url type="vcs-browser">https://github.com/ccbili30-collab/open-novelx</url>
</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)
console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)
