import {
  createFileRoute,
  Outlet,
  useParams,
  useRouterState,
} from "@tanstack/react-router"

import { useGithubAuth } from "@/auth/useGithubAuth"
import { useClassroomRole } from "@/hooks/useClassroomRole"
import NotFound from "@/components/NotFound"
import RoleResolvingFallback from "@/components/RoleResolvingFallback"
import { ClassroomRoleProvider } from "@/context/classroomRole/ClassroomRoleProvider"

export const Route = createFileRoute("/_authed/$org/$classroom")({
  component: ClassroomLayout,
})

// Pre-enrollment entry points that must render for a viewer with no team in the
// classroom yet (they exist to get such a user enrolled). Matched by route id,
// not a path suffix, so an assignment slug named "onboard"/"accept" can't
// collide and a route rename can't silently re-gate them.
const UNGATED_ROUTE_IDS = [
  "/_authed/$org/$classroom/onboard/",
  "/_authed/$org/$classroom/assignments/$assignment/accept/",
]

// Resolve the viewer's classroom role once for the whole classroom subtree and
// provide it to descendants. Holds a single loading fallback until the role is
// known, and renders NotFound for a viewer on none of the classroom's teams
// (`blocked`) — so no descendant page re-resolves role or handles the
// resolution window. The onboard/accept entry points render outside the gate.
function ClassroomLayout() {
  const { org, classroom } = useParams({ from: "/_authed/$org/$classroom" })
  const { user } = useGithubAuth()
  const { role, actualRole, isLoading } = useClassroomRole(
    org,
    classroom,
    user?.login,
  )

  const onUngatedRoute = useRouterState({
    select: (s) =>
      s.matches.some((m) => UNGATED_ROUTE_IDS.includes(m.routeId)),
  })

  // Pre-enrollment flows must reach a teamless user — never gate them.
  if (onUngatedRoute) return <Outlet />

  if (isLoading || role === "unresolved" || actualRole === "unresolved") {
    return <RoleResolvingFallback />
  }

  // No team in this classroom (and not owner): the app hides the classroom.
  if (role === "blocked" || actualRole === "blocked") return <NotFound />

  return (
    <ClassroomRoleProvider value={{ role, actualRole }}>
      <Outlet />
    </ClassroomRoleProvider>
  )
}
