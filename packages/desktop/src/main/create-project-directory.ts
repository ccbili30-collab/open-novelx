import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"

export type CreateProjectDirectoryResult =
  | { status: "created"; directory: string; projectID: string }
  | { status: "conflict"; directory: string }

type RunGit = (directory: string, args: string[]) => Promise<string>

const execFileAsync = promisify(execFile)

export function createGitEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const env = { ...source }
  for (const key of Object.keys(env)) {
    if (key.toUpperCase().startsWith("GIT_")) delete env[key]
  }
  env.GIT_CONFIG_NOSYSTEM = "1"
  env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null"
  return env
}

const runGit: RunGit = async (directory, args) => {
  const env = createGitEnvironment()
  const result = await execFileAsync("git", args, {
    cwd: directory,
    env,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    timeout: 15_000,
  })
  return result.stdout
}

export async function ensureGitAvailable(directory: string, deps: { runGit: RunGit } = { runGit }) {
  await deps.runGit(directory, ["--version"])
}

function isInside(parent: string, child: string) {
  const value = relative(resolve(parent), resolve(child))
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value))
}

export async function initializeNovelXProjectRepository(
  directory: string,
  deps: {
    runGit: RunGit
    createID: () => string
    writeFile: typeof writeFile
    readFile: typeof readFile
    realpath: (path: string) => Promise<string>
  } = {
    runGit,
    createID: () => `novelx_${randomUUID().replaceAll("-", "")}`,
    writeFile,
    readFile,
    realpath,
  },
) {
  await deps.runGit(directory, ["init", "--quiet", "--template="])
  const repository = (await deps.runGit(directory, [
    "rev-parse",
    "--git-common-dir",
    "--show-toplevel",
    "--is-bare-repository",
  ]))
    .trim()
    .split(/\r?\n/)
  const [commonDirectoryValue, topLevelValue, bareValue] = repository
  if (!commonDirectoryValue) throw new Error("Git did not return a common directory")
  if (!topLevelValue) throw new Error("Git did not return a project worktree")
  if (bareValue !== "false") throw new Error("NovelX projects require a non-bare Git repository")

  const commonDirectory = resolve(directory, commonDirectoryValue)
  const [realDirectory, realCommonDirectory] = await Promise.all([
    deps.realpath(directory),
    deps.realpath(commonDirectory),
  ])
  const realTopLevel = await deps.realpath(resolve(directory, topLevelValue))
  if (resolve(realTopLevel) !== resolve(realDirectory)) {
    throw new Error("Git worktree does not match the new project directory")
  }
  if (!isInside(realDirectory, realCommonDirectory)) {
    throw new Error("Git common directory escaped the new project directory")
  }

  const projectID = deps.createID()
  const identityFile = join(realCommonDirectory, "opencode")
  await deps.writeFile(identityFile, projectID, { encoding: "utf8", flag: "wx" })
  const persisted = (await deps.readFile(identityFile, "utf8")).trim()
  if (persisted !== projectID) throw new Error("NovelX project identity verification failed")
  return { directory: realDirectory, projectID }
}

export async function rollbackCreatedProjectDirectory(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true })
  if (entries.some((entry) => entry.name !== ".git")) return false
  await rm(directory, { recursive: true, force: false })
  return true
}

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const WINDOWS_INVALID_CHARACTER = /[<>:"/\\|?*\u0000-\u001f]/

export function validateProjectDirectoryName(input: string) {
  if (typeof input !== "string") throw new Error("Project name is required")
  const name = input.trim()
  if (!name) throw new Error("Project name is required")
  if (name !== input) throw new Error("Project name cannot start or end with whitespace")
  if (name === "." || name === "..") throw new Error("Project name must be a single directory name")
  if (WINDOWS_INVALID_CHARACTER.test(name)) throw new Error("Project name contains invalid characters")
  if (name.endsWith(".")) throw new Error("Project name cannot end with a dot")
  if (WINDOWS_RESERVED_NAME.test(name)) throw new Error("Project name is reserved by Windows")
  if (name.length > 120) throw new Error("Project name is too long")
  return name
}

export async function createProjectDirectory(
  parentDirectory: string,
  inputName: string,
  deps: {
    mkdir: typeof mkdir
    ensureRepositorySupport: (directory: string) => Promise<void>
    initializeRepository: (directory: string) => Promise<{ directory: string; projectID: string }>
    rollbackDirectory: (directory: string) => Promise<boolean>
  } = {
    mkdir,
    ensureRepositorySupport: ensureGitAvailable,
    initializeRepository: initializeNovelXProjectRepository,
    rollbackDirectory: rollbackCreatedProjectDirectory,
  },
): Promise<CreateProjectDirectoryResult> {
  const name = validateProjectDirectoryName(inputName)
  const directory = join(parentDirectory, name)
  await deps.ensureRepositorySupport(parentDirectory)
  try {
    await deps.mkdir(directory, { recursive: false })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      return { status: "conflict", directory }
    }
    throw error
  }
  try {
    const initialized = await deps.initializeRepository(directory)
    return { status: "created", ...initialized }
  } catch (error) {
    const rolledBack = await deps.rollbackDirectory(directory).catch(() => false)
    if (!rolledBack) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Project initialization failed; the partial folder remains at ${directory}: ${detail}`, {
        cause: error,
      })
    }
    throw error
  }
}
