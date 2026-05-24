import { createFileRoute } from "@tanstack/react-router"
import OrgPage from "@/pages/OrgPage"
import ClassesPage from "@/pages/ClassesPage"

export const Route = createFileRoute("/$org/")({
  component: ClassesPage,
})
