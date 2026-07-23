import { expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Duration, Effect } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import {
  NovelXDouyinError,
  NovelXParseDouyinTool,
  parseDouyinTranscript,
  parseDouyinVideo,
} from "@/tool/novelx-parse-douyin"
import { Truncate } from "@/tool/truncate"
import { it, testEffect } from "../lib/effect"

const json = (request: Parameters<typeof HttpClientResponse.fromWeb>[0], body: unknown, status = 200) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )

const safeResultClient = HttpClient.make((request) => {
  if (request.url.endsWith("/api/v1/download")) {
    return Effect.succeed(
      json(request, {
        job_id: "job-ready",
        status: "success",
        url: "https://www.douyin.com/video/741234567890",
      }),
    )
  }
  return Effect.succeed(
    json(request, {
      aweme_id: "741234567890",
      author_name: "山海观察员",
      text: "一段供模型理解的视频文字。",
    }),
  )
})
const toolIt = testEffect(LayerNode.compile(LayerNode.group([Truncate.node, Agent.node])))

it.effect("posts one Douyin link and decodes the transcript", () =>
  Effect.gen(function* () {
    const seen: Array<{ method: string; url: string; body: unknown }> = []
    const client = HttpClient.make((request) => {
      if (request.body._tag !== "Uint8Array") return Effect.die("expected JSON request body")
      seen.push({
        method: request.method,
        url: request.url,
        body: JSON.parse(new TextDecoder().decode(request.body.body)),
      })
      return Effect.succeed(
        json(request, {
          aweme_id: "741234567890",
          author_name: "山海观察员",
          text: "一段供模型理解的视频文字。",
        }),
      )
    })

    const result = yield* parseDouyinTranscript(client, "https://v.douyin.com/example/")

    expect(seen).toEqual([
      {
        method: "POST",
        url: "https://dy-parse.qianc.ltd/api/v1/transcript",
        body: { url: "https://v.douyin.com/example/" },
      },
    ])
    expect(result).toEqual({
      awemeId: "741234567890",
      authorName: "山海观察员",
      text: "一段供模型理解的视频文字。",
    })
  }),
)

it.effect("resolves a short link, waits for the download job, and returns its transcript", () =>
  Effect.gen(function* () {
    const seen: string[] = []
    let polls = 0
    const client = HttpClient.make((request) => {
      seen.push(`${request.method} ${request.url}`)
      if (request.url.endsWith("/api/v1/download")) {
        return Effect.succeed(
          json(request, {
            job_id: "job-1",
            status: "pending",
            url: "https://www.douyin.com/video/123",
          }),
        )
      }
      if (request.url.endsWith("/api/v1/jobs/job-1")) {
        polls += 1
        return Effect.succeed(
          json(request, {
            job_id: "job-1",
            status: polls === 1 ? "pending" : "success",
            error: null,
          }),
        )
      }
      if (request.url.endsWith("/api/v1/transcript")) {
        return Effect.succeed(
          json(request, {
            aweme_id: "123",
            author_name: "地图作者",
            text: "板块运动决定世界地图的底层结构。",
          }),
        )
      }
      return Effect.die(`unexpected request: ${request.url}`)
    })

    const result = yield* parseDouyinVideo(client, "https://v.douyin.com/short/", {
      resolveUrl: () => Effect.succeed("https://www.douyin.com/video/123"),
      pollInterval: Duration.zero,
      maxPolls: 3,
    })

    expect(result.text).toBe("板块运动决定世界地图的底层结构。")
    expect(seen).toEqual([
      "POST https://dy-parse.qianc.ltd/api/v1/download",
      "GET https://dy-parse.qianc.ltd/api/v1/jobs/job-1",
      "GET https://dy-parse.qianc.ltd/api/v1/jobs/job-1",
      "POST https://dy-parse.qianc.ltd/api/v1/transcript",
    ])
  }),
)

it.effect("stops when the asynchronous download job fails", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) => {
      if (request.url.endsWith("/api/v1/download")) {
        return Effect.succeed(
          json(request, { job_id: "job-failed", status: "pending", url: "https://www.douyin.com/video/404" }),
        )
      }
      if (request.url.endsWith("/api/v1/jobs/job-failed")) {
        return Effect.succeed(json(request, { job_id: "job-failed", status: "failed", error: "download rejected" }))
      }
      return Effect.die("transcript must not run after a failed job")
    })

    const error = yield* Effect.flip(
      parseDouyinVideo(client, "https://v.douyin.com/failed/", {
        resolveUrl: () => Effect.succeed("https://www.douyin.com/video/404"),
        pollInterval: Duration.zero,
        maxPolls: 2,
      }),
    )

    expect(error.code).toBe("NOVELX_DOUYIN_JOB_FAILED")
    expect(error.message).toContain("download rejected")
  }),
)

it.effect("stops after the configured number of pending job polls", () =>
  Effect.gen(function* () {
    let polls = 0
    const client = HttpClient.make((request) => {
      if (request.url.endsWith("/api/v1/download")) {
        return Effect.succeed(
          json(request, { job_id: "job-pending", status: "pending", url: "https://www.douyin.com/video/slow" }),
        )
      }
      if (request.url.endsWith("/api/v1/jobs/job-pending")) {
        polls += 1
        return Effect.succeed(json(request, { job_id: "job-pending", status: "pending", error: null }))
      }
      return Effect.die("transcript must not run while the job is pending")
    })

    const error = yield* Effect.flip(
      parseDouyinVideo(client, "https://v.douyin.com/slow-job/", {
        resolveUrl: () => Effect.succeed("https://www.douyin.com/video/slow"),
        pollInterval: Duration.zero,
        maxPolls: 2,
      }),
    )

    expect(error.code).toBe("NOVELX_DOUYIN_JOB_TIMEOUT")
    expect(polls).toBe(2)
  }),
)

it.effect("fails closed before HTTP for an invalid URL", () =>
  Effect.gen(function* () {
    const client = HttpClient.make(() => Effect.die("HTTP must not run"))

    const error = yield* Effect.flip(parseDouyinTranscript(client, "not-a-url"))

    expect(error).toBeInstanceOf(NovelXDouyinError)
    expect(error.code).toBe("NOVELX_DOUYIN_URL_INVALID")
  }),
)

it.effect("classifies transport failures", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) =>
      Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request }),
        }),
      ),
    )

    const error = yield* Effect.flip(parseDouyinTranscript(client, "https://v.douyin.com/offline/"))

    expect(error.code).toBe("NOVELX_DOUYIN_TRANSPORT_FAILED")
  }),
)

it.live("classifies request timeout", () =>
  Effect.gen(function* () {
    const client = HttpClient.make(() => Effect.never)

    const error = yield* Effect.flip(parseDouyinTranscript(client, "https://v.douyin.com/slow/", Duration.millis(1)))

    expect(error.code).toBe("NOVELX_DOUYIN_TIMEOUT")
  }),
)

it.effect("classifies non-success HTTP responses", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) => Effect.succeed(json(request, { detail: "upstream failed" }, 502)))

    const error = yield* Effect.flip(parseDouyinTranscript(client, "https://v.douyin.com/http-error/"))

    expect(error.code).toBe("NOVELX_DOUYIN_HTTP_FAILED")
    expect(error.message).toContain("502")
    expect(error.message).toContain("upstream failed")
  }),
)

it.effect("rejects malformed response JSON", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response("{broken", { status: 200, headers: { "content-type": "application/json" } }),
        ),
      ),
    )

    const error = yield* Effect.flip(parseDouyinTranscript(client, "https://v.douyin.com/broken/"))

    expect(error.code).toBe("NOVELX_DOUYIN_RESPONSE_INVALID")
  }),
)

it.effect("rejects an empty transcript", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) =>
      Effect.succeed(json(request, { aweme_id: "1", author_name: "作者", text: "   " })),
    )

    const error = yield* Effect.flip(parseDouyinTranscript(client, "https://v.douyin.com/empty/"))

    expect(error.code).toBe("NOVELX_DOUYIN_TRANSCRIPT_EMPTY")
  }),
)

toolIt.instance("returns a public-safe tool card instead of raw response JSON", () =>
  Effect.gen(function* () {
    const info = yield* NovelXParseDouyinTool
    const tool = yield* info.init()
    const result = yield* tool.execute(
      { url: "https://www.douyin.com/video/741234567890" },
      {
        sessionID: SessionID.make("ses_dy"),
        messageID: MessageID.make("msg_dy"),
        callID: "call-dy",
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      },
    )

    expect(result.title).toBe("抖音内容已解析")
    expect(result.output).toContain("作者：山海观察员")
    expect(result.output).toContain("一段供模型理解的视频文字。")
    expect(result.output).not.toContain("aweme_id")
    expect(result.output).not.toContain("author_name")
  }).pipe(Effect.provideService(HttpClient.HttpClient, safeResultClient)),
)
