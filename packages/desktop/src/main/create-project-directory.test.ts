import { describe, expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createGitEnvironment,
  createProjectDirectory,
  initializeNovelXProjectRepository,
  rollbackCreatedProjectDirectory,
  validateProjectDirectoryName,
} from "./create-project-directory"

describe("createGitEnvironment", () => {
  test("drops inherited Git controls and installs a sealed config boundary", () => {
    const env = createGitEnvironment({
      PATH: "C:\\Git\\cmd",
      GIT_DIR: "C:\\attacker",
      git_config_count: "1",
      GIT_CONFIG_KEY_0: "core.bare",
      GIT_CONFIG_VALUE_0: "true",
      GIT_TEMPLATE_DIR: "C:\\template",
    })
    expect(env.PATH).toBe("C:\\Git\\cmd")
    expect(env.GIT_DIR).toBeUndefined()
    expect(env.git_config_count).toBeUndefined()
    expect(env.GIT_CONFIG_KEY_0).toBeUndefined()
    expect(env.GIT_CONFIG_VALUE_0).toBeUndefined()
    expect(env.GIT_TEMPLATE_DIR).toBeUndefined()
    expect(env.GIT_CONFIG_NOSYSTEM).toBe("1")
    expect(env.GIT_CONFIG_GLOBAL).toBe(process.platform === "win32" ? "NUL" : "/dev/null")
  })
})

describe("validateProjectDirectoryName", () => {
  test("accepts an ordinary Chinese project name", () => {
    expect(validateProjectDirectoryName("北境纪行")).toBe("北境纪行")
  })

  test.each(["", " ", ".", "..", "a/b", "a\\b", "a:b", "name.", " name", "name "])(
    "rejects invalid directory name %p",
    (name) => {
      expect(() => validateProjectDirectoryName(name)).toThrow()
    },
  )

  test.each(["CON", "nul.txt", "COM1", "lpt9.world"])("rejects Windows reserved name %p", (name) => {
    expect(() => validateProjectDirectoryName(name)).toThrow("reserved")
  })
})

describe("createProjectDirectory", () => {
  test(
    "creates a real git repository with a durable non-global project identity",
    async () => {
      const parent = await mkdtemp(join(tmpdir(), "novelx-create-project-"))
      try {
        const result = await createProjectDirectory(parent, "真实项目")
        expect(result.status).toBe("created")
        if (result.status !== "created") throw new Error("project was not created")
        expect(result.projectID).toStartWith("novelx_")
        expect(result.projectID).not.toBe("global")
        expect((await readFile(join(result.directory, ".git", "opencode"), "utf8")).trim()).toBe(result.projectID)
      } finally {
        await rm(parent, { recursive: true, force: true })
      }
    },
    30_000,
  )

  test("does not create a folder when Git is unavailable", async () => {
    const calls: string[] = []
    await expect(
      createProjectDirectory("C:\\NovelX", "无 Git", {
        ensureRepositorySupport: async () => {
          calls.push("ensure")
          throw new Error("Git is not installed")
        },
        mkdir: async () => {
          calls.push("mkdir")
          return undefined
        },
        initializeRepository: async (directory) => ({ directory, projectID: "unused" }),
        rollbackDirectory: async () => true,
      }),
    ).rejects.toThrow("Git is not installed")
    expect(calls).toEqual(["ensure"])
  })

  test("creates exactly one child directory and initializes its repository identity", async () => {
    const calls: Array<string | { path: string; recursive?: boolean }> = []
    const result = await createProjectDirectory("C:\\NovelX", "群山世界", {
      ensureRepositorySupport: async (directory) => void calls.push(`ensure:${directory}`),
      mkdir: async (path, options) => {
        calls.push({ path: String(path), recursive: options?.recursive })
        return undefined
      },
      initializeRepository: async (directory) => {
        calls.push(`initialize:${directory}`)
        return { directory, projectID: "novelx_test" }
      },
      rollbackDirectory: async () => true,
    })

    expect(result).toEqual({
      status: "created",
      directory: join("C:\\NovelX", "群山世界"),
      projectID: "novelx_test",
    })
    expect(calls).toEqual([
      "ensure:C:\\NovelX",
      { path: join("C:\\NovelX", "群山世界"), recursive: false },
      `initialize:${join("C:\\NovelX", "群山世界")}`,
    ])
  })

  test("reports an existing child as a conflict", async () => {
    const result = await createProjectDirectory("C:\\NovelX", "已有世界", {
      ensureRepositorySupport: async () => undefined,
      mkdir: async () => {
        throw Object.assign(new Error("exists"), { code: "EEXIST" })
      },
      initializeRepository: async (directory) => ({ directory, projectID: "unused" }),
      rollbackDirectory: async () => true,
    })

    expect(result).toEqual({ status: "conflict", directory: join("C:\\NovelX", "已有世界") })
  })

  test("propagates filesystem failures", async () => {
    await expect(
      createProjectDirectory("C:\\NovelX", "不可写", {
        ensureRepositorySupport: async () => undefined,
        mkdir: async () => {
          throw Object.assign(new Error("permission denied"), { code: "EACCES" })
        },
        initializeRepository: async (directory) => ({ directory, projectID: "unused" }),
        rollbackDirectory: async () => true,
      }),
    ).rejects.toThrow("permission denied")
  })

  test("fails closed when repository initialization fails", async () => {
    const rolledBack: string[] = []
    await expect(
      createProjectDirectory("C:\\NovelX", "无法初始化", {
        ensureRepositorySupport: async () => undefined,
        mkdir: async () => undefined,
        initializeRepository: async () => {
          throw new Error("git unavailable")
        },
        rollbackDirectory: async (directory) => {
          rolledBack.push(directory)
          return true
        },
      }),
    ).rejects.toThrow("git unavailable")
    expect(rolledBack).toEqual([join("C:\\NovelX", "无法初始化")])
  })

  test("does not misreport a repository identity collision as a folder conflict", async () => {
    await expect(
      createProjectDirectory("C:\\NovelX", "身份冲突", {
        ensureRepositorySupport: async () => undefined,
        mkdir: async () => undefined,
        initializeRepository: async () => {
          throw Object.assign(new Error("identity exists"), { code: "EEXIST" })
        },
        rollbackDirectory: async () => true,
      }),
    ).rejects.toThrow("identity exists")
  })

  test("reports the recoverable path when a partial folder cannot be rolled back", async () => {
    await expect(
      createProjectDirectory("C:\\NovelX", "保留现场", {
        ensureRepositorySupport: async () => undefined,
        mkdir: async () => undefined,
        initializeRepository: async () => {
          throw new Error("identity write failed")
        },
        rollbackDirectory: async () => false,
      }),
    ).rejects.toThrow(`partial folder remains at ${join("C:\\NovelX", "保留现场")}`)
  })
})

describe("rollbackCreatedProjectDirectory", () => {
  test("removes a partial directory that contains only the Git repository created by this flow", async () => {
    const parent = await mkdtemp(join(tmpdir(), "novelx-project-rollback-"))
    const directory = join(parent, "partial")
    try {
      await mkdir(join(directory, ".git"), { recursive: true })
      expect(await rollbackCreatedProjectDirectory(directory)).toBe(true)
      await expect(access(directory)).rejects.toThrow()
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  test("preserves a partial directory when another top-level file appeared", async () => {
    const parent = await mkdtemp(join(tmpdir(), "novelx-project-rollback-"))
    const directory = join(parent, "partial")
    try {
      await mkdir(join(directory, ".git"), { recursive: true })
      await writeFile(join(directory, "user-note.txt"), "preserve")
      expect(await rollbackCreatedProjectDirectory(directory)).toBe(false)
      expect(await readFile(join(directory, "user-note.txt"), "utf8")).toBe("preserve")
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})

describe("initializeNovelXProjectRepository", () => {
  test("initializes git and writes one verified repository-local identity", async () => {
    const calls: string[] = []
    let stored = ""
    const directory = join("C:\\NovelX", "新世界")
    const projectID = await initializeNovelXProjectRepository(directory, {
      runGit: async (_directory, args) => {
        calls.push(args.join(" "))
        return args[0] === "rev-parse" ? `.git\n${directory}\nfalse\n` : ""
      },
      createID: () => "novelx_unique",
      writeFile: async (path, value, options) => {
        calls.push(`write:${String(path)}:${String(options)}`)
        stored = String(value)
      },
      readFile: async () => stored,
      realpath: async (path) => String(path),
    })

    expect(projectID).toEqual({ directory, projectID: "novelx_unique" })
    expect(calls[0]).toBe("init --quiet --template=")
    expect(calls[1]).toBe("rev-parse --git-common-dir --show-toplevel --is-bare-repository")
    expect(calls[2]).toContain(join(directory, ".git", "opencode"))
  })

  test("rejects a git common directory outside the new project", async () => {
    const directory = join("C:\\NovelX", "新世界")
    await expect(
      initializeNovelXProjectRepository(directory, {
        runGit: async (_directory, args) => (args[0] === "rev-parse" ? `.git\n${directory}\nfalse` : ""),
        createID: () => "novelx_unique",
        writeFile: async () => undefined,
        readFile: async () => "novelx_unique",
        realpath: async (path) => (path === directory ? path : "C:\\shared-git"),
      }),
    ).rejects.toThrow("escaped")
  })

  test("rejects a bare repository", async () => {
    const directory = join("C:\\NovelX", "新世界")
    await expect(
      initializeNovelXProjectRepository(directory, {
        runGit: async (_directory, args) => (args[0] === "rev-parse" ? `.git\n${directory}\ntrue` : ""),
        createID: () => "novelx_unique",
        writeFile: async () => undefined,
        readFile: async () => "novelx_unique",
        realpath: async (path) => path,
      }),
    ).rejects.toThrow("non-bare")
  })

  test("rejects a worktree that does not match the new directory", async () => {
    const directory = join("C:\\NovelX", "新世界")
    await expect(
      initializeNovelXProjectRepository(directory, {
        runGit: async (_directory, args) =>
          args[0] === "rev-parse" ? `.git\n${join("C:\\NovelX", "另一个项目")}\nfalse` : "",
        createID: () => "novelx_unique",
        writeFile: async () => undefined,
        readFile: async () => "novelx_unique",
        realpath: async (path) => path,
      }),
    ).rejects.toThrow("does not match")
  })
})
