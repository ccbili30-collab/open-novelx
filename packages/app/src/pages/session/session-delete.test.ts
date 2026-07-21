import { describe, expect, test } from "bun:test"
import {
  assertCompleteSessionList,
  collectSessionDeletionIDs,
  discoverSessionDeletionNodes,
  requestSessionDeletion,
  sessionExistsFromGetResult,
} from "./session-delete"

describe("session deletion", () => {
  const sessions = [
    { id: "root" },
    { id: "child", parentID: "root" },
    { id: "grandchild", parentID: "child" },
    { id: "other" },
  ]

  test("collects the selected session and every descendant exactly once", () => {
    expect(collectSessionDeletionIDs(sessions, "root")).toEqual(["root", "child", "grandchild"])
  })

  const children = async (parentID: string) => sessions.filter((session) => session.parentID === parentID)

  test("discovers descendants from the authoritative child endpoint", async () => {
    expect((await discoverSessionDeletionNodes({ sessionID: "root", children })).map((session) => session.id)).toEqual([
      "root",
      "child",
      "grandchild",
    ])
  })

  test("idempotently stops every discovered member before requesting the recursive delete", async () => {
    const calls: string[] = []
    const result = await requestSessionDeletion({
      sessionID: "root",
      children,
      abort: async (id) => void calls.push(`abort:${id}`),
      remove: async (id) => {
        calls.push(`delete:${id}`)
        return true
      },
      exists: async () => false,
    })

    expect(calls).toEqual(["abort:root", "abort:child", "abort:grandchild", "delete:root"])
    expect(result).toEqual(["root", "child", "grandchild"])
  })

  test("fails closed when abort fails and never sends the delete request", async () => {
    const calls: string[] = []
    await expect(
      requestSessionDeletion({
        sessionID: "root",
        children,
        abort: async (id) => {
          calls.push(`abort:${id}`)
          throw new Error("abort failed")
        },
        remove: async (id) => {
          calls.push(`delete:${id}`)
          return true
        },
        exists: async () => false,
      }),
    ).rejects.toThrow("abort failed")
    expect(calls).toEqual(["abort:root"])
  })

  test("treats a false delete response as failure", async () => {
    await expect(
      requestSessionDeletion({
        sessionID: "root",
        children,
        abort: async () => {},
        remove: async () => false,
        exists: async () => false,
      }),
    ).rejects.toThrow("Session delete was rejected")
  })

  test("fails closed when the server claims success but a descendant remains", async () => {
    await expect(
      requestSessionDeletion({
        sessionID: "root",
        children,
        abort: async () => {},
        remove: async () => true,
        exists: async (id) => id === "grandchild",
      }),
    ).rejects.toThrow("Session still exists after deletion: grandchild")
  })

  test("distinguishes an authoritative not-found response from an unverifiable failure", () => {
    expect(sessionExistsFromGetResult({ data: { id: "root" } })).toBe(true)
    expect(sessionExistsFromGetResult({ error: { name: "NotFoundError" } })).toBe(false)
    expect(() => sessionExistsFromGetResult({ error: { name: "NetworkError" } })).toThrow(
      "Unable to verify that the session was deleted",
    )
  })

  test("fails closed when a capped project-session query may be incomplete", () => {
    expect(assertCompleteSessionList([{ id: "one" }], 2)).toEqual([{ id: "one" }])
    expect(() => assertCompleteSessionList([{ id: "one" }, { id: "two" }], 2)).toThrow(
      "Unable to prove the project session list is complete",
    )
  })
})
