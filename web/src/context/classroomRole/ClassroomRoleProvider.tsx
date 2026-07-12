import { createContext, useContext, useMemo, type ReactNode } from "react"

import type { EffectiveRole } from "@/hooks/useClassroomRole"

// The viewer's resolved classroom role, provided once by the classroom layout
// boundary (routes/_authed/$org/$classroom/route.tsx). By the time this value
// exists the boundary has already gated on resolution and blocked non-members,
// so `role`/`actualRole` are never "unresolved" or "blocked" — descendants get
// a settled role and need no per-page resolution-window handling.
//
// `role` is the effective (view-as-applied) role; `actualRole` is the real one
// (for the drawer's "View as" preview gate).
export type ResolvedClassroomRole = {
  role: Exclude<EffectiveRole, "unresolved" | "blocked">
  actualRole: Exclude<EffectiveRole, "unresolved" | "blocked">
}

const ClassroomRoleContext = createContext<ResolvedClassroomRole | null>(null)

export function ClassroomRoleProvider({
  value,
  children,
}: {
  value: ResolvedClassroomRole
  children: ReactNode
}) {
  const memoized = useMemo(() => value, [value.role, value.actualRole])
  return (
    <ClassroomRoleContext.Provider value={memoized}>
      {children}
    </ClassroomRoleContext.Provider>
  )
}

// Read the resolved role. Throws outside the boundary — a page under
// $org/$classroom always has one, so a missing provider is a wiring bug.
export function useClassroomRoleContext(): ResolvedClassroomRole {
  const value = useContext(ClassroomRoleContext)
  if (!value) {
    throw new Error(
      "useClassroomRoleContext must be used under the $org/$classroom boundary",
    )
  }
  return value
}

// Non-throwing read for components that straddle org and classroom scope (the
// drawer). Returns null outside a classroom boundary, so the caller can fall
// back to its org-level behavior instead of crashing.
export function useOptionalClassroomRoleContext(): ResolvedClassroomRole | null {
  return useContext(ClassroomRoleContext)
}
