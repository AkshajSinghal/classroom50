import { useMutation } from "@tanstack/react-query"
import CreateAssignmentForm from "./CreateAssignmentForm"
import { editAssignment } from "@/api/mutations/assignments"
import { useGitHubClient } from "@/context/github/GitHubProvider"

const EditAssignmentForm = ({
  org,
  classroom,
  assignment,
  defaultData,
  onSuccess,
}) => {
  const client = useGitHubClient()
  const editAssignmentMutation = useMutation({
    mutationFn: (input) => editAssignment(client, input),
    onSuccess,
  })

  if (!defaultData) {
    return (
      <div className="flex">
        <div className="m-auto loading loading-spinner" />
      </div>
    )
  }

  return (
    <CreateAssignmentForm
      edit
      loading={editAssignmentMutation.isPending}
      defaultValues={defaultData}
      onSubmit={(values) => {
        editAssignmentMutation.mutateAsync({
          name: values.name,
          mode: values.mode,
          org,
          template_repo: values.template_repo,
          description: values.description,
          due_date: values.due_date,
          max_group_size: values.max_group_size,
          feedback_pr: values.feedback_pr,
          classroom,
          tests: values.tests,
          slug: assignment,
        })
      }}
    />
  )
}

export default EditAssignmentForm
