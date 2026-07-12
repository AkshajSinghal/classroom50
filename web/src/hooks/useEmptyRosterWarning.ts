import useGetStudents from "@/hooks/useGetStudents"
import { useTeamRoster } from "@/hooks/useTeamRoster"
import { resolveEmptyRosterWarning } from "@/util/roster"
import type { EmptyRosterDecision } from "@/util/roster"

// Whether to warn a teacher that no student can yet accept an assignment.
//
// The accept link only works for active GitHub org members. Enrollment is team
// membership (the classroom team is the source of truth), so the signal is "zero
// enrolled team members" — a classroom with only pending invites still warrants
// the warning.
export type EmptyRosterWarning = EmptyRosterDecision

const useEmptyRosterWarning = (
  org: string | undefined,
  classroom: string | undefined,
  options?: { enabled?: boolean },
): EmptyRosterWarning => {
  const enabled = options?.enabled ?? true
  const { students, isLoading: studentsLoading } = useGetStudents(
    org,
    classroom,
  )
  // Team roster drives enrollment; roster.csv is only metadata (passed so rows
  // enrich and `hasRosterRows` reflects known students). A non-owner (TA)
  // caller that computes its own gate from roster.csv passes `enabled: false`
  // so this hook's owner-only team reads don't fire and 403.
  const { counts, isLoading, isError } = useTeamRoster(
    org ?? "",
    classroom ?? "",
    students,
    { enabled },
  )

  // When disabled, the team roster never resolves — report a non-warning,
  // non-loading result so the caller's own gate is authoritative.
  if (!enabled) {
    return { show: false, hasRosterRows: students.length > 0, isLoading: false }
  }

  // Decision lives in a pure, tested fn so the branches (esp. the
  // error-as-loading fail-safe) can't drift.
  return resolveEmptyRosterWarning({
    studentsLoading,
    isLoading,
    isError,
    enrolledCount: counts.enrolled,
    hasRosterRows: students.length > 0 || counts.pending > 0,
  })
}

export default useEmptyRosterWarning
