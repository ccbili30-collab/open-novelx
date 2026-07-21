export function isNovelXHiddenProjectPath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "")
  const parts = normalized.toLocaleLowerCase().split("/")
  if (parts.some((part) => part === ".git" || part === "node_modules" || part === ".novelx" || part === ".opencode")) return true
  const name = parts.at(-1) ?? ""
  return /^(?:\.env(?:\..+)?|auth\.json|credentials\.json|opencode\.db(?:-(?:shm|wal))?)$/iu.test(name)
}
