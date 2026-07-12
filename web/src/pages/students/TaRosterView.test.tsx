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

const getStudentsSpy = vi.fn()
vi.mock("@/hooks/useGetStudents", () => ({
  default: (...args: unknown[]) => getStudentsSpy(...args),
}))

import TaRosterView from "./TaRosterView"
import type { Student } from "@/types/classroom"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const student = (over: Partial<Student> = {}): Student => ({
  username: "octocat",
  first_name: "Mona",
  last_name: "Cat",
  email: "mona@example.com",
  section: "A",
  github_id: "42",
  role: "student",
  ...over,
})

const mockResult = (over: {
  students?: Student[]
  isLoading?: boolean
  isError?: boolean
}) =>
  getStudentsSpy.mockReturnValue({
    students: over.students ?? [],
    isLoading: over.isLoading ?? false,
    isError: over.isError ?? false,
    parseProblems: [],
    recheckRoster: () => {},
    rechecking: false,
  })

const renderView = () => render(<TaRosterView org="acme" classroom="cs101" />)

describe("TaRosterView", () => {
  it("renders a row per roster.csv student with role badges and the caveat (AE1)", () => {
    mockResult({
      students: [
        student({ username: "alice", first_name: "Alice", role: "ta" }),
        student({ username: "bob", first_name: "Bob", role: "student" }),
      ],
    })
    renderView()

    expect(screen.getByText("students.taRosterCaveat")).toBeTruthy()
    expect(screen.getByText("@alice")).toBeTruthy()
    expect(screen.getByText("@bob")).toBeTruthy()
    // Known roles render a badge; ta + student labels are present.
    expect(screen.getByText("students.roleTa")).toBeTruthy()
    expect(screen.getByText("students.roleStudent")).toBeTruthy()
  })

  it("renders no role badge for an empty/unknown CSV role (R2, KTD5)", () => {
    mockResult({
      students: [
        student({ username: "carol", role: "" }),
        student({ username: "dave", role: "grader" }),
      ],
    })
    renderView()

    expect(screen.getByText("@carol")).toBeTruthy()
    expect(screen.getByText("@dave")).toBeTruthy()
    // No known-role label rendered for either unknown value.
    expect(screen.queryByText("students.roleStudent")).toBeNull()
    expect(screen.queryByText("students.roleTa")).toBeNull()
    expect(screen.queryByText("students.roleInstructor")).toBeNull()
  })

  it("shows the empty-roster message on a successful empty read (KTD7)", () => {
    mockResult({ students: [] })
    renderView()

    expect(screen.getByText("students.taRosterEmpty")).toBeTruthy()
    expect(screen.queryByText("students.taRosterLoadError")).toBeNull()
  })

  it("shows the load-error message on a failed read, not the empty message (KTD7)", () => {
    mockResult({ students: [], isError: true })
    renderView()

    expect(screen.getByText("students.taRosterLoadError")).toBeTruthy()
    expect(screen.queryByText("students.taRosterEmpty")).toBeNull()
  })

  it("shows a loading indicator while fetching", () => {
    mockResult({ isLoading: true })
    renderView()

    expect(screen.getByRole("status")).toBeTruthy()
    expect(screen.queryByText("students.taRosterEmpty")).toBeNull()
  })

  it("is read-only: no edit, select, or invite controls (R3)", () => {
    mockResult({ students: [student({ username: "alice" })] })
    renderView()

    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
