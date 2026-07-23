import { Duration, Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Tool } from "./tool"

export const DOUYIN_TRANSCRIPT_ENDPOINT = "https://dy-parse.qianc.ltd/api/v1/transcript"
export const DOUYIN_DOWNLOAD_ENDPOINT = "https://dy-parse.qianc.ltd/api/v1/download"
export const DOUYIN_JOB_ENDPOINT = "https://dy-parse.qianc.ltd/api/v1/jobs"
const DEFAULT_TIMEOUT = Duration.seconds(30)
const DEFAULT_POLL_INTERVAL = Duration.seconds(2)
const DEFAULT_MAX_POLLS = 90
const TOOL_ID = "novelx_parse_douyin"

const Response = Schema.Struct({
  aweme_id: Schema.String,
  author_name: Schema.String,
  text: Schema.String,
})
const ErrorResponse = Schema.Struct({ detail: Schema.String })
const JobStartResponse = Schema.Struct({
  job_id: Schema.String,
  status: Schema.String,
  url: Schema.String,
})
const JobStatusResponse = Schema.Struct({
  job_id: Schema.String,
  status: Schema.String,
  error: Schema.optional(Schema.NullOr(Schema.String)),
})

export class NovelXDouyinError extends Schema.TaggedErrorClass<NovelXDouyinError>()("NovelXDouyinError", {
  code: Schema.Literals([
    "NOVELX_DOUYIN_URL_INVALID",
    "NOVELX_DOUYIN_TRANSPORT_FAILED",
    "NOVELX_DOUYIN_TIMEOUT",
    "NOVELX_DOUYIN_HTTP_FAILED",
    "NOVELX_DOUYIN_RESPONSE_INVALID",
    "NOVELX_DOUYIN_TRANSCRIPT_EMPTY",
    "NOVELX_DOUYIN_RESOLVE_FAILED",
    "NOVELX_DOUYIN_JOB_FAILED",
    "NOVELX_DOUYIN_JOB_TIMEOUT",
  ]),
  message: Schema.String,
}) {}

export type Transcript = {
  awemeId: string
  authorName: string
  text: string
}

type ParseVideoOptions = {
  resolveUrl?: (url: string) => Effect.Effect<string, NovelXDouyinError>
  pollInterval?: Duration.Input
  maxPolls?: number
  signal?: AbortSignal
}

export function parseDouyinVideo(
  http: HttpClient.HttpClient,
  value: string,
  options: ParseVideoOptions = {},
): Effect.Effect<Transcript, NovelXDouyinError> {
  return Effect.gen(function* () {
    const inputUrl = yield* requireHttpUrl(value)
    const resolvedUrl = yield* (options.resolveUrl ?? ((url) => resolveDouyinUrl(url, options.signal)))(inputUrl)
    const url = yield* requireHttpUrl(resolvedUrl)
    const request = yield* HttpClientRequest.post(DOUYIN_DOWNLOAD_ENDPOINT).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.bodyJson({ url }),
      Effect.mapError(
        () =>
          new NovelXDouyinError({
            code: "NOVELX_DOUYIN_URL_INVALID",
            message: "无法构造抖音异步解析请求。",
          }),
      ),
    )
    const response = yield* executeRequest(http, request, DEFAULT_TIMEOUT)
    yield* requireSuccess(response, "创建抖音解析任务")
    const job = yield* HttpClientResponse.schemaBodyJson(JobStartResponse)(response).pipe(
      Effect.mapError(
        () =>
          new NovelXDouyinError({
            code: "NOVELX_DOUYIN_RESPONSE_INVALID",
            message: "抖音解析服务返回了无法识别的任务数据。",
          }),
      ),
    )
    if (job.status !== "success") {
      yield* awaitDouyinJob(http, job.job_id, {
        attempt: 0,
        maxPolls: options.maxPolls ?? DEFAULT_MAX_POLLS,
        pollInterval: options.pollInterval ?? DEFAULT_POLL_INTERVAL,
      })
    }
    return yield* parseDouyinTranscript(http, url, DEFAULT_TIMEOUT)
  })
}

export function parseDouyinTranscript(
  http: HttpClient.HttpClient,
  value: string,
  timeout: Duration.Input = DEFAULT_TIMEOUT,
): Effect.Effect<Transcript, NovelXDouyinError> {
  return Effect.gen(function* () {
    const url = yield* requireHttpUrl(value)
    const request = yield* HttpClientRequest.post(DOUYIN_TRANSCRIPT_ENDPOINT).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.bodyJson({ url }),
      Effect.mapError(
        () =>
          new NovelXDouyinError({
            code: "NOVELX_DOUYIN_URL_INVALID",
            message: "无法构造抖音解析请求。",
          }),
      ),
    )
    const response = yield* http.execute(request).pipe(
      Effect.mapError(
        (cause) =>
          new NovelXDouyinError({
            code: "NOVELX_DOUYIN_TRANSPORT_FAILED",
            message: cause instanceof Error ? cause.message : "抖音解析服务连接失败。",
          }),
      ),
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () =>
          new NovelXDouyinError({
            code: "NOVELX_DOUYIN_TIMEOUT",
            message: "抖音解析服务请求超时。",
          }),
      }),
    )
    if (response.status < 200 || response.status >= 300) {
      const detail = yield* HttpClientResponse.schemaBodyJson(ErrorResponse)(response).pipe(
        Effect.map((body) => body.detail.trim()),
        Effect.catch(() => Effect.succeed("")),
      )
      return yield* new NovelXDouyinError({
        code: "NOVELX_DOUYIN_HTTP_FAILED",
        message: `抖音解析服务返回 HTTP ${response.status}${detail ? `：${detail}` : ""}。`,
      })
    }
    const parsed = yield* HttpClientResponse.schemaBodyJson(Response)(response).pipe(
      Effect.mapError(
        () =>
          new NovelXDouyinError({
            code: "NOVELX_DOUYIN_RESPONSE_INVALID",
            message: "抖音解析服务返回了无法识别的数据。",
          }),
      ),
    )
    const text = parsed.text.trim()
    if (!text) {
      return yield* new NovelXDouyinError({
        code: "NOVELX_DOUYIN_TRANSCRIPT_EMPTY",
        message: "抖音解析服务没有返回可供模型理解的正文。",
      })
    }
    return {
      awemeId: parsed.aweme_id.trim(),
      authorName: parsed.author_name.trim(),
      text,
    }
  })
}

function awaitDouyinJob(
  http: HttpClient.HttpClient,
  jobId: string,
  options: { attempt: number; maxPolls: number; pollInterval: Duration.Input },
): Effect.Effect<void, NovelXDouyinError> {
  return Effect.gen(function* () {
    if (options.attempt >= options.maxPolls) {
      return yield* new NovelXDouyinError({
        code: "NOVELX_DOUYIN_JOB_TIMEOUT",
        message: "等待抖音解析任务完成超时。",
      })
    }
    const request = HttpClientRequest.get(`${DOUYIN_JOB_ENDPOINT}/${encodeURIComponent(jobId)}`).pipe(
      HttpClientRequest.acceptJson,
    )
    const response = yield* executeRequest(http, request, DEFAULT_TIMEOUT)
    yield* requireSuccess(response, "读取抖音解析任务")
    const job = yield* HttpClientResponse.schemaBodyJson(JobStatusResponse)(response).pipe(
      Effect.mapError(
        () =>
          new NovelXDouyinError({
            code: "NOVELX_DOUYIN_RESPONSE_INVALID",
            message: "抖音解析服务返回了无法识别的任务状态。",
          }),
      ),
    )
    if (job.status === "success") return
    if (["failed", "error", "cancelled"].includes(job.status)) {
      return yield* new NovelXDouyinError({
        code: "NOVELX_DOUYIN_JOB_FAILED",
        message: `抖音解析任务失败${job.error ? `：${job.error}` : ""}。`,
      })
    }
    yield* Effect.sleep(options.pollInterval)
    return yield* awaitDouyinJob(http, jobId, { ...options, attempt: options.attempt + 1 })
  })
}

function executeRequest(
  http: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  timeout: Duration.Input,
) {
  return http.execute(request).pipe(
    Effect.mapError(
      (cause) =>
        new NovelXDouyinError({
          code: "NOVELX_DOUYIN_TRANSPORT_FAILED",
          message: cause instanceof Error ? cause.message : "抖音解析服务连接失败。",
        }),
    ),
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () =>
        new NovelXDouyinError({
          code: "NOVELX_DOUYIN_TIMEOUT",
          message: "抖音解析服务请求超时。",
        }),
    }),
  )
}

function requireSuccess(response: HttpClientResponse.HttpClientResponse, operation: string) {
  if (response.status >= 200 && response.status < 300) return Effect.void
  return HttpClientResponse.schemaBodyJson(ErrorResponse)(response).pipe(
    Effect.map((body) => body.detail.trim()),
    Effect.catch(() => Effect.succeed("")),
    Effect.flatMap(
      (detail) =>
        new NovelXDouyinError({
          code: "NOVELX_DOUYIN_HTTP_FAILED",
          message: `${operation}返回 HTTP ${response.status}${detail ? `：${detail}` : ""}。`,
        }),
    ),
  )
}

function resolveDouyinUrl(value: string, signal?: AbortSignal) {
  return Effect.tryPromise({
    try: async () => {
      const parsed = new URL(value)
      if (!isDouyinHost(parsed.hostname)) throw new Error("链接不是抖音地址。")
      if (parsed.hostname !== "v.douyin.com") return value
      const response = await fetch(value, {
        method: "GET",
        redirect: "follow",
        signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36",
        },
      })
      const resolved = new URL(response.url)
      await response.body?.cancel()
      if (!response.ok || !isDouyinHost(resolved.hostname)) throw new Error("抖音短链没有跳转到有效作品。")
      return resolved.toString()
    },
    catch: (cause) =>
      new NovelXDouyinError({
        code: "NOVELX_DOUYIN_RESOLVE_FAILED",
        message: cause instanceof Error ? cause.message : "无法解析抖音短链。",
      }),
  })
}

function isDouyinHost(value: string) {
  const hostname = value.toLowerCase()
  return hostname === "douyin.com" || hostname.endsWith(".douyin.com")
}

export const Parameters = Schema.Struct({
  url: Schema.String.annotate({ description: "The single HTTP or HTTPS Douyin URL supplied to /dy." }),
})

type Metadata = { awemeId: string; authorName: string; textLength: number }

export const NovelXParseDouyinTool = Tool.define<typeof Parameters, Metadata, HttpClient.HttpClient>(
  TOOL_ID,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    return {
      description: "Parse one Douyin link through NovelX's fixed transcript service for model-readable context.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: TOOL_ID,
            patterns: [params.url],
            always: [],
            metadata: { url: params.url },
          })
          const transcript = yield* parseDouyinVideo(http, params.url, { signal: ctx.abort })
          return {
            title: "抖音内容已解析",
            metadata: {
              awemeId: transcript.awemeId,
              authorName: transcript.authorName,
              textLength: transcript.text.length,
            },
            output: [`作者：${transcript.authorName || "未知"}`, "", "解析正文：", transcript.text].join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)

function requireHttpUrl(value: string) {
  const url = value.trim()
  if (!url || url.length > 4096) {
    return Effect.fail(
      new NovelXDouyinError({
        code: "NOVELX_DOUYIN_URL_INVALID",
        message: "请提供一个有效的抖音链接。",
      }),
    )
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol")
  } catch {
    return Effect.fail(
      new NovelXDouyinError({
        code: "NOVELX_DOUYIN_URL_INVALID",
        message: "抖音链接必须是 HTTP 或 HTTPS URL。",
      }),
    )
  }
  return Effect.succeed(url)
}
