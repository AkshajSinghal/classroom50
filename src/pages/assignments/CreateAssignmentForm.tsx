import { useForm } from "@tanstack/react-form"
import GitHub from "@/assets/github.svg?react"
import AutogradingTestsPane from "./AutogradingTestsPane"

export type CreateAssignmentFormValues = {
  name: string
  description: string
  mode: "group" | "individual"
  template_repo: string
  due_date: string
}

type CreateAssignmentFormProps = {
  defaultValues?: Partial<CreateAssignmentFormValues>
  onSubmit: (values: CreateAssignmentFormValues) => void | Promise<void>
}

const CreateAssignmentForm = ({
  defaultValues,
  onSubmit,
}: CreateAssignmentFormProps) => {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      mode: defaultValues?.mode ?? "individual",
      template_repo: defaultValues?.template_repo ?? "",
      due_date: defaultValues?.due_date ?? new Date().toString(),
    } satisfies CreateAssignmentFormValues,
    validators: {
      onSubmit: ({ value }) => {
        const errors: Partial<
          Record<keyof CreateAssignmentFormValues, string>
        > = {}
        if (!value.name.trim()) {
          errors.name = "Assignment name is required."
        }

        return Object.keys(errors).length > 0 ? { fields: errors } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name.trim(),
        description: value.description.trim(),
        mode: value.mode,
        template_repo: value.template_repo.trim(),
        due_date: value.due_date.trim(),
      })
    },
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="card bg-base-100 w-full shadow-sm mb-6">
        <div className="card-body">
          <h3 className="text-lg font-bold pb-4">Basic Information</h3>

          <form.Field name="name">
            {(field) => (
              <>
                <label htmlFor={field.name} className="label font-bold">
                  Assignment Name<span className="text-[#f00]">*</span>
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="text"
                  className="input w-full mb-4"
                  placeholder="e.g., Loops Assignment"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <>
                <label htmlFor={field.name} className="label font-bold">
                  Description
                </label>
                <textarea
                  id={field.name}
                  name={field.name}
                  className="textarea w-full mb-4"
                  placeholder="Describe the assignment objectives..."
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </>
            )}
          </form.Field>

          <div className="flex justify-between mb-4">
            <div>
              <form.Field name="template_repo">
                {(field) => (
                  <>
                    <div>
                      <label
                        htmlFor={field.name}
                        className="label font-bold mb-2"
                      >
                        Template Repository
                      </label>
                    </div>
                    <div className="flex">
                      <GitHub className="size-6 mr-2 text-[#ddd] opacity-50" />
                      <input
                        id={field.name}
                        name={field.name}
                        type="text"
                        placeholder="org-name/repo-name"
                        className="input"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                    <p className="label pt-2">
                      Students will receive a copy of this repository.
                    </p>
                  </>
                )}
              </form.Field>
            </div>
            <div>
              <form.Field name="due_date">
                {(field) => (
                  <>
                    <label
                      htmlFor={field.name}
                      className="label font-bold mb-2"
                    >
                      Due Date
                    </label>
                    <input
                      id={field.name}
                      name={field.name}
                      type="date"
                      className="input"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </>
                )}
              </form.Field>
            </div>
          </div>

          <div>
            <form.Field name="mode">
              {(field) => (
                <>
                  <div>
                    <label className="label font-bold mb-2">
                      Assignment Type
                    </label>
                  </div>
                  <input
                    type="radio"
                    className="radio"
                    name={field.name}
                    value="individual"
                    checked={field.state.value === "individual"}
                    onBlur={field.handleBlur}
                    onChange={() => field.handleChange("individual")}
                  />
                  <label className="label pl-2">Individual</label>
                  <input
                    type="radio"
                    className="radio ml-6"
                    name={field.name}
                    value="group"
                    checked={field.state.value === "group"}
                    onBlur={field.handleBlur}
                    onChange={() => field.handleChange("group")}
                  />
                  <label className="label pl-2">Group Project</label>
                </>
              )}
            </form.Field>
          </div>
        </div>
      </div>
      <AutogradingTestsPane />
      <div className="divider" />
      <div className="card-actions justify-end p-2">
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create Classroom"}
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

export default CreateAssignmentForm
