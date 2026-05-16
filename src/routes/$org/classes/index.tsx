import { createFileRoute } from '@tanstack/react-router'
import ClassesPage from '@/pages/ClassesPage'

export const Route = createFileRoute('/$org/classes/')({
  component: ClassesPage,
})
