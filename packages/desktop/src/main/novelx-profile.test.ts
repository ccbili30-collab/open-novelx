import { describe, expect, test } from "bun:test"
import { applyNovelXProfile, resolveNovelXProfilePaths } from "./novelx-profile"

describe("NovelX desktop profile", () => {
  test("separates roaming configuration from local runtime state", () => {
    const profile = resolveNovelXProfilePaths({
      roamingAppData: "C:\\Users\\tester\\AppData\\Roaming",
      localAppData: "C:\\Users\\tester\\AppData\\Local",
    })

    expect(profile.configFile).toBe("C:\\Users\\tester\\AppData\\Roaming\\NovelX\\config\\opencode.json")
    expect(profile.data).toBe("C:\\Users\\tester\\AppData\\Local\\NovelX\\data")
    expect(profile.state).toBe("C:\\Users\\tester\\AppData\\Local\\NovelX\\state")
    expect(profile.cache).toBe("C:\\Users\\tester\\AppData\\Local\\NovelX\\cache")
    expect(profile.session).toBe("C:\\Users\\tester\\AppData\\Local\\NovelX\\session")
    expect(profile.logs).toBe("C:\\Users\\tester\\AppData\\Local\\NovelX\\logs")
    expect(profile.databaseFileName).toBe("novelx.db")
  })

  test("overrides inherited NovelX roots before the embedded runtime loads", () => {
    const profile = resolveNovelXProfilePaths({ roamingAppData: "R:\\Roaming", localAppData: "L:\\Local" })
    const env: NodeJS.ProcessEnv = {
      XDG_CONFIG_HOME: "C:\\NovelX\\config",
      XDG_DATA_HOME: "C:\\NovelX\\data",
      OPENCODE_CONFIG: "C:\\NovelX\\opencode.json",
    }

    applyNovelXProfile(profile, env)

    expect(env.XDG_CONFIG_HOME).toBe(profile.config)
    expect(env.XDG_DATA_HOME).toBe(profile.data)
    expect(env.XDG_STATE_HOME).toBe(profile.state)
    expect(env.XDG_CACHE_HOME).toBe(profile.cache)
    expect(env.OPENCODE_CONFIG).toBe(profile.configFile)
    expect(env.OPENCODE_DB).toBe("novelx.db")
  })
})
