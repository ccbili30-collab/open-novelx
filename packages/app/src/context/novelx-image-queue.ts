import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"
import { useSDK, type DirectorySDK } from "./sdk"

export type NovelXImageTaskStatus = "queued" | "generating" | "validating" | "failed"
export type NovelXImageTaskKind = "map" | "scenery" | "portrait" | "cover"

export type NovelXImageTaskProjection = {
  id: string
  kind: NovelXImageTaskKind
  title: string
  status: NovelXImageTaskStatus
  errorCode?: string | null
}

type WorldVisualLike = {
  tasks: ReadonlyArray<{
    id: string
    type: "map" | "scenery"
    title: string
    status: NovelXImageTaskStatus | "attached"
    errorCode?: string | null
  }>
}

type PortraitLike = {
  task: {
    id: string
    title: string
    status: NovelXImageTaskStatus | "attached"
    errorCode?: string | null
  }
}

type CoversLike = {
  tasks: ReadonlyArray<{
    id: string
    title: string
    status: NovelXImageTaskStatus | "attached"
    errorCode?: string | null
  }>
}

export function projectNovelXImageTasks(input: {
  world?: WorldVisualLike
  portrait?: PortraitLike
  covers?: CoversLike
}): NovelXImageTaskProjection[] {
  const result: NovelXImageTaskProjection[] = []
  for (const task of input.world?.tasks ?? []) {
    if (task.status === "attached") continue
    result.push({ id: task.id, kind: task.type, title: task.title, status: task.status, errorCode: task.errorCode })
  }
  const portrait = input.portrait?.task
  if (portrait && portrait.status !== "attached") {
    result.push({
      id: portrait.id,
      kind: "portrait",
      title: portrait.title,
      status: portrait.status,
      errorCode: portrait.errorCode,
    })
  }
  for (const task of input.covers?.tasks ?? []) {
    if (task.status === "attached") continue
    result.push({ id: task.id, kind: "cover", title: task.title, status: task.status, errorCode: task.errorCode })
  }
  return result
}

type RuntimeState = {
  paused: boolean
  jobs: Array<{
    kind: "world" | "character" | "story"
    available: boolean
    status: "idle" | "running" | "completed" | "error" | "cancelled"
    error?: string
  }>
}

export type NovelXImageQueueRuntimeState =
  | { status: "loading" }
  | ({ status: "ready" } & RuntimeState)
  | { status: "error"; message: string }

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function createNovelXImageQueueController(input: {
  tasks: Accessor<readonly NovelXImageTaskProjection[]>
  reload: () => void | Promise<unknown>
}) {
  const sdk = useSDK()
  const [state, setState] = createSignal<NovelXImageQueueRuntimeState>({ status: "loading" })
  const [busy, setBusy] = createSignal(false)
  let version = 0
  let autoResumeKey = ""

  const load = async (current: DirectorySDK) => {
    const run = ++version
    try {
      const result = await current.client.experimental.novelxImageQueue.get()
      if (run !== version) return
      if (!result.data) throw result.error ?? new Error("图片队列状态缺失。")
      setState({ status: "ready", ...result.data })
    } catch (error) {
      if (run !== version) return
      setState({ status: "error", message: message(error) })
    }
  }

  const control = async (action: "resume" | "pause" | "retry_failed") => {
    if (busy()) return
    setBusy(true)
    try {
      const current = sdk()
      const result = await current.client.experimental.novelxImageQueue.control({ action })
      if (!result.data) throw result.error ?? new Error("图片队列控制失败。")
      setState({ status: "ready", ...result.data })
      await input.reload()
    } catch (error) {
      setState({ status: "error", message: message(error) })
    } finally {
      setBusy(false)
    }
  }

  createEffect(() => {
    const current = sdk()
    void load(current)
    const timer = setInterval(() => void load(current), 2_000)
    onCleanup(() => clearInterval(timer))
  })

  createEffect(() => {
    const current = state()
    if (current.status !== "ready" || current.paused || busy()) return
    if (current.jobs.some((job) => job.status === "running")) return
    const runnable = input
      .tasks()
      .filter((task) => task.status === "queued" || task.status === "generating" || task.status === "validating")
    if (!runnable.length) return
    const key = `${sdk().directory}:${runnable.map((task) => task.id).join(",")}`
    if (autoResumeKey === key) return
    autoResumeKey = key
    void control("resume")
  })

  return {
    state,
    busy,
    reload: () => load(sdk()),
    pause: () => control("pause"),
    resume: () => control("resume"),
    retryFailed: () => control("retry_failed"),
  }
}
