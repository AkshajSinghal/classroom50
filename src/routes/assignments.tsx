import { createFileRoute } from '@tanstack/react-router'
import AssignmentsPage from '@/pages/AssignmentListPage'

export const Route = createFileRoute('/assignments')({
  component: AssignmentsPage,
})

