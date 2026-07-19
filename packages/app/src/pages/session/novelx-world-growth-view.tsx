import { Icon } from "@opencode-ai/ui/icon"
import type { NovelXWorld } from "@opencode-ai/schema"
import { NovelXResourceIcon } from "@/components/novelx-resource-icon"
import { novelXWorldStatusLabel, type NovelXWorldNavigationItem } from "@/context/novelx-world-growth"
import { For, Show } from "solid-js"

type WorldProps = {
  blueprint: NovelXWorld.BlueprintManifest
  materialization?: NovelXWorld.WorldMaterialization
  selectedStage?: NovelXWorld.BlueprintStage
  selectedEntity?: NovelXWorld.RegisteredEntity
  selectedDocument?: NovelXWorld.WorldDocumentRecord
  selectedChildText: () => string
  selectedChildSessionId?: string
  status: (entityId: string) => NovelXWorld.WorldDocumentStatus
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
            const record = stageRecord()
            if (!record || record.status === "planned") return "待规划"
            if (record.status === "prepared") return "主编注册中"
            if (record.status === "completed") return "已完成"
            if (record.status === "waiting_user") return "等待用户"
            if (record.status === "failed") return "失败"
            return `${record.entities.length} 项`
          }
          return (
            <button
              type="button"
              class="novelx-growth-tree-item"
              classList={{ "is-selected": props.selectedId === item.id, "is-world-stage": item.kind === "stage" }}
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
        <div class="novelx-terrain-atlas is-empty" aria-label={`${props.blueprint.profile.title}世界总览`}>
          <div class="novelx-terrain-empty-map-mark" aria-hidden="true">
            <NovelXResourceIcon resource="world" size={30} />
          </div>
          <strong>{props.materialization?.status === "completed" ? "世界档案已完成" : "世界正在生长"}</strong>
          <span>{props.blueprint.profile.designSummary}</span>
          <small>
            {progress().committed}/{progress().total} 份世界档案已提交 · 图片、地图与星图尚未生成
          </small>
        </div>
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
                  <Show when={entity.dependencyEntityIds.length}>
                    <section>
                      <strong>前序事实来源</strong>
                      <ul>
                        <For each={entity.dependencyEntityIds}>
                          {(id) => <li>{allEntities().find((item) => item.id === id)?.name ?? id}</li>}
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
