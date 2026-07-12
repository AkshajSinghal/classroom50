// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { render, renderHook, screen, cleanup } from "@testing-library/react"
import type { ReactNode } from "react"

import {
  ClassroomRoleProvider,
  useClassroomRoleContext,
  useOptionalClassroomRoleContext,
} from "./ClassroomRoleProvider"

afterEach(cleanup)

const wrapper =
  (role: "owner" | "instructor" | "ta" | "student", actualRole = role) =>
  ({ children }: { children: ReactNode }) => (
    <ClassroomRoleProvider value={{ role, actualRole }}>
      {children}
    </ClassroomRoleProvider>
  )

describe("ClassroomRoleProvider", () => {
  it("provides the resolved role + actualRole to the throwing accessor", () => {
    const { result } = renderHook(() => useClassroomRoleContext(), {
      wrapper: wrapper("ta", "owner"),
    })
    expect(result.current.role).toBe("ta")
    expect(result.current.actualRole).toBe("owner")
  })

  it("throwing accessor throws outside the provider", () => {
    // Suppress the expected error render noise.
    const spy = () => renderHook(() => useClassroomRoleContext())
    expect(spy).toThrow(/must be used under the \$org\/\$classroom boundary/)
  })

  it("non-throwing accessor returns the value inside the provider", () => {
    const { result } = renderHook(() => useOptionalClassroomRoleContext(), {
      wrapper: wrapper("student"),
    })
    expect(result.current?.role).toBe("student")
  })

  it("non-throwing accessor returns null outside the provider", () => {
    const { result } = renderHook(() => useOptionalClassroomRoleContext())
    expect(result.current).toBeNull()
  })

  it("renders children", () => {
    render(
      <ClassroomRoleProvider value={{ role: "owner", actualRole: "owner" }}>
        <span>child</span>
      </ClassroomRoleProvider>,
    )
    expect(screen.getByText("child")).toBeTruthy()
  })
})
