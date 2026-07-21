import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { ServerConnection, useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { useDirectoryPicker } from "./directory-picker"
import { createProjectOpenCommand } from "./project-open-command-model"

/** Registers project opening for the top-level new layout, including home, drafts and sessions. */
export function ProjectOpenCommand() {
  const command = useCommand()
  const language = useLanguage()
  const layout = useLayout()
  const server = useServer()
  const tabs = useTabs()
  const pickDirectory = useDirectoryPicker()

  command.register("new-layout-project", () => [
    createProjectOpenCommand({
      title: language.t("command.project.open"),
      category: language.t("command.category.project"),
      choose(onSelect) {
        const connection = server.current
        if (!connection) return
        pickDirectory({
          server: connection,
          title: language.t("command.project.open"),
          multiple: true,
          onSelect,
        })
      },
      open(directory) {
        layout.projects.open(directory)
      },
      activate(directory) {
        const connection = server.current
        if (!connection) return
        server.projects.touch(directory)
        void tabs.newDraft({ server: ServerConnection.key(connection), directory })
      },
    }),
  ])

  return null
}
