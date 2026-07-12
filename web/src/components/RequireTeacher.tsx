import { type ReactNode } from "react"
import { useParams } from "@tanstack/react-router"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import {
  useClassroomRole,
  isInstructorRole,
  isStaffRole,
} from "@/hooks/useClassroomRole"
import { useGithubAuth } from "@/auth/useGithubAuth"
import { useOptionalClassroomRoleContext } from "@/context/classroomRole/ClassroomRoleProvider"
import NotFound from "@/components/NotFound"
import RoleResolvingFallback from "@/components/RoleResolvingFallback"

// What a guarded surface requires:
// - "staff": any classroom staff (owner/instructor/ta) — for classroom CONTENT
//   (roster, authoring, submissions).
// - "instructor": owner OR instructor of THIS classroom (excludes TAs) — for
//   classroom SETTINGS.
// - "owner": org admin only — for ORG-wide settings/setup, where TA and
//   instructor can't be distinguished without a classroom context.
export type RequireRole = "staff" | "instructor" | "owner"

// Gate page content by role. Classroom-scoped surfaces sit under the
// $org/$classroom boundary, which has already resolved the role and blocked
// non-members — so this guard just applies the `allow` filter over the resolved
// context, no spinner or blocked-handling of its own. Org-level surfaces (no
// classroom in scope) have no boundary, so they fall back to the coarse
// config-repo verdict. Access is GitHub-enforced underneath; this UX guard 404s
// rather than 403s by design. Default `allow: "staff"`.
const RequireTeacher = ({
  children,
  allow = "staff",
}: {
  children: ReactNode
  allow?: RequireRole
}) => {
  const resolved = useOptionalClassroomRoleContext()

  // Under the classroom boundary: the role is resolved and non-blocked. Apply
  // the allow filter directly.
  if (resolved) {
    const permitted =
      allow === "owner"
        ? resolved.role === "owner"
        : allow === "instructor"
          ? isInstructorRole(resolved.role)
          : isStaffRole(resolved.role)
    return permitted ? <>{children}</> : <NotFound />
  }

  // Org-level (no classroom boundary): coarse config-repo verdict.
  return <RequireOrgTeacher allow={allow}>{children}</RequireOrgTeacher>
}

// Org-level fallback for surfaces rendered outside a classroom boundary (org
// settings/members/activity, create-classroom). `staff` uses the coarse
// config-repo verdict (any teacher); `owner`/`instructor` resolve the org-scoped
// role (no classroom => owner-vs-student) so owner-only org surfaces still
// require an org admin — preserving the prior RequireElevated behavior.
const RequireOrgTeacher = ({
  children,
  allow,
}: {
  children: ReactNode
  allow: RequireRole
}) => {
  const { org, classroom } = useParams({ strict: false })
  const { user } = useGithubAuth()
  const coarse = useCourseTeacherAccess(org)
  const { role, isLoading } = useClassroomRole(org, classroom, user?.login)

  if (allow === "staff") {
    if (!coarse.roleResolved) return <RoleResolvingFallback />
    if (!coarse.showTeacherUi) return <NotFound />
    return <>{children}</>
  }

  if (isLoading || role === "unresolved") return <RoleResolvingFallback />
  const permitted =
    allow === "owner" ? role === "owner" : isInstructorRole(role)
  if (!permitted) return <NotFound />
  return <>{children}</>
}

export default RequireTeacher
