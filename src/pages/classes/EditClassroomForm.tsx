import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"
import useGetClasses from "@/hooks/useGetClasses"
import useGetClassroom from "@/hooks/useGetClassroom"
import { useForm } from "@tanstack/react-form"
import { useParams } from "@tanstack/react-router"
import { useEffect, useState } from "react"

export type EditClassroomFormValues = {
  name: string
  term: string
}

type EditClassroomFormProps = {
  defaultValues?: Partial<EditClassroomFormValues>
  onSubmit: (values: EditClassroomFormValues) => void | Promise<void>
}

const EditClassroomForm = ({ onSubmit, cl }: EditClassroomFormProps) => {
  const { org, classroom } = useParams({ strict: false })
  const [submitted, setSubmitted] = useState(false)

  const form = useForm({
    defaultValues: {
      name: cl?.name || cl?.short_name || "",
      term: cl?.term || "",
    } satisfies EditClassroomFormValues,
    validators: {
      onSubmit: ({ value }) => {
        const errors: Partial<Record<keyof EditClassroomFormValues, string>> =
          {}
        if (!value.name.trim()) {
          errors.name = "Classroom name is required."
        }

        return Object.keys(errors).length > 0
          ? {
              fields: errors,
            }
          : undefined
      },
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name.trim(),
        term: value.term.trim(),
      })
      setSubmitted(true)
    },
  })

  return (
    <form
      className="card bg-base-100 w-full shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="card-body">
        <h3 className="text-lg font-bold pb-4">Basic Information</h3>

        <form.Field name="name">
          {(field) => (
            <>
              <label htmlFor={field.name} className="label font-bold">
                Classroom Name<span className="text-[#f00]">*</span>
              </label>

              <input
                id={field.name}
                name={field.name}
                type="text"
                className="input w-full mb-4"
                placeholder="e.g., AP CS Principles"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />

              {field.state.meta.errors.length > 0 && (
                <p className="text-error text-sm mb-4">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </>
          )}
        </form.Field>

        <>
          <label className="label font-bold">
            Classroom Slug<span className="text-[#f00]">*</span>
          </label>

          <input
            type="text"
            disabled
            className="input w-full mb-4"
            placeholder="e.g., ap-cs-principles"
            value={classroom}
          />
        </>

        <form.Field name="term">
          {(field) => (
            <>
              <label htmlFor={field.name} className="label font-bold">
                Classroom Term
              </label>

              <input
                id={field.name}
                name={field.name}
                type="text"
                className="input w-full mb-4"
                placeholder="e.g., Fall 2026"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />

              {field.state.meta.errors.length > 0 && (
                <p className="text-error text-sm mb-4">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </>
          )}
        </form.Field>

        <div className="card-actions justify-end p-2">
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmit || isSubmitting || submitted}
              >
                {isSubmitting ? "Saving..." : "Save Classroom"}
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </form>
  )
}

export default EditClassroomForm
