import type { CommandOption } from "@/context/command"

type ProjectOpenCommandInput = {
  title: string
  category: string
  choose: (onSelect: (result: string | string[] | null) => void) => void
  open: (directory: string) => void
  activate: (directory: string) => void
}

export function createProjectOpenCommand(input: ProjectOpenCommandInput): CommandOption {
  return {
    id: "project.open",
    title: input.title,
    category: input.category,
    keybind: "mod+o",
    onSelect: () => {
      input.choose((result) => {
        const directories = Array.isArray(result) ? result : result ? [result] : []
        if (directories.length === 0) return
        directories.forEach(input.open)
        input.activate(directories[0])
      })
    },
  }
}
