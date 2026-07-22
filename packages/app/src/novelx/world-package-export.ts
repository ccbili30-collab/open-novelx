import type { NovelXWorldPackage } from "./world-package"
export { createNovelXWorldPackageHtml } from "./world-package-browser-template"
import { createNovelXWorldPackageHtml } from "./world-package-browser-template"

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

function zipStore(entries: readonly ZipEntry[]) {
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.bytes)
    const record = new Uint8Array(30 + name.length + entry.bytes.length)
    const view = new DataView(record.buffer)
    write32(view, 0, 0x04034b50)
    write16(view, 4, 20)
    write16(view, 6, 0x800)
    write16(view, 8, 0)
    write16(view, 10, 0)
    write16(view, 12, 0)
    write32(view, 14, crc)
    write32(view, 18, entry.bytes.length)
    write32(view, 22, entry.bytes.length)
    write16(view, 26, name.length)
    write16(view, 28, 0)
    record.set(name, 30)
    record.set(entry.bytes, 30 + name.length)
    local.push(record)

    const directory = new Uint8Array(46 + name.length)
    const directoryView = new DataView(directory.buffer)
    write32(directoryView, 0, 0x02014b50)
    write16(directoryView, 4, 20)
    write16(directoryView, 6, 20)
    write16(directoryView, 8, 0x800)
    write16(directoryView, 10, 0)
    write16(directoryView, 12, 0)
    write16(directoryView, 14, 0)
    write32(directoryView, 16, crc)
    write32(directoryView, 20, entry.bytes.length)
    write32(directoryView, 24, entry.bytes.length)
    write16(directoryView, 28, name.length)
    write16(directoryView, 30, 0)
    write16(directoryView, 32, 0)
    write16(directoryView, 34, 0)
    write16(directoryView, 36, 0)
    write32(directoryView, 38, 0)
    write32(directoryView, 42, offset)
    directory.set(name, 46)
    central.push(directory)
    offset += record.length
  }
  const size = local.reduce((sum, item) => sum + item.length, 0)
  const directorySize = central.reduce((sum, item) => sum + item.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  write32(endView, 0, 0x06054b50)
  write16(endView, 8, entries.length)
  write16(endView, 10, entries.length)
  write32(endView, 12, directorySize)
  write32(endView, 16, size)
  return concat([...local, ...central, end])
}

function concat(chunks: readonly Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
