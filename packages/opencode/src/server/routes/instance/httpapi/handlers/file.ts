import * as InstanceState from "@/effect/instance-state"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { FileMutation } from "@opencode-ai/core/file-mutation"
import { LocationServiceMap, locationServiceMapLayer } from "@opencode-ai/core/location-services"
import { LocationMutation } from "@opencode-ai/core/location-mutation"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath, RelativePath } from "@opencode-ai/core/schema"
import { Effect, Layer, Option } from "effect"
import ignore from "ignore"
import path from "path"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  FileEditConflictError,
  FileEditInvalidError,
  FileEditNotFoundError,
  FileEditableWrite,
} from "../groups/file"

const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf])

function hasUtf8Bom(content: Uint8Array) {
  return content[0] === utf8Bom[0] && content[1] === utf8Bom[1] && content[2] === utf8Bom[2]
}

function editableBytes(content: string, bom: boolean) {
  const text = content.replace(/^\uFEFF+/, "")
  return new TextEncoder().encode(bom ? `\uFEFF${text}` : text)
}

function mapAccessError(requested: string, error: unknown): FileEditInvalidError | FileEditNotFoundError {
  if (error instanceof FileEditInvalidError || error instanceof FileEditNotFoundError) {
    return error
  }
  const tagged = error as { _tag?: string; reason?: string }
  if (tagged?._tag === "LocationMutation.PathError") {
    return new FileEditInvalidError({ path: requested, reason: "invalid_path", message: "Path escapes the project." })
  }
  if (tagged?._tag === "PlatformError" && tagged.reason === "NotFound") {
    return new FileEditNotFoundError({ path: requested, message: "File does not exist." })
  }
  return new FileEditInvalidError({ path: requested, reason: "io", message: "Unable to access the file." })
}

function mapWriteError(
  requested: string,
  error: unknown,
): FileEditInvalidError | FileEditNotFoundError | FileEditConflictError {
  if (error instanceof FileEditConflictError) return error
  if (error instanceof FileMutation.StaleContentError) {
    return new FileEditConflictError({
      path: requested,
      message: "The file changed after it was opened. Reload before saving again.",
    })
  }
  return mapAccessError(requested, error)
}

export const fileHandlers = HttpApiBuilder.group(InstanceHttpApi, "file", (handlers) =>
  Effect.gen(function* () {
    const ripgrep = yield* Ripgrep.Service
    const locations = yield* LocationServiceMap.Service

    const filesystem = Effect.fnUntraced(function* <A, E, R>(effect: Effect.Effect<A, E, R>) {
      return yield* effect.pipe(
        Effect.provide(
          locations.get(Location.Ref.make({ directory: AbsolutePath.make((yield* InstanceState.context).directory) })),
        ),
      )
    })

    const findText = Effect.fn("FileHttpApi.findText")(function* (ctx: { query: { pattern: string } }) {
      return (yield* ripgrep
        .grep({ cwd: (yield* InstanceState.context).directory, pattern: ctx.query.pattern, limit: 10 })
        .pipe(Effect.orDie)).map((match) => ({
        path: { text: match.entry.path },
        lines: { text: match.text },
        line_number: match.line,
        absolute_offset: match.offset,
        submatches: match.submatches.map((submatch) => ({
          match: { text: submatch.text },
          start: submatch.start,
          end: submatch.end,
        })),
      }))
    })

    const findFile = Effect.fn("FileHttpApi.findFile")(function* (ctx: {
      query: { query: string; dirs?: "true" | "false"; type?: "file" | "directory"; limit?: number }
    }) {
      const directory = (yield* InstanceState.context).directory
      const limit = ctx.query.limit ?? 10
      const type = ctx.query.type ?? (ctx.query.dirs === "false" ? "file" : undefined)
      const started = performance.now()
      const found = yield* filesystem(FileSystem.Service.use((fs) => fs.find({ query: ctx.query.query, limit, type })))
      yield* Effect.logInfo("find file", {
        query: ctx.query.query,
        type,
        directory,
        limit,
        results: found.length,
        duration: Math.round(performance.now() - started),
      })
      return found.map((item) => item.path)
    })

    const findSymbol = Effect.fn("FileHttpApi.findSymbol")(function* () {
      return []
    })

    const list = Effect.fn("FileHttpApi.list")(function* (ctx: { query: { path: string } }) {
      const directory = (yield* InstanceState.context).directory
      return yield* filesystem(
        Effect.gen(function* () {
          const fs = yield* FileSystem.Service
          const raw = yield* FSUtil.Service
          const location = yield* Location.Service
          const ignored = ignore()
          const gitignore = yield* raw
            .readFileString(path.join(location.project.directory, ".gitignore"))
            .pipe(Effect.catch(() => Effect.succeed("")))
          if (gitignore) ignored.add(gitignore)
          const ignorefile = yield* raw
            .readFileString(path.join(location.project.directory, ".ignore"))
            .pipe(Effect.catch(() => Effect.succeed("")))
          if (ignorefile) ignored.add(ignorefile)
          return (yield* fs.list({ path: RelativePath.make(ctx.query.path) })).map((item) => ({
            name: path.basename(item.path),
            path: item.path,
            absolute: path.resolve(location.directory, item.path),
            type: item.type,
            ignored: ignored.ignores(
              path.relative(location.project.directory, path.resolve(location.directory, item.path)) +
                (item.type === "directory" ? "/" : ""),
            ),
          }))
        }),
      )
    })

    const content = Effect.fn("FileHttpApi.content")(function* (ctx: { query: { path: string } }) {
      const directory = (yield* InstanceState.context).directory
      const file = path.resolve(directory, ctx.query.path)
      if (!FSUtil.contains(directory, file)) return yield* Effect.die(new Error("Path escapes the location"))
      if (!(yield* FSUtil.Service.use((fs) => fs.existsSafe(file)))) return { type: "text" as const, content: "" }
      return yield* filesystem(
        FileSystem.Service.use((fs) => fs.read({ path: RelativePath.make(ctx.query.path) })),
      ).pipe(
        Effect.flatMap((item) =>
          Effect.gen(function* () {
            const text = item.content.includes(0)
              ? Option.none<string>()
              : yield* Effect.sync(() => new TextDecoder("utf-8", { fatal: true }).decode(item.content)).pipe(
                  Effect.option,
                )
            return { item, text }
          }),
        ),
        Effect.map(({ item, text }) =>
          Option.isSome(text)
            ? { type: "text" as const, content: text.value.trim() }
            : {
                type: "binary" as const,
                content: Buffer.from(item.content).toString("base64"),
                encoding: "base64" as const,
                mimeType: item.mime,
              },
        ),
      )
    })

    const editableTarget = Effect.fnUntraced(function* (requested: string) {
      const mutation = yield* LocationMutation.Service
      const raw = yield* FSUtil.Service
      const target = yield* mutation.resolve({ path: requested, kind: "file" })
      if (target.externalDirectory) {
        return yield* new FileEditInvalidError({
          path: requested,
          reason: "invalid_path",
          message: "Editable files must stay inside the current project.",
        })
      }
      if (!(yield* raw.existsSafe(target.canonical))) {
        return yield* new FileEditNotFoundError({ path: requested, message: "File does not exist." })
      }
      if (!(yield* raw.isFile(target.canonical))) {
        return yield* new FileEditInvalidError({
          path: requested,
          reason: "not_file",
          message: "Editable target is not a file.",
        })
      }
      return target
    })

    const decodeEditable = Effect.fnUntraced(function* (requested: string, bytes: Uint8Array) {
      const bom = hasUtf8Bom(bytes)
      const body = bom ? bytes.slice(utf8Bom.length) : bytes
      if (body.includes(0)) {
        return yield* new FileEditInvalidError({
          path: requested,
          reason: "binary",
          message: "Binary files cannot be edited as text.",
        })
      }
      const content = yield* Effect.try({
        try: () => new TextDecoder("utf-8", { fatal: true }).decode(body),
        catch: () =>
          new FileEditInvalidError({
            path: requested,
            reason: "invalid_utf8",
            message: "File is not valid UTF-8 text.",
          }),
      })
      return { type: "text" as const, content, bom }
    })

    const editable = Effect.fn("FileHttpApi.editable")(function* (ctx: { query: { path: string } }) {
      const requested = ctx.query.path
      return yield* filesystem(
        Effect.gen(function* () {
          const target = yield* editableTarget(requested)
          const raw = yield* FSUtil.Service
          return yield* decodeEditable(requested, yield* raw.readFile(target.canonical))
        }),
      ).pipe(Effect.mapError((error) => mapAccessError(requested, error)))
    })

    const write = Effect.fn("FileHttpApi.write")(function* (ctx: {
      query: { path: string }
      payload: typeof FileEditableWrite.Type
    }) {
      const requested = ctx.query.path
      return yield* filesystem(
        Effect.gen(function* () {
          const target = yield* editableTarget(requested)
          const files = yield* FileMutation.Service
          const bom = ctx.payload.expectedBom
          yield* files.writeIfUnchanged({
            target,
            expected: editableBytes(ctx.payload.expectedContent, bom),
            content: editableBytes(ctx.payload.content, bom),
          })
          return { type: "text" as const, content: ctx.payload.content.replace(/^\uFEFF+/, ""), bom }
        }),
      ).pipe(Effect.mapError((error) => mapWriteError(requested, error)))
    })

    const status = Effect.fn("FileHttpApi.status")(function* () {
      return []
    })

    return handlers
      .handle("findText", findText)
      .handle("findFile", findFile)
      .handle("findSymbol", findSymbol)
      .handle("list", list)
      .handle("content", content)
      .handle("editable", editable)
      .handle("write", write)
      .handle("status", status)
  }),
).pipe(Layer.provide(locationServiceMapLayer))
