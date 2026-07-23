import { describe, expect, test } from "bun:test"
import { projectNovelXImageTasks } from "./novelx-image-queue"

describe("NovelX Growth image queue projection", () => {
  test("combines Growth visuals and removes attached tasks", () => {
    const tasks = projectNovelXImageTasks({
      world: {
        tasks: [
          { id: "map", type: "map", title: "世界底图", status: "queued" },
          { id: "view", type: "scenery", title: "山口风貌", status: "attached" },
        ],
      },
      portrait: { task: { id: "portrait", title: "岚砾", status: "generating" } },
      covers: { tasks: [{ id: "cover", title: "盐骨长路", status: "failed", errorCode: "FAILED" }] },
    })

    expect(tasks).toEqual([
      { id: "map", kind: "map", title: "世界底图", status: "queued", errorCode: undefined },
      { id: "portrait", kind: "portrait", title: "岚砾", status: "generating", errorCode: undefined },
      { id: "cover", kind: "cover", title: "盐骨长路", status: "failed", errorCode: "FAILED" },
    ])
  })

  test("does not accept Study visual candidates", () => {
    expect(projectNovelXImageTasks({})).toEqual([])
  })
})
