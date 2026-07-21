import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { DividerV2 } from "@opencode-ai/ui/v2/divider-v2"
import { Field } from "@opencode-ai/ui/v2/field-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { Show, createMemo, createSignal } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"

const errorText = (error: unknown) => (error instanceof Error && error.message ? error.message : String(error))

type CreatedProject = { directory: string; projectID: string }

export function DialogCreateProject(props: { openProject: (directory: string, projectID: string) => Promise<void> }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const [name, setName] = createSignal("")
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal("")
  const [createdProject, setCreatedProject] = createSignal<CreatedProject>()
  const canSubmit = createMemo(() => !!name().trim() && !pending())

  const open = async (created: CreatedProject) => {
    try {
      await props.openProject(created.directory, created.projectID)
      dialog.close()
    } catch (cause) {
      setCreatedProject(created)
      setError(
        language.t("novelx.project.create.openFailed", { directory: created.directory, error: errorText(cause) }),
      )
    }
  }

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (!canSubmit()) return
    setPending(true)
    setError("")
    try {
      const created = createdProject()
      if (created) {
        await open(created)
        return
      }
      if (!platform.createProjectDirectory) {
        setError(language.t("novelx.project.create.unavailable"))
        return
      }
      const result = await platform.createProjectDirectory({
        name: name(),
        title: language.t("novelx.project.create.locationTitle"),
      })
      if (result.status === "cancelled") return
      if (result.status === "invalid-name") {
        setError(language.t("novelx.project.create.invalidName"))
        return
      }
      if (result.status === "git-unavailable") {
        setError(language.t("novelx.project.create.gitUnavailable"))
        return
      }
      if (result.status === "conflict") {
        setError(language.t("novelx.project.create.conflict"))
        return
      }
      const project = { directory: result.directory, projectID: result.projectID }
      setCreatedProject(project)
      await open(project)
    } catch (cause) {
      setError(language.t("novelx.project.create.failed", { error: errorText(cause) }))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog fit>
      <form onSubmit={submit} class="contents">
        <DialogHeader>
          <DialogTitle>{language.t("session.new.project.new")}</DialogTitle>
        </DialogHeader>
        <DividerV2 />
        <DialogBody class="flex w-[420px] max-w-[calc(100vw-48px)] flex-col gap-4 px-4 pt-4 pb-2">
          <Field invalid={!!error()}>
            <Field.Label>{language.t("novelx.project.create.name")}</Field.Label>
            <TextInputV2
              autofocus
              appearance="large"
              class="!w-full"
              value={name()}
              disabled={pending() || !!createdProject()}
              placeholder={language.t("novelx.project.create.placeholder")}
              onInput={(event) => {
                setName(event.currentTarget.value)
                setError("")
              }}
            />
            <Field.Prefix>{language.t("novelx.project.create.hint")}</Field.Prefix>
          </Field>
          <Show when={error()}>
            {(message) => <p class="text-12-regular text-text-danger-base">{message()}</p>}
          </Show>
        </DialogBody>
        <DialogFooter>
          <ButtonV2 type="button" variant="neutral" disabled={pending()} onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2 type="submit" variant="contrast" disabled={!canSubmit()}>
            {pending()
              ? language.t("novelx.project.create.creating")
              : createdProject()
                ? language.t("novelx.project.create.retryOpen")
                : language.t("novelx.project.create.action")}
          </ButtonV2>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
