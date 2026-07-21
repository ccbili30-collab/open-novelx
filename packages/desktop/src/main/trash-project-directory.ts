import { isAbsolute, parse, relative, resolve } from "node:path"
import { randomUUID } from "node:crypto"

type DirectoryStat = { isDirectory(): boolean }

const samePath = (left: string, right: string) =>
  process.platform === "win32" ? left.toLocaleLowerCase() === right.toLocaleLowerCase() : left === right

const containsPath = (parent: string, child: string) => {
  if (samePath(parent, child)) return true
  const value = relative(parent, child)
  return value !== "" && !value.startsWith("..") && !isAbsolute(value)
}

export function validateTrashProjectDirectory(input: string, blockedPaths: readonly string[]) {
  if (typeof input !== "string" || !input.trim()) throw new Error("Project directory is required")
  if (!isAbsolute(input)) throw new Error("Project directory must be an absolute path")
  const target = resolve(input)
  if (samePath(target, parse(target).root)) throw new Error("Refusing to trash a filesystem root")
  for (const blocked of blockedPaths) {
    if (!blocked) continue
    if (containsPath(target, resolve(blocked))) throw new Error("Refusing to trash a protected directory")
  }
  return target
}

export async function resolveTrashProjectDirectory(
  input: string,
  deps: {
    blockedPaths: readonly string[]
    stat: (path: string) => Promise<DirectoryStat>
  },
) {
  const target = validateTrashProjectDirectory(input, deps.blockedPaths)
  const info = await deps.stat(target)
  if (!info.isDirectory()) throw new Error("Project path is not a directory")
  return target
}

export async function trashProjectDirectory(
  input: string,
  deps: {
    blockedPaths: readonly string[]
    stat: (path: string) => Promise<DirectoryStat>
    trashItem: (path: string) => Promise<void>
  },
) {
  const target = await resolveTrashProjectDirectory(input, deps)
  await deps.trashItem(target)
}

export function createProjectTrashAuthorizations(input?: { now?: () => number; token?: () => string; ttlMs?: number }) {
  const now = input?.now ?? Date.now
  const token = input?.token ?? randomUUID
  const ttlMs = input?.ttlMs ?? 60_000
  const grants = new Map<string, { path: string; webContentsID: number; expiresAt: number }>()

  return {
    issue(path: string, webContentsID: number) {
      const value = token()
      grants.set(value, { path, webContentsID, expiresAt: now() + ttlMs })
      return value
    },
    consume(value: string, webContentsID: number) {
      const grant = grants.get(value)
      grants.delete(value)
      if (!grant || grant.webContentsID !== webContentsID || grant.expiresAt < now()) {
        throw new Error("Project trash authorization is invalid or expired")
      }
      return grant.path
    },
    clear() {
      grants.clear()
    },
  }
}
