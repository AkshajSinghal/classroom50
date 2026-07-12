// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  }
})

const useClassroomRole = vi.fn()
vi.mock("@/hooks/useClassroomRole", () => ({
  useClassroomRole: (...args: unknown[]) => useClassroomRole(...args),
}))

vi.mock("@/auth/useGithubAuth", () => ({
  useGithubAuth: () => ({ user: { login: "octocat" } }),
}))

vi.mock("@/pages/students/TaRosterView", () => ({
  default: () => <div data-testid="ta-roster-view" />,
}))

// Owner-only data hooks: sentinels that record invocation so we can assert the
// TA path never subscribes to them (R6).
const getStudentsSpy = vi.fn(() => ({
  students: [],
  isLoading: false,
  isError: false,
  parseProblems: [],
  recheckRoster: () => {},
  rechecking: false,
}))
vi.mock("@/hooks/useGetStudents", () => ({
  default: () => getStudentsSpy(),
  useUpdateRosterCache: () => () => {},
}))

const teamRosterSpy = vi.fn(() => ({
  counts: { enrolled: 0 },
  roleCounts: { student: 0, instructor: 0, ta: 0 },
  isLoading: false,
  isError: false,
}))
vi.mock("@/hooks/useTeamRoster", () => ({
  useTeamRoster: () => teamRosterSpy(),
  useInvalidateTeamRoster: () => () => {},
}))

// Stub the owner subtree so the test focuses on the role branch, not the
// full owner UI. Each renders a sentinel we can assert on.
vi.mock("@/pages/students/EnrolledStudents", () => ({
  default: () => <div data-testid="enrolled-students" />,
}))
vi.mock("@/pages/students/AddStudent", () => ({ default: () => null }))
vi.mock("@/pages/students/UploadRoster", () => ({ default: () => null }))
vi.mock("@/pages/students/InviteLinksModal", () => ({ default: () => null }))
vi.mock("@/hooks/useSuppressedLogins", () => ({
  useSuppressedLogins: () => ({ forget: () => {} }),
}))
vi.mock("@/context/github/GitHubProvider", () => ({
  useGitHubClient: () => ({}) as unknown,
}))
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
}))
vi.mock("@/components/RoleResolvingFallback", () => ({
  default: () => <div data-testid="role-fallback" />,
}))
vi.mock("@/components/NotFound", () => ({
  default: () => <div data-testid="not-found" />,
}))

import { StudentListContent } from "./StudentListPage"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const setRole = (role: string, isLoading = false) =>
  useClassroomRole.mockReturnValue({ role, actualRole: role, isLoading })

const renderContent = () =>
  render(<StudentListContent org="acme" classroom="cs101" />)

describe("StudentListContent role branch", () => {
  it("renders TaRosterView for a ta and never calls owner-only hooks (AE3, R6)", () => {
    setRole("ta")
    renderContent()

    expect(screen.getByTestId("ta-roster-view")).toBeTruthy()
    expect(screen.queryByTestId("enrolled-students")).toBeNull()
    expect(getStudentsSpy).not.toHaveBeenCalled()
    expect(teamRosterSpy).not.toHaveBeenCalled()
  })

  it("renders the owner UI for owner and instructor (AE2)", () => {
    setRole("owner")
    renderContent()
    expect(screen.getByTestId("enrolled-students")).toBeTruthy()
    expect(screen.queryByTestId("ta-roster-view")).toBeNull()

    cleanup()
    setRole("instructor")
    renderContent()
    expect(screen.getByTestId("enrolled-students")).toBeTruthy()
  })

  it("shows the role-resolving fallback while loading or unresolved", () => {
    setRole("unresolved", true)
    renderContent()
    expect(screen.getByTestId("role-fallback")).toBeTruthy()
    expect(screen.queryByTestId("enrolled-students")).toBeNull()
    expect(screen.queryByTestId("ta-roster-view")).toBeNull()

    cleanup()
    setRole("unresolved", false)
    renderContent()
    expect(screen.getByTestId("role-fallback")).toBeTruthy()
  })

  it("shows NotFound for a downgraded non-staff preview (e.g. student)", () => {
    setRole("student")
    renderContent()
    expect(screen.getByTestId("not-found")).toBeTruthy()
    expect(screen.queryByTestId("enrolled-students")).toBeNull()
    expect(screen.queryByTestId("ta-roster-view")).toBeNull()
  })
})
