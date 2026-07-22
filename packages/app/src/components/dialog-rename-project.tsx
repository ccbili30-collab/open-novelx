import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { DividerV2 } from "@opencode-ai/ui/v2/divider-v2"
import { Field } from "@opencode-ai/ui/v2/field-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { type LocalProject } from "@/context/layout"
import { ServerConnection } from "@/context/server"
import { createEditProjectModel } from "./edit-project"

export function DialogRenameProject(props: { project: LocalProject; server: ServerConnection.Any }) {
  const language = useLanguage()
  const model = createEditProjectModel(props)

  return (
    <Dialog fit>
      <form onSubmit={model.submit} class="contents">
        <DialogHeader>
          <DialogTitle>{language.t("novelx.project.rename.title")}</DialogTitle>
        </DialogHeader>
        <DividerV2 />
        <DialogBody class="w-[min(420px,calc(100vw-32px))] px-4 py-4">
          <Field>
            <Field.Label>{language.t("dialog.project.edit.name")}</Field.Label>
            <TextInputV2
              autofocus
              appearance="large"
              class="!w-full"
              value={model.store.name}
              placeholder={model.folderName()}
              onInput={(event) => model.setStore("name", event.currentTarget.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <ButtonV2 type="button" variant="neutral" disabled={model.save.isPending} onClick={() => model.close()}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2 type="submit" variant="contrast" disabled={model.save.isPending}>
            {model.save.isPending ? language.t("common.saving") : language.t("common.save")}
          </ButtonV2>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
