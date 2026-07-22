import { Icon } from "@opencode-ai/ui/icon"
import type { NovelXWorld, NovelXWorldPublication, NovelXWorldVisual } from "@opencode-ai/schema"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { NovelXResourceIcon } from "@/components/novelx-resource-icon"
import {
  advanceNovelXWorldMapSelection,
  novelXWorldMapVariantProgress,
  novelXWorldStatusLabel,
  resolveNovelXWorldMapRasterTask,
  type NovelXWorldMapMode,
  type NovelXWorldMapSelection,
  type NovelXWorldNavigationItem,
} from "@/context/novelx-world-growth"
import { For, Show, createMemo, createSignal } from "solid-js"

type WorldProps = {
  blueprint: NovelXWorld.BlueprintManifest
  materialization?: NovelXWorld.WorldMaterialization
  visual?: NovelXWorldVisual.Manifest
  visualAssets?: Record<string, string>
  publication?: NovelXWorldPublication.Manifest
  publicationTexts?: Record<string, { atlas?: string; travelogue?: string }>
  selectedStage?: NovelXWorld.BlueprintStage
  selectedEntity?: NovelXWorld.RegisteredEntity
  selectedDocument?: NovelXWorld.WorldDocumentRecord
  selectedChildText: () => string
  selectedChildSessionId?: string
  status: (entityId: string) => NovelXWorld.WorldDocumentStatus
  onSelectEntity?: (entityId: string) => void
}

const mapRingPath = (rings: readonly (readonly { x: number; y: number }[])[]) =>
  rings.map((ring) => `M ${ring.map((point) => `${point.x * 1024} ${point.y * 1024}`).join(" L ")} Z`).join(" ")

const mapLinePath = (points: readonly { x: number; y: number }[]) =>
  points.length ? `M ${points.map((point) => `${point.x * 1024} ${point.y * 1024}`).join(" L ")}` : ""

function NovelXWorldAtlas(props: WorldProps) {
  const [mode, setMode] = createSignal<NovelXWorldMapMode>("geography")
  const [selection, setSelection] = createSignal<NovelXWorldMapSelection>({ state: "idle" })
  const [zoom, setZoom] = createSignal(1)
  const [publicationKind, setPublicationKind] = createSignal<"atlas" | "travelogue">("atlas")
  const mapTask = () =>
    props.visual?.tasks.find(
      (task) => task.type === "map" && (props.visual?.schemaVersion === 2 || task.mapRole === "base"),
    )
  const displayedMapTask = createMemo(() => {
    const visual = props.visual
    return visual ? resolveNovelXWorldMapRasterTask(visual, mode(), selection()) : undefined
  })
  const variantProgress = createMemo(() => {
    const visual = props.visual
    if (!visual || visual.schemaVersion !== 3) return undefined
    return novelXWorldMapVariantProgress(
      visual,
      mode() === "geography" ? "geography" : mode() === "human" ? "human" : undefined,
    )
  })
  const mapAsset = () => {
    const task = displayedMapTask()
    return task ? props.visualAssets?.[task.id] : undefined
  }
  const layerFeatures = createMemo(() => {
    if (!props.visual || mode() === "art" || mode() === "semantic") return []
    return props.visual.atlas.features.filter(
      (feature) => feature.layer === (mode() === "geography" ? "geography" : "human"),
    )
  })
  const selectedFeature = createMemo(() => {
    const current = selection()
    return current.state === "idle"
      ? undefined
      : props.visual?.atlas.features.find(
          (feature) =>
            feature.entityId === current.entityId && feature.layer === (mode() === "geography" ? "geography" : "human"),
        )
  })
  const scenery = createMemo(() => {
    const selected = selectedFeature()
    if (!selected || !props.visual) return undefined
    return props.visual.tasks.find((task) => task.type === "scenery" && task.ownerEntityId === selected.entityId)
  })
  const selectFeature = (feature: NovelXWorldVisual.AtlasFeature) => {
    if (mode() === "art" || mode() === "semantic") return
    const next = advanceNovelXWorldMapSelection(selection(), feature.entityId)
    setSelection(next)
    if (next.state === "focused") setPublicationKind("atlas")
  }
  const transform = createMemo(() => {
    const current = selection()
    const feature = selectedFeature()
    if (current.state !== "focused" || !feature) {
      return `translate(${512 - 512 * zoom()} ${512 - 512 * zoom()}) scale(${zoom()})`
    }
    const points =
      feature.geometry === "area" ? feature.rings.flat() : feature.path.length ? feature.path : [feature.labelPoint]
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const scale = Math.min(3.2, Math.max(1.35, 0.76 / Math.max(maxX - minX, maxY - minY, 0.08)))
    const centerX = ((minX + maxX) / 2) * 1024
    const centerY = ((minY + maxY) / 2) * 1024
    return `translate(${512 - centerX * scale} ${512 - centerY * scale}) scale(${scale})`
  })
  const surfaceColor: Record<NovelXWorldVisual.Surface, string> = {
    ocean: "#2a5b7c",
    plain: "#7c9159",
    mountain: "#68655e",
    desert: "#b49051",
    marsh: "#3d766d",
    coast: "#b0a473",
    forest: "#376748",
    ice: "#c6d3d3",
  }
  return (
    <div class="novelx-world-atlas" aria-label={`${props.blueprint.profile.title}世界地图`}>
      <header class="novelx-world-atlas-toolbar">
        <div>
          <strong>{props.blueprint.profile.title}</strong>
          <span>世界图册 / 主大陆</span>
          <Show when={variantProgress()}>
            {(progress) => (
              <span>
                状态图 {progress().attached}/{progress().total}
                {progress().failed ? ` · ${progress().failed} 张失败` : ""}
              </span>
            )}
          </Show>
        </div>
        <nav aria-label="地图图层">
          <For
            each={
              [
                ["art", "底图"],
                ["geography", "地理"],
                ["human", "国家"],
                ["semantic", "语义"],
              ] as const
            }
          >
            {(item) => (
              <button
                type="button"
                classList={{ "is-active": mode() === item[0] }}
                onClick={() => {
                  setMode(item[0])
                  setSelection({ state: "idle" })
                }}
              >
                {item[1]}
              </button>
            )}
          </For>
        </nav>
      </header>
      <div class="novelx-world-atlas-main" classList={{ "is-focused": selection().state === "focused" }}>
        <div
          class="novelx-world-atlas-canvas"
          onWheel={(event) => {
            if (selection().state === "focused") return
            event.preventDefault()
            setZoom((value) => Math.min(2.4, Math.max(0.72, value + (event.deltaY < 0 ? 0.12 : -0.12))))
          }}
        >
          <Show
            when={props.visual}
            fallback={
              <div class="novelx-world-atlas-empty">
                <NovelXResourceIcon resource="world" size={30} />
                <strong>地图尚未注册</strong>
                <span>世界档案完成后，视觉主编会建立权威坐标和图片队列。</span>
              </div>
            }
          >
            {(visual) => (
              <svg viewBox="0 0 1024 1024" role="img" aria-label="可交互世界地图">
                <g transform={transform()}>
                  <Show when={mapAsset()} fallback={<rect width="1024" height="1024" fill="#eee8dd" />}>
                    {(src) => (
                      <image
                        href={src()}
                        width="1024"
                        height="1024"
                        preserveAspectRatio="xMidYMid slice"
                        data-map-task-id={displayedMapTask()?.id}
                      />
                    )}
                  </Show>
                  <Show when={mode() === "semantic"}>
                    <For each={visual().atlas.cells}>
                      {(cell) => {
                        const points = () =>
                          cell.polygon.map((point) => `${point.x * 1024},${point.y * 1024}`).join(" ")
                        return (
                          <polygon
                            points={points()}
                            fill={surfaceColor[cell.surface]}
                            stroke="rgba(255,255,255,.28)"
                            stroke-width="0.55"
                            class="is-debug"
                          />
                        )
                      }}
                    </For>
                  </Show>
                  <For each={layerFeatures()}>
                    {(feature) => {
                      const selected = () => selectedFeature()?.entityId === feature.entityId
                      return (
                        <g classList={{ "is-selected": selected() }}>
                          <Show when={feature.geometry === "area"}>
                            <path
                              class="novelx-world-map-region"
                              d={mapRingPath(feature.rings)}
                              fill-rule="evenodd"
                              onClick={() => selectFeature(feature)}
                            />
                          </Show>
                          <Show when={feature.geometry === "line"}>
                            <path
                              class="novelx-world-map-line-hit"
                              d={mapLinePath(feature.path)}
                              onClick={() => selectFeature(feature)}
                            />
                            <path class="novelx-world-map-line" d={mapLinePath(feature.path)} />
                          </Show>
                          <Show when={feature.geometry === "point"}>
                            <circle
                              class="novelx-world-map-point"
                              cx={feature.labelPoint.x * 1024}
                              cy={feature.labelPoint.y * 1024}
                              r="10"
                              onClick={() => selectFeature(feature)}
                            />
                          </Show>
                          <g
                            class="novelx-world-map-label"
                            transform={`translate(${feature.labelPoint.x * 1024} ${feature.labelPoint.y * 1024})`}
                            onClick={() => selectFeature(feature)}
                          >
                            <circle r="4" />
                            <text y="-10" text-anchor="middle">
                              {feature.label}
                            </text>
                          </g>
                        </g>
                      )
                    }}
                  </For>
                </g>
              </svg>
            )}
          </Show>
          <Show when={props.visual && !mapAsset()}>
            <div class="novelx-world-map-status" data-status={mapTask()?.status ?? "queued"}>
              <i aria-hidden="true" />
              {mapTask()?.status === "failed"
                ? `地图生成失败 · ${mapTask()?.errorCode}`
                : mapTask()?.status === "generating" || mapTask()?.status === "validating"
                  ? "真实地图生成中"
                  : "地图任务已排队"}
            </div>
          </Show>
          <div class="novelx-world-map-zoom" aria-label="地图缩放">
            <button type="button" onClick={() => setZoom((value) => Math.min(2.4, value + 0.2))}>
              ＋
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1)
                setSelection({ state: "idle" })
              }}
            >
              适应
            </button>
            <button type="button" onClick={() => setZoom((value) => Math.max(0.72, value - 0.2))}>
              −
            </button>
          </div>
        </div>
        <Show when={selection().state === "focused" && selectedFeature()} keyed>
          {(feature) => {
            const texts = () => props.publicationTexts?.[feature.entityId]
            const imageTask = scenery()
            const image = () => (imageTask ? props.visualAssets?.[imageTask.id] : undefined)
            return (
              <aside class="novelx-world-map-details" aria-label={`${feature.label}详细内容`}>
                <header>
                  <div>
                    <small>
                      {feature.kind === "polity" ? "国家" : feature.kind === "organization" ? "组织" : "地理"}
                    </small>
                    <strong>{feature.label}</strong>
                  </div>
                  <button type="button" aria-label="关闭详细内容" onClick={() => setSelection({ state: "idle" })}>
                    <Icon name="close-small" size="small" />
                  </button>
                </header>
                <Show when={image()}>{(src) => <img src={src()} alt={imageTask?.title ?? feature.label} />}</Show>
                <Show when={texts()?.travelogue}>
                  <nav aria-label="文稿类型">
                    <button
                      type="button"
                      classList={{ "is-active": publicationKind() === "atlas" }}
                      onClick={() => setPublicationKind("atlas")}
                    >
                      图志
                    </button>
                    <button
                      type="button"
                      classList={{ "is-active": publicationKind() === "travelogue" }}
                      onClick={() => setPublicationKind("travelogue")}
                    >
                      纪行
                    </button>
                  </nav>
                </Show>
                <div class="novelx-world-map-details-copy">
                  <Show when={texts()?.[publicationKind()] ?? texts()?.atlas} fallback={<p>{feature.summary}</p>}>
                    {(text) => <Markdown text={text()} />}
                  </Show>
                </div>
                <button
                  type="button"
                  class="novelx-world-map-open-document"
                  onClick={() => props.onSelectEntity?.(feature.entityId)}
                >
                  打开可编辑文稿
                </button>
              </aside>
            )
          }}
        </Show>
      </div>
    </div>
  )
}

export function NovelXWorldGrowthTree(
  props: WorldProps & {
    items: NovelXWorldNavigationItem[]
    query: string
    selectedId?: string
    onQuery: (value: string) => void
    onSelect: (item: NovelXWorldNavigationItem) => void
  },
) {
  const records = () => new Map(props.materialization?.stages.map((stage) => [stage.stageId, stage]) ?? [])
  const committed = () => props.materialization?.documents.filter((record) => record.status === "committed").length ?? 0
  const total = () => props.blueprint.stages.reduce((sum, stage) => sum + stage.itemCount, 0)
  return (
    <section class="novelx-growth-tree" aria-label="世界档案">
      <label class="novelx-terrain-search">
        <Icon name="magnifying-glass" size="small" />
        <input
          type="search"
          value={props.query}
          placeholder="搜索世界档案"
          aria-label="搜索世界档案"
          onInput={(event) => props.onQuery(event.currentTarget.value)}
        />
      </label>
      <div class="novelx-growth-tree-heading">
        <strong>{props.blueprint.profile.genre.scale}</strong>
        <span>
          {props.materialization?.status === "completed" ? `${total()} 项` : `${committed()}/${total()} 已提交`}
        </span>
      </div>
      <For
        each={props.items.filter((item) =>
          item.label.toLocaleLowerCase().includes(props.query.trim().toLocaleLowerCase()),
        )}
      >
        {(item) => {
          const stageRecord = () => records().get(item.stageId)
          const documentStatus = () => (item.kind === "entity" ? props.status(item.id) : undefined)
          const stageLabel = () => {
            if (item.kind === "root") {
              return props.materialization?.status === "completed" ? "世界已完成" : "统筹中"
            }
            if (item.kind === "editor") return stageRecord()?.status === "completed" ? "已返回" : "工作中"
            const record = stageRecord()
            if (!record || record.status === "planned") return "待规划"
            if (record.status === "prepared") return "主编注册中"
            if (record.status === "reviewing") return "主编审核中"
            if (record.status === "completed") return "已完成"
            if (record.status === "waiting_user") return "等待用户"
            if (record.status === "failed") return "失败"
            return `${record.entities.length} 项`
          }
          return (
            <button
              type="button"
              class="novelx-growth-tree-item"
              classList={{
                "is-selected": props.selectedId === item.id,
                "is-world-stage": item.kind === "stage" || item.kind === "root",
              }}
              style={{ "--novelx-growth-depth": item.depth }}
              aria-pressed={props.selectedId === item.id}
              aria-label={item.label}
              title={item.label}
              onClick={() => props.onSelect(item)}
            >
              <span
                class="novelx-growth-tree-mark"
                data-kind={item.kind}
                data-status={item.kind === "entity" ? documentStatus() : stageRecord()?.status}
                aria-hidden="true"
              />
              <span class="novelx-growth-tree-label">{item.label}</span>
              <Show when={props.materialization?.status !== "completed"}>
                <small>{item.kind === "entity" ? novelXWorldStatusLabel(documentStatus()) : stageLabel()}</small>
              </Show>
            </button>
          )
        }}
      </For>
    </section>
  )
}

export function NovelXWorldGrowthPrimary(props: WorldProps) {
  const progress = () => ({
    committed: props.materialization?.documents.filter((record) => record.status === "committed").length ?? 0,
    total: props.blueprint.stages.reduce((sum, stage) => sum + stage.itemCount, 0),
  })
  return (
    <Show
      when={props.selectedStage}
      keyed
      fallback={
        props.materialization?.status === "completed" || props.visual ? (
          <NovelXWorldAtlas {...props} />
        ) : (
          <div class="novelx-terrain-atlas is-empty" aria-label={`${props.blueprint.profile.title}世界总览`}>
            <div class="novelx-terrain-empty-map-mark" aria-hidden="true">
              <NovelXResourceIcon resource="world" size={30} />
            </div>
            <strong>世界正在生长</strong>
            <span>{props.blueprint.profile.designSummary}</span>
            <small>
              {progress().committed}/{progress().total} 份世界档案已提交 · 地图等待世界封存
            </small>
          </div>
        )
      }
    >
      {(stage) => {
        const record = () => props.materialization?.stages.find((item) => item.stageId === stage.id)
        const dependencies = () =>
          stage.dependsOnStageIds
            .map((id) => props.blueprint.stages.find((item) => item.id === id)?.label)
            .filter((label): label is string => !!label)
        return (
          <Show
            when={props.selectedEntity}
            keyed
            fallback={
              props.materialization?.status === "completed" ? (
                <article class="novelx-world-publication-stage">
                  <header>
                    <span>{props.blueprint.profile.genre.scale}</span>
                    <h2>{stage.label}</h2>
                    <p>{stage.purpose}</p>
                  </header>
                  <div class="novelx-world-publication-stage-list">
                    <For each={record()?.entities ?? []}>
                      {(entity) => (
                        <button type="button" onClick={() => props.onSelectEntity?.(entity.id)}>
                          <small>{entity.typeLabel}</small>
                          <strong>{entity.name}</strong>
                          <span>{entity.summary}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </article>
              ) : (
                <article class="novelx-geography-draft is-world-stage" data-status={record()?.status ?? "planned"}>
                  <header>
                    <div>
                      <span>世界层 {String(stage.ordinal).padStart(2, "0")}</span>
                      <h2>{stage.label}</h2>
                    </div>
                    <div class="novelx-geography-draft-state">
                      <i aria-hidden="true" />
                      {record()?.status === "completed"
                        ? "已完成"
                        : record()?.status === "reviewing"
                          ? "阶段主编审核中"
                          : record()?.status === "prepared"
                            ? "主编注册中"
                            : record()?.status === "registered"
                              ? "档案生长中"
                              : "等待前序事实"}
                    </div>
                  </header>
                  <div class="novelx-world-stage-contract">
                    <p>{stage.purpose}</p>
                    <dl>
                      <dt>计划实体</dt>
                      <dd>{stage.itemCount} 项</dd>
                      <dt>依赖层</dt>
                      <dd>{dependencies().length ? dependencies().join("、") : "无，作为世界事实地基"}</dd>
                      <dt>已注册</dt>
                      <dd>{record()?.entities.length ?? 0} 项</dd>
                      <dt>阶段主编</dt>
                      <dd>{record()?.editorSessionId ?? "尚未分配"}</dd>
                      <dt>来源原文</dt>
                      <dd>{record()?.sourceReads.length ?? 0} 份已核验</dd>
                      <dt>记忆检查点</dt>
                      <dd>
                        {props.materialization?.memoryCheckpoints.find((item) => item.stageId === stage.id)
                          ? "已压缩并可恢复"
                          : "尚未建立"}
                      </dd>
                    </dl>
                    <section>
                      <strong>推演重点</strong>
                      <ul>
                        <For each={stage.reasoningFocus}>{(focus) => <li>{focus}</li>}</For>
                      </ul>
                    </section>
                    <section>
                      <strong>档案章节</strong>
                      <p>{stage.documentSections.join(" · ")}</p>
                    </section>
                  </div>
                </article>
              )
            }
          >
            {(entity) => {
              if (props.materialization?.status === "completed") {
                const text = () => props.publicationTexts?.[entity.id]?.atlas
                return (
                  <article class="novelx-world-publication-article">
                    <Show when={text()} fallback={<p>{entity.summary}</p>}>
                      {(content) => <Markdown text={content()} />}
                    </Show>
                  </article>
                )
              }
              const status = () => props.status(entity.id)
              return (
                <article
                  class="novelx-geography-draft"
                  data-status={status()}
                  data-document-locked="true"
                  aria-busy={status() === "leased" || status() === "drafting" || status() === "reviewing"}
                  aria-readonly="true"
                >
                  <header>
                    <div>
                      <span>{entity.typeLabel}</span>
                      <h2>{entity.name}</h2>
                    </div>
                    <div class="novelx-geography-draft-state">
                      <i aria-hidden="true" />
                      {novelXWorldStatusLabel(status())}
                    </div>
                  </header>
                  <Show
                    when={props.selectedChildText()}
                    fallback={
                      <div class="novelx-geography-draft-waiting" role="status">
                        <strong>
                          {status() === "registered" ? "等待主编分配" : "正在等待世界档案 Agent 返回内容"}
                        </strong>
                        <p>{entity.summary}</p>
                        <span>正式文件尚未提交，当前内容不可编辑。</span>
                      </div>
                    }
                  >
                    <div class="novelx-geography-stream">
                      <div class="novelx-geography-stream-heading">
                        <span>novelx-world-writer</span>
                        <small>流式草稿 · 只读</small>
                      </div>
                      <pre>{props.selectedChildText()}</pre>
                    </div>
                  </Show>
                </article>
              )
            }}
          </Show>
        )
      }}
    </Show>
  )
}

export function NovelXWorldGrowthInspector(props: WorldProps) {
  const allEntities = () => props.materialization?.stages.flatMap((stage) => stage.entities) ?? []
  if (props.materialization?.status === "completed") {
    return (
      <Show when={props.selectedStage} keyed>
        {(stage) => (
          <div class="novelx-terrain-inspector-body is-publication">
            <Show
              when={props.selectedEntity}
              keyed
              fallback={
                <>
                  <p>{stage.purpose}</p>
                  <section>
                    <strong>本卷收录</strong>
                    <ul>
                      <For
                        each={
                          props.materialization?.stages.find((record) => record.stageId === stage.id)?.entities ?? []
                        }
                      >
                        {(entity) => <li>{entity.name}</li>}
                      </For>
                    </ul>
                  </section>
                </>
              }
            >
              {(entity) => (
                <>
                  <p>{entity.summary}</p>
                  <Show when={entity.upstreamBindings.length}>
                    <section>
                      <strong>相关内容</strong>
                      <ul>
                        <For each={entity.upstreamBindings}>
                          {(binding) => (
                            <li>{allEntities().find((candidate) => candidate.id === binding.entityId)?.name}</li>
                          )}
                        </For>
                      </ul>
                    </section>
                  </Show>
                </>
              )}
            </Show>
          </div>
        )}
      </Show>
    )
  }
  return (
    <Show when={props.selectedStage} keyed>
      {(stage) => {
        const stageRecord = () => props.materialization?.stages.find((item) => item.stageId === stage.id)
        return (
          <Show
            when={props.selectedEntity}
            keyed
            fallback={
              <div class="novelx-terrain-inspector-body">
                <p>{stage.purpose}</p>
                <section>
                  <strong>层面合同</strong>
                  <dl>
                    <dt>计划实体</dt>
                    <dd>{stage.itemCount}</dd>
                    <dt>当前状态</dt>
                    <dd>{stageRecord()?.status ?? "planned"}</dd>
                    <dt>档案章节</dt>
                    <dd>{stage.documentSections.join("、")}</dd>
                    <dt>阶段主编</dt>
                    <dd>{stageRecord()?.editorSessionId ?? "尚未分配"}</dd>
                    <dt>来源读取</dt>
                    <dd>{stageRecord()?.sourceReads.length ?? 0} 份原文</dd>
                    <dt>阶段交接</dt>
                    <dd>{stageRecord()?.handoff ? "已封存" : "尚未封存"}</dd>
                    <dt>Context Epoch</dt>
                    <dd>
                      {props.materialization?.memoryCheckpoints.find((item) => item.stageId === stage.id)
                        ?.contextEpoch ?? "尚未压缩"}
                    </dd>
                  </dl>
                </section>
              </div>
            }
          >
            {(entity) => {
              const relations = () =>
                stageRecord()?.relations.flatMap((relation) => {
                  if (relation.fromEntityId !== entity.id && relation.toEntityId !== entity.id) return []
                  const other = allEntities().find(
                    (item) =>
                      item.id === (relation.fromEntityId === entity.id ? relation.toEntityId : relation.fromEntityId),
                  )
                  return other ? [{ relation, other }] : []
                }) ?? []
              return (
                <div class="novelx-terrain-inspector-body">
                  <p>{entity.summary}</p>
                  <section>
                    <strong>注册事实</strong>
                    <dl>
                      <dt>类型</dt>
                      <dd>{entity.typeLabel}</dd>
                      <dt>世界层</dt>
                      <dd>{stage.label}</dd>
                      <dt>状态</dt>
                      <dd>{novelXWorldStatusLabel(props.status(entity.id))}</dd>
                      <dt>执行 Agent</dt>
                      <dd>{props.selectedChildSessionId ? "novelx-world-writer" : "尚未分配"}</dd>
                      <dt>文件锁</dt>
                      <dd>{props.selectedDocument?.status === "committed" ? "已释放" : "只读 / 尚未提交"}</dd>
                    </dl>
                    <ul>
                      <For each={entity.facts}>
                        {(fact) => (
                          <li>
                            <b>{fact.label}</b>
                            <span>{fact.detail}</span>
                          </li>
                        )}
                      </For>
                    </ul>
                  </section>
                  <section>
                    <strong>硬约束</strong>
                    <ul>
                      <For each={entity.constraints}>{(constraint) => <li>{constraint}</li>}</For>
                    </ul>
                  </section>
                  <Show when={entity.upstreamBindings.length}>
                    <section>
                      <strong>前序事实来源</strong>
                      <ul>
                        <For each={entity.upstreamBindings}>
                          {(binding) => (
                            <li>
                              <b>
                                {binding.relation} ·
                                {allEntities().find((item) => item.id === binding.entityId)?.name ?? binding.entityId}
                              </b>
                              <span>{binding.impact}</span>
                              <small>来源 {binding.sourceSha256.slice(0, 12)}…</small>
                            </li>
                          )}
                        </For>
                      </ul>
                    </section>
                  </Show>
                  <Show when={relations().length}>
                    <section>
                      <strong>同层关系</strong>
                      <ul>
                        <For each={relations()}>
                          {(item) => (
                            <li>
                              <b>
                                {item.relation.label} {item.other.name}
                              </b>
                              <span>{item.relation.summary}</span>
                            </li>
                          )}
                        </For>
                      </ul>
                    </section>
                  </Show>
                </div>
              )
            }}
          </Show>
        )
      }}
    </Show>
  )
}
