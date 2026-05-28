import { createFileRoute } from "@tanstack/react-router"
import CreateClassroomPage from "@/pages/CreateClassroomPage"

export const Route = createFileRoute("/$org/classes/new/")({
  component: CreateClassroomPage,
})
