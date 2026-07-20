import { Icon } from "@opencode-ai/ui/icon"
import type { NovelXWorld, NovelXWorldVisual } from "@opencode-ai/schema"
import { NovelXResourceIcon } from "@/components/novelx-resource-icon"
import {
  novelXWorldStatusLabel,
  resolveNovelXWorldMapFeature,
  type NovelXWorldMapMode,
  type NovelXWorldNavigationItem,
} from "@/context/novelx-world-growth"
import { For, Show, createMemo, createSignal } from "solid-js"

type WorldProps = {
  blueprint: NovelXWorld.BlueprintManifest
  materialization?: NovelXWorld.WorldMaterialization
  visual?: NovelXWorldVisual.Manifest
  visualAssets?: Record<string, string>
  selectedStage?: NovelXWorld.BlueprintStage
  selectedEntity?: NovelXWorld.RegisteredEntity
  selectedDocument?: NovelXWorld.WorldDocumentRecord
  selectedChildText: () => string
  selectedChildSessionId?: string
  status: (entityId: string) => NovelXWorld.WorldDocumentStatus
  onSelectEntity?: (entityId: string) => void
}

function NovelXWorldAtlas(props: WorldProps) {
  const [mode, setMode] = createSignal<NovelXWorldMapMode>("geography")
  const [selectedFeatureId, setSelectedFeatureId] = createSignal<string>()
  const [zoom, setZoom] = createSignal(1)
  const mapTask = () => props.visual?.tasks.find((task) => task.type === "map")
  const mapAsset = () => {
    const task = mapTask()
    return task ? props.visualAssets?.[task.id] : undefined
  }
  const layerFeatures = createMemo(() => {
    if (!props.visual || mode() === "art" || mode() === "semantic") return []
    return props.visual.atlas.features.filter(
      (feature) => feature.layer === (mode() === "geography" ? "geography" : "human"),
    )
  })
  const selectedFeature = createMemo(() =>
    props.visual?.atlas.features.find((feature) => feature.entityId === selectedFeatureId()),
  )
  const scenery = createMemo(() => {
    const selected = selectedFeature()
    if (!selected || !props.visual) return undefined
    return props.visual.tasks.find((task) => task.type === "scenery" && task.ownerEntityId === selected.entityId)
  })
  const selectCell = (cell: NovelXWorldVisual.AtlasCell) => {
    if (mode() === "art" || mode() === "semantic") {
      setSelectedFeatureId(undefined)
      return
    }
    setSelectedFeatureId(resolveNovelXWorldMapFeature(props.visual!, mode(), { cellId: cell.id })?.entityId)
  }
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
                  setSelectedFeatureId(undefined)
                }}
              >
                {item[1]}
              </button>
            )}
          </For>
        </nav>
      </header>
      <div
        class="novelx-world-atlas-canvas"
        onWheel={(event) => {
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
            <svg viewBox="0 0 1024 1024" role="img" aria-label="可交互世界地图" style={{ "--novelx-map-zoom": zoom() }}>
              <g transform={`translate(${512 - 512 * zoom()} ${512 - 512 * zoom()}) scale(${zoom()})`}>
                <Show when={mapAsset()} fallback={<rect width="1024" height="1024" fill="#eee8dd" />}>
                  {(src) => <image href={src()} width="1024" height="1024" preserveAspectRatio="xMidYMid slice" />}
                </Show>
                <For each={visual().atlas.cells}>
                  {(cell) => {
                    const points = () => cell.polygon.map((point) => `${point.x * 1024},${point.y * 1024}`).join(" ")
                    const selected = () => selectedFeature()?.cellIds.includes(cell.id) ?? false
                    return (
                      <polygon
                        points={points()}
                        fill={
                          mode() === "semantic"
                            ? surfaceColor[cell.surface]
                            : selected()
                              ? "rgba(239, 213, 146, .52)"
                              : "transparent"
                        }
                        stroke={
                          mode() === "semantic"
                            ? "rgba(255,255,255,.28)"
                            : selected()
                              ? "rgba(239, 213, 146, .52)"
                              : "transparent"
                        }
                        stroke-width={selected() ? 2.2 : 0.55}
                        classList={{ "is-selected": selected(), "is-debug": mode() === "semantic" }}
                        onClick={() => selectCell(cell)}
                      />
                    )
                  }}
                </For>
                <For each={layerFeatures()}>
                  {(feature) => (
                    <g
                      class="novelx-world-map-label"
                      transform={`translate(${feature.labelPoint.x * 1024} ${feature.labelPoint.y * 1024})`}
                      onClick={() =>
                        setSelectedFeatureId(
                          resolveNovelXWorldMapFeature(visual(), mode(), { explicitEntityId: feature.entityId })
                            ?.entityId,
                        )
                      }
                    >
                      <circle r="4" />
                      <text y="-10" text-anchor="middle">
                        {feature.label}
                      </text>
                    </g>
                  )}
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
        <Show when={selectedFeature()} keyed>
          {(feature) => {
            const imageTask = scenery()
            const image = () => (imageTask ? props.visualAssets?.[imageTask.id] : undefined)
            return (
              <aside
                class="novelx-world-map-popover"
                style={{
                  left: `${Math.min(76, Math.max(6, feature.labelPoint.x * 100))}%`,
                  top: `${Math.min(72, Math.max(8, feature.labelPoint.y * 100))}%`,
                }}
              >
                <button
                  type="button"
                  class="novelx-world-map-popover-close"
                  aria-label="关闭"
                  onClick={() => setSelectedFeatureId(undefined)}
                >
                  <Icon name="close-small" size="small" />
                </button>
                <Show when={image()}>{(src) => <img src={src()} alt={imageTask?.title ?? feature.label} />}</Show>
                <small>
                  {feature.kind === "polity"
                    ? "国家疆域"
                    : feature.kind === "organization"
                      ? "组织影响"
                      : feature.kind === "river"
                        ? "水系"
                        : "自然地理"}
                </small>
                <strong>{feature.label}</strong>
                <p>{feature.summary}</p>
                <span>
                  {imageTask
                    ? imageTask.status === "attached"
                      ? "风貌候选已生成"
                      : imageTask.status === "failed"
                        ? "风貌生成失败"
                        : "风貌图生成中"
                    : feature.importance === "ordinary"
                      ? "普通对象 · 未进入生图队列"
                      : "暂无风貌任务"}
                </span>
                <button type="button" onClick={() => props.onSelectEntity?.(feature.entityId)}>
                  打开完整档案
                </button>
              </aside>
            )
          }}
        </Show>
        <div class="novelx-world-map-zoom" aria-label="地图缩放">
          <button type="button" onClick={() => setZoom((value) => Math.min(2.4, value + 0.2))}>
            ＋
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            适应
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.72, value - 0.2))}>
            −
          </button>
        </div>
      </div>
      <footer>
        <span>
          {props.visual
            ? `${props.visual.atlas.cells.length} 个权威地块 · ${props.visual.atlas.features.length} 个空间投影`
            : "等待视觉注册"}
        </span>
        <span>
          {props.visual
            ? `${props.visual.tasks.filter((task) => task.status === "attached").length}/${props.visual.tasks.length} 张候选图已挂载`
            : "图片队列未开始"}
        </span>
      </footer>
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
    <section class="novelx-growth-tree" aria-label="题材自适应世界蓝图">
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
          {committed()}/{total()} 已提交
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
              <small>{item.kind === "entity" ? novelXWorldStatusLabel(documentStatus()) : stageLabel()}</small>
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
            }
          >
            {(entity) => {
              const status = () => props.status(entity.id)
              return (
                <article class="novelx-geography-draft" data-status={status()}>
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
