import { createFileRoute } from '@tanstack/react-router'
import StudentListPage from '@/pages/StudentListPage'

export const Route = createFileRoute('/student_list')({
  component: StudentListPage,
})

