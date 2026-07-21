import { describe, expect, test } from "bun:test"
import { openCreatedProject } from "./project-create-flow"

describe("openCreatedProject", () => {
  test("verifies the runtime before registering and activating the project", async () => {
    const calls: string[] = []
    await openCreatedProject({
      directory: "C:/NovelX/New World",
      verify: async () => {
        calls.push("verify")
        return true
      },
      register: () => calls.push("register"),
      unregister: () => calls.push("unregister"),
      activate: async () => void calls.push("activate"),
    })
    expect(calls).toEqual(["verify", "register", "activate"])
  })

  test("does not register a directory that the runtime cannot open", async () => {
    const calls: string[] = []
    await expect(
      openCreatedProject({
        directory: "C:/NovelX/Broken",
        verify: async () => false,
        register: () => calls.push("register"),
        unregister: () => calls.push("unregister"),
        activate: async () => void calls.push("activate"),
      }),
    ).rejects.toThrow("did not open")
    expect(calls).toEqual([])
  })

  test("removes a newly registered project when draft activation fails", async () => {
    const calls: string[] = []
    await expect(
      openCreatedProject({
        directory: "C:/NovelX/Activation Failure",
        verify: async () => true,
        register: () => calls.push("register"),
        unregister: () => calls.push("unregister"),
        activate: async () => {
          calls.push("activate")
          throw new Error("draft failed")
        },
      }),
    ).rejects.toThrow("draft failed")
    expect(calls).toEqual(["register", "activate", "unregister"])
  })
})
