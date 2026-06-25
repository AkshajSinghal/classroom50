import { useGitHubRepo } from "./github/hooks"
import { GitHubAPIError } from "./github/errors"

export type CourseManifest = {
  course: {
    slug: string
    title: string
  }
  assignments: Array<{
    id: string
    title: string
    repo: string
  }>
  students?: Array<{
    github: string
    name?: string
  }>
}

// The subset of the repo-query state the verdict depends on. Kept structural so
// the verdict logic is a pure function we can unit-test without React Query.
export type TeacherVerdictInput = {
  org: string | undefined
  isSuccess: boolean
  permissions?: {
    admin?: boolean
    maintain?: boolean
    push?: boolean
    pull?: boolean
  }
  error: unknown
}

export type TeacherVerdict = {
  isTeacher: boolean
  isStudent: boolean
  isBlocked: boolean
  roleResolved: boolean
  showTeacherUi: boolean
}

// Pure, fail-closed role resolution against the org's `classroom50` config repo.
//
// - Teacher: the repo GET succeeded and the caller has any non-trivial
//   permission on it.
// - Student: a definitive 404 (no access to the config repo).
// - Blocked: a definitive 403.
// - Resolved ONLY on a definitive verdict (success / 404 / 403). A transient
//   5xx/429/network error must NOT resolve the role — otherwise a student
//   during a blip would be treated as a non-student and promoted into teacher
//   UI. showTeacherUi additionally requires a positive success verdict, so a
//   transient error leaves it false (consumers keep their pending state).
// - An org-less route has no role to resolve.
export function resolveTeacherVerdict(
  input: TeacherVerdictInput,
): TeacherVerdict {
  const { org, isSuccess, permissions, error } = input

  const isTeacher =
    isSuccess &&
    Boolean(
      permissions?.admin ||
      permissions?.maintain ||
      permissions?.push ||
      permissions?.pull,
    )

  const isStudent = error instanceof GitHubAPIError && error.status === 404
  const isBlocked = error instanceof GitHubAPIError && error.status === 403

  const roleResolved = !org || isSuccess || isStudent || isBlocked
  const showTeacherUi = Boolean(org) && isTeacher

  return { isTeacher, isStudent, isBlocked, roleResolved, showTeacherUi }
}

export function useCourseTeacherAccess(org: string | undefined) {
  const teacherRepo = "classroom50"
  // Bounded retry on transient errors only: a 404 (student) / 403 (blocked) is
  // a definitive verdict and must not be retried, but a 5xx/429/network blip
  // should self-heal instead of stranding the role unresolved.
  const repoQuery = useGitHubRepo(org, teacherRepo, {
    retry: (failureCount, error) => {
      if (
        error instanceof GitHubAPIError &&
        (error.status === 404 || error.status === 403)
      ) {
        return false
      }
      return failureCount < 2
    },
  })

  const verdict = resolveTeacherVerdict({
    org,
    isSuccess: repoQuery.isSuccess,
    permissions: repoQuery.data?.permissions,
    error: repoQuery.error,
  })

  return {
    ...repoQuery,
    teacherRepo,
    ...verdict,
  }
}
