import { For, Show, createEffect, createMemo, onCleanup, onMount, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import {
  evolveNovelXSphereLayout,
  novelXGraphExcerpt,
  parseNovelXSphereLayout,
  selectNovelXGraphLabels,
  type NovelXGraph,
  type NovelXGraphNode,
  type NovelXSphereVector,
} from "./novelx-graph-model"

type GraphViewState = {
  query: string
  selectedId?: string
  excerpt: string
  loading: boolean
  refresh: "idle" | "loading" | "success" | "error"
  refreshMessage?: string
}

type ProjectedPoint = NovelXSphereVector & { screenX: number; screenY: number; scale: number }

export function NovelXGraphView(props: {
  graph: Accessor<NovelXGraph>
  storageKey: string
  readSource: (path: string) => Promise<string | undefined>
  onOpenSource: (path: string) => void
  onRefresh: () => Promise<void>
}) {
  const [state, setState] = createStore<GraphViewState>({
    query: "",
    excerpt: "",
    loading: false,
    refresh: "idle",
  })
  const nodeElements = new Map<string, SVGGElement>()
  const edgeElements = new Map<string, SVGLineElement>()
  let scene: HTMLDivElement | undefined
  let frame = 0
  let layout = evolveNovelXSphereLayout({ nodes: [], edges: [] })
  let yaw = 0.24
  let pitch = -0.12
  let targetYaw: number | undefined
  let targetPitch: number | undefined
  let zoom = 1
  let returnView: { yaw: number; pitch: number; zoom: number } | undefined
  let velocityYaw = 0
  let velocityPitch = 0
  let pointerId: number | undefined
  let pointerX = 0
  let pointerY = 0
  let pointerTravel = 0
  let pressedNodeId: string | undefined
  let lastFrame = performance.now()
  let readVersion = 0
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

  const selected = createMemo(() => props.graph().nodes.find((node) => node.id === state.selectedId))
  const connected = createMemo(() => {
    if (!state.selectedId) return new Set<string>()
    const result = new Set([state.selectedId])
    for (const edge of props.graph().edges) {
      if (edge.source === state.selectedId) result.add(edge.target)
      if (edge.target === state.selectedId) result.add(edge.source)
    }
    return result
  })
  const matches = (node: NovelXGraphNode) => {
    const query = state.query.trim().toLocaleLowerCase()
    if (!query) return true
    return `${node.label} ${node.typeLabel} ${node.summary}`.toLocaleLowerCase().includes(query)
  }

  const persistLayout = () => {
    try {
      localStorage.setItem(props.storageKey, JSON.stringify(layout))
    } catch {
      // Sphere coordinates are a disposable display cache.
    }
  }

  const rebuildLayout = () => {
    try {
      localStorage.removeItem(props.storageKey)
    } catch {
      // A blocked display cache must not prevent a graph refresh.
    }
    layout = evolveNovelXSphereLayout(props.graph())
    persistLayout()
    setState("selectedId", undefined)
    returnView = undefined
    targetYaw = undefined
    targetPitch = undefined
    yaw = 0.24
    pitch = -0.12
    zoom = 1
  }

  const refresh = async () => {
    if (state.refresh === "loading") return
    setState({ refresh: "loading", refreshMessage: "正在重新读取项目…" })
    try {
      await props.onRefresh()
      rebuildLayout()
      setState({ refresh: "success", refreshMessage: "图谱已刷新" })
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "无法刷新图谱。"
      setState({ refresh: "error", refreshMessage: message })
    }
  }

  createEffect(() => {
    const graph = props.graph()
    let cached
    try {
      cached = parseNovelXSphereLayout(localStorage.getItem(props.storageKey))
    } catch {
      cached = undefined
    }
    layout = evolveNovelXSphereLayout(graph, Object.keys(layout.positions).length ? layout : cached)
    persistLayout()
    if (state.selectedId && !graph.nodes.some((node) => node.id === state.selectedId)) setState("selectedId", undefined)
  })

  createEffect(() => {
    const node = selected()
    const version = ++readVersion
    setState({ excerpt: node?.summary ?? "", loading: Boolean(node?.sourcePath) })
    if (!node?.sourcePath) return
    void props
      .readSource(node.sourcePath)
      .then((content) => {
        if (version !== readVersion) return
        setState({ excerpt: novelXGraphExcerpt(content ?? "", node.summary), loading: false })
      })
      .catch(() => {
        if (version !== readVersion) return
        setState({ excerpt: node.summary, loading: false })
      })
  })

  const rotate = (point: NovelXSphereVector, width: number, height: number): ProjectedPoint => {
    const cosineYaw = Math.cos(yaw)
    const sineYaw = Math.sin(yaw)
    const cosinePitch = Math.cos(pitch)
    const sinePitch = Math.sin(pitch)
    const x = point.x * cosineYaw + point.z * sineYaw
    const yawZ = -point.x * sineYaw + point.z * cosineYaw
    const y = point.y * cosinePitch - yawZ * sinePitch
    const z = point.y * sinePitch + yawZ * cosinePitch
    const radius = Math.min(width, height) * 0.36 * zoom
    const perspective = 1 + z * 0.13
    return {
      x,
      y,
      z,
      screenX: width / 2 + x * radius * perspective,
      screenY: height / 2 + y * radius * perspective,
      scale: 0.72 + (z + 1) * 0.28,
    }
  }

  const animate = (time: number) => {
    const delta = Math.min(32, time - lastFrame)
    lastFrame = time
    if (targetYaw !== undefined && targetPitch !== undefined) {
      yaw += (targetYaw - yaw) * Math.min(1, delta / 140)
      pitch += (targetPitch - pitch) * Math.min(1, delta / 140)
      if (Math.abs(targetYaw - yaw) + Math.abs(targetPitch - pitch) < 0.002) {
        yaw = targetYaw
        pitch = targetPitch
        targetYaw = undefined
        targetPitch = undefined
      }
    } else if (pointerId === undefined) {
      yaw += velocityYaw
      pitch = Math.max(-1.22, Math.min(1.22, pitch + velocityPitch))
      velocityYaw *= 0.94
      velocityPitch *= 0.92
      if (!state.selectedId && !reduceMotion && Math.abs(velocityYaw) < 0.00015) yaw += delta * 0.000025
    }
    const bounds = scene?.getBoundingClientRect()
    if (bounds?.width && bounds.height) {
      const projected = new Map<string, ProjectedPoint>()
      for (const node of props.graph().nodes) {
        const point = layout.positions[node.id]
        const element = nodeElements.get(node.id)
        if (!point || !element) continue
        const next = rotate(point, bounds.width, bounds.height)
        projected.set(node.id, next)
        const selectedNode = state.selectedId === node.id
        const related = !state.selectedId || connected().has(node.id)
        const visible = matches(node)
        const scale = next.scale * (selectedNode ? 1.65 : 1)
        element.setAttribute("transform", `translate(${next.screenX} ${next.screenY}) scale(${scale})`)
        element.style.opacity = visible ? String((0.3 + (next.z + 1) * 0.35) * (related ? 1 : 0.18)) : "0.07"
        element.style.zIndex = String(Math.round((next.z + 1) * 100))
      }
      const query = state.query.trim()
      const visibleLabels = selectNovelXGraphLabels(
        props.graph().nodes.flatMap((node) => {
          const point = projected.get(node.id)
          if (!point || (query && !matches(node))) return []
          return [
            {
              id: node.id,
              x: point.screenX,
              y: point.screenY + 22 * point.scale,
              z: point.z,
              width: Math.max(node.label.length * 9, node.typeLabel.length * 7) * point.scale,
              height: 30 * point.scale,
              priority: (query ? 500 : 0) + (node.status === "committed" ? 10 : 0),
              pinned: node.id === state.selectedId,
            },
          ]
        }),
        Math.max(8, Math.min(18, Math.floor(bounds.width / 82))),
      )
      for (const [id, element] of nodeElements) element.classList.toggle("is-label-visible", visibleLabels.has(id))
      for (const edge of props.graph().edges) {
        const element = edgeElements.get(edge.id)
        const source = projected.get(edge.source)
        const target = projected.get(edge.target)
        if (!element || !source || !target) continue
        element.setAttribute("x1", String(source.screenX))
        element.setAttribute("y1", String(source.screenY))
        element.setAttribute("x2", String(target.screenX))
        element.setAttribute("y2", String(target.screenY))
        const related = edge.source === state.selectedId || edge.target === state.selectedId
        const depth = Math.max(0, ((source.z + target.z) / 2 + 1) / 2)
        element.style.strokeWidth = state.selectedId ? (related ? "1.6" : "0.85") : "1.15"
        element.style.opacity = state.selectedId
          ? related
            ? String(0.54 + depth * 0.36)
            : "0.02"
          : String(0.1 + depth * 0.18)
      }
    }
    frame = requestAnimationFrame(animate)
  }

  const focus = (node: NovelXGraphNode) => {
    if (state.selectedId === node.id) {
      setState("selectedId", undefined)
      if (returnView) {
        targetYaw = returnView.yaw
        targetPitch = returnView.pitch
        zoom = returnView.zoom
      }
      returnView = undefined
      return
    }
    const point = layout.positions[node.id]
    if (!point) return
    if (!state.selectedId) returnView = { yaw, pitch, zoom }
    targetYaw = Math.atan2(-point.x, point.z)
    targetPitch = Math.atan2(point.y, Math.hypot(point.x, point.z))
    zoom = Math.max(1.08, zoom)
    setState("selectedId", node.id)
  }

  const pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const target = event.target instanceof Element ? event.target : undefined
    if (target?.closest(".novelx-neural-graph-card, input, button")) return
    pointerId = event.pointerId
    pressedNodeId = target?.closest<SVGGElement>("[data-node-id]")?.dataset.nodeId
    pointerX = event.clientX
    pointerY = event.clientY
    pointerTravel = 0
    velocityYaw = 0
    velocityPitch = 0
    targetYaw = undefined
    targetPitch = undefined
    scene?.setPointerCapture(event.pointerId)
  }

  const pointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return
    const x = event.clientX - pointerX
    const y = event.clientY - pointerY
    pointerX = event.clientX
    pointerY = event.clientY
    pointerTravel += Math.abs(x) + Math.abs(y)
    velocityYaw = x * 0.0045
    velocityPitch = y * 0.0045
    yaw += velocityYaw
    pitch = Math.max(-1.22, Math.min(1.22, pitch + velocityPitch))
  }

  const pointerUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return
    scene?.releasePointerCapture(event.pointerId)
    pointerId = undefined
    const node = props.graph().nodes.find((item) => item.id === pressedNodeId)
    pressedNodeId = undefined
    if (pointerTravel <= 6 && node) focus(node)
  }

  const pointerCancel = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return
    scene?.releasePointerCapture(event.pointerId)
    pointerId = undefined
    pressedNodeId = undefined
  }

  onMount(() => {
    frame = requestAnimationFrame(animate)
  })
  onCleanup(() => cancelAnimationFrame(frame))

  return (
    <section class="novelx-neural-graph" aria-label="世界关系图谱">
      <header class="novelx-neural-graph-toolbar">
        <label>
          <span aria-hidden="true">⌕</span>
          <input
            value={state.query}
            onInput={(event) => setState("query", event.currentTarget.value)}
            placeholder="搜索世界节点"
            aria-label="搜索世界节点"
          />
        </label>
        <div class="novelx-neural-graph-toolbar-meta">
          <div>
            <span>{props.graph().nodes.length} 个节点</span>
            <i />
            <span>{props.graph().edges.length} 条关系</span>
          </div>
          <button
            type="button"
            class="novelx-neural-graph-refresh"
            aria-label="刷新图谱"
            title="重新读取当前项目并生成图谱"
            disabled={state.refresh === "loading"}
            onClick={() => void refresh()}
          >
            <span aria-hidden="true">{state.refresh === "loading" ? "…" : "↻"}</span>
          </button>
          <Show when={state.refreshMessage}>
            <small classList={{ "is-error": state.refresh === "error" }} role="status">
              {state.refreshMessage}
            </small>
          </Show>
        </div>
      </header>
      <div
        ref={scene}
        class="novelx-neural-graph-scene"
        classList={{ "is-focused": Boolean(state.selectedId), "is-dragging": pointerId !== undefined }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onWheel={(event) => {
          event.preventDefault()
          zoom = Math.max(0.72, Math.min(1.5, zoom - event.deltaY * 0.0008))
        }}
      >
        <div class="novelx-neural-graph-stars" aria-hidden="true" />
        <svg class="novelx-neural-graph-canvas" aria-hidden="true">
          <g class="novelx-neural-graph-edges">
            <For each={props.graph().edges}>
              {(edge) => <line ref={(element) => edgeElements.set(edge.id, element)} data-edge-id={edge.id} />}
            </For>
          </g>
          <g class="novelx-neural-graph-nodes">
            <For each={props.graph().nodes}>
              {(node) => (
                <g
                  ref={(element) => nodeElements.set(node.id, element)}
                  class="novelx-neural-graph-node"
                  classList={{
                    "is-selected": state.selectedId === node.id,
                    "is-committed": node.status === "committed",
                  }}
                  data-node-id={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.label}，${node.typeLabel}`}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    focus(node)
                  }}
                >
                  <circle class="novelx-neural-node-aura" r="17" />
                  <circle class="novelx-neural-node-orbit" r="10" />
                  <circle class="novelx-neural-node-core" r="3.6" />
                  <text y="27" text-anchor="middle">
                    {node.label}
                  </text>
                  <text class="novelx-neural-node-kind" y="39" text-anchor="middle">
                    {node.typeLabel}
                  </text>
                </g>
              )}
            </For>
          </g>
        </svg>
        <Show when={selected()}>
          {(node) => (
            <button
              type="button"
              class="novelx-neural-graph-card"
              classList={{ "has-source": Boolean(node().sourcePath) }}
              disabled={!node().sourcePath}
              onClick={() => {
                const path = node().sourcePath
                if (path) props.onOpenSource(path)
              }}
            >
              <small>{node().typeLabel}</small>
              <strong>{node().label}</strong>
              <p>{state.loading ? "正在读取原文…" : state.excerpt}</p>
              <span>{node().sourcePath ? "打开原文" : "尚未提交原文"}</span>
            </button>
          )}
        </Show>
        <Show when={!props.graph().nodes.length}>
          <div class="novelx-neural-graph-empty">
            <span>◎</span>
            <strong>世界尚未形成关系节点</strong>
            <p>实体提交后，图谱会在这里自动增密。</p>
          </div>
        </Show>
        <div class="novelx-neural-graph-hint">拖动旋转 · 滚轮缩放 · 点击节点聚焦</div>
      </div>
    </section>
  )
}
