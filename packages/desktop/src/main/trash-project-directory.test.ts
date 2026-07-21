import { describe, expect, test } from "bun:test"
import { dirname, parse, resolve } from "node:path"
import {
  createProjectTrashAuthorizations,
  trashProjectDirectory,
  validateTrashProjectDirectory,
} from "./trash-project-directory"

describe("trashProjectDirectory", () => {
  const home = resolve("C:/Users/NovelXUser")

  test("rejects relative paths, volume roots, protected paths, and their ancestors", () => {
    expect(() => validateTrashProjectDirectory("relative/project", [home])).toThrow("absolute")
    expect(() => validateTrashProjectDirectory(parse(home).root, [home])).toThrow("root")
    expect(() => validateTrashProjectDirectory(home, [home])).toThrow("protected")
    expect(() => validateTrashProjectDirectory(dirname(home), [home])).toThrow("protected")
  })

  test("allows a project below a protected desktop directory without allowing the desktop itself", () => {
    const desktop = resolve(home, "Desktop")
    expect(validateTrashProjectDirectory(resolve(desktop, "MyNovel"), [home, desktop])).toBe(
      resolve(desktop, "MyNovel"),
    )
  })

  test("checks that the target is a directory before invoking the recoverable trash operation", async () => {
    const calls: string[] = []
    const target = resolve(home, "Desktop", "MyNovel")
    await trashProjectDirectory(target, {
      blockedPaths: [home],
      stat: async () => ({ isDirectory: () => true }),
      trashItem: async (path) => void calls.push(path),
    })
    expect(calls).toEqual([target])

    await expect(
      trashProjectDirectory(target, {
        blockedPaths: [home],
        stat: async () => ({ isDirectory: () => false }),
        trashItem: async () => {},
      }),
    ).rejects.toThrow("directory")
  })

  test("binds a one-use authorization to the confirming renderer and expires it", () => {
    let now = 100
    let sequence = 0
    const grants = createProjectTrashAuthorizations({
      now: () => now,
      token: () => `grant-${++sequence}`,
      ttlMs: 50,
    })
    const first = grants.issue("C:/NovelX/One", 7)
    expect(grants.consume(first, 7)).toBe("C:/NovelX/One")
    expect(() => grants.consume(first, 7)).toThrow("invalid or expired")

    const wrongOwner = grants.issue("C:/NovelX/Two", 7)
    expect(() => grants.consume(wrongOwner, 8)).toThrow("invalid or expired")

    const expired = grants.issue("C:/NovelX/Three", 7)
    now = 151
    expect(() => grants.consume(expired, 7)).toThrow("invalid or expired")
  })
})
