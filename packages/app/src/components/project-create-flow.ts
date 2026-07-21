export async function openCreatedProject(input: {
  directory: string
  verify: (directory: string) => Promise<boolean>
  register: (directory: string) => void
  unregister: (directory: string) => void
  activate: (directory: string) => Promise<void>
}) {
  if (!(await input.verify(input.directory))) {
    throw new Error("NovelX Runtime did not open the created project directory")
  }
  input.register(input.directory)
  try {
    await input.activate(input.directory)
  } catch (error) {
    input.unregister(input.directory)
    throw error
  }
}
