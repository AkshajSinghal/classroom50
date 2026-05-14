import { createFileRoute } from '@tanstack/react-router'
import AcceptAssignmentPage from '@/pages/AcceptAssignmentPage'

export const Route = createFileRoute(
  '/$org/$classroom/assignments/$assignment/accept/',
)({
  component: AcceptAssignmentPage
})
