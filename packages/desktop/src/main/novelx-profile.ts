import { join } from "node:path"

export type NovelXProfilePaths = ReturnType<typeof resolveNovelXProfilePaths>

export function resolveNovelXProfilePaths(input: { roamingAppData: string; localAppData: string }) {
  const roaming = join(input.roamingAppData, "NovelX")
  const local = join(input.localAppData, "NovelX")
  const config = join(roaming, "config")

  return {
    config,
    configFile: join(config, "opencode.json"),
    data: join(local, "data"),
    state: join(local, "state"),
    cache: join(local, "cache"),
    desktop: join(roaming, "desktop"),
    session: join(local, "session"),
    logs: join(local, "logs"),
    databaseFileName: "novelx.db",
  }
}

export function applyNovelXProfile(paths: NovelXProfilePaths, env: NodeJS.ProcessEnv = process.env) {
  Object.assign(env, {
    XDG_CONFIG_HOME: paths.config,
    XDG_DATA_HOME: paths.data,
    XDG_STATE_HOME: paths.state,
    XDG_CACHE_HOME: paths.cache,
    OPENCODE_CONFIG: paths.configFile,
    OPENCODE_DB: paths.databaseFileName,
  })
}
