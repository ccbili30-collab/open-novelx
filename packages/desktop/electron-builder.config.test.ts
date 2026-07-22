import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"
import { join } from "node:path"

const channels = [
  { channel: "dev", appId: "ai.novelx.desktop.dev", productName: "NovelX Dev" },
  { channel: "beta", appId: "ai.novelx.desktop.beta", productName: "NovelX Beta" },
  { channel: "prod", appId: "ai.novelx.desktop", productName: "NovelX" },
] as const

for (const channel of channels) {
  test(`uses one Linux desktop identity for ${channel.channel}`, async () => {
    const previous = process.env.OPENCODE_CHANNEL
    process.env.OPENCODE_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?channel=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.OPENCODE_CHANNEL
    else process.env.OPENCODE_CHANNEL = previous

    expect(config.appId).toBe(channel.appId)
    expect(config.extraMetadata?.desktopName).toBe(`${channel.appId}.desktop`)
    expect(config.linux?.executableName).toBe(channel.appId)
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(channel.appId)
    expect(config.productName).toBe(channel.productName)
    expect(config.artifactName).toBe("NovelX-${version}-${os}-${arch}.${ext}")
    expect(config.extraMetadata?.name).toBe("novelx-desktop")
    expect(config.extraMetadata?.homepage).toBe("https://github.com/ccbili30-collab/open-novelx")
    expect(config.protocols).toEqual({
      name: channel.channel === "beta" ? "NovelX Beta" : "NovelX",
      schemes: ["opencode"],
    })
  })
}

test("publishes NovelX channels only to the NovelX repository", async () => {
  const previous = process.env.OPENCODE_CHANNEL
  process.env.OPENCODE_CHANNEL = "prod"

  const module = await import("./electron-builder.config.ts?publish=prod")
  const config = module.default as Configuration

  if (previous === undefined) delete process.env.OPENCODE_CHANNEL
  else process.env.OPENCODE_CHANNEL = previous

  expect(config.publish).toEqual({
    provider: "github",
    owner: "ccbili30-collab",
    repo: "open-novelx",
    channel: "latest",
  })
})

test("ships a multi-size Windows icon for every channel", async () => {
  for (const channel of channels) {
    const bytes = new Uint8Array(await Bun.file(join("icons", channel.channel, "icon.ico")).arrayBuffer())
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(header.getUint16(0, true)).toBe(0)
    expect(header.getUint16(2, true)).toBe(1)
    expect(header.getUint16(4, true)).toBe(6)
  }
})
