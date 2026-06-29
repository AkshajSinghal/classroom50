import { describe, expect, it, vi } from "vitest"

import { removeMemberFromOrg } from "./removeMemberFromOrg"
import type { OrgMemberRow } from "@/util/orgMembers"

// unenrollStudent and removeOrgMembership are stubbed: this helper's contract is
// the SEQUENCE (unenroll every roster, then remove org membership last) and its
// warning accumulation, not the underlying GitHub calls (#76).
const unenrollMock = vi.fn()
const removeOrgMembershipMock = vi.fn()

vi.mock("@/api/mutations/students", () => ({
  unenrollStudent: (...args: unknown[]) => unenrollMock(...args),
}))
vi.mock("@/hooks/github/mutations", () => ({
  removeOrgMembership: (...args: unknown[]) => removeOrgMembershipMock(...args),
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}))

const client = {} as never

const row = (over: Partial<OrgMemberRow>): OrgMemberRow => ({
  key: "42",
  username: "alice",
  github_id: "42",
  name: "Alice",
  email: "alice@x.edu",
  isMember: true,
  classrooms: [],
  classification: "member-on-roster",
  ...over,
})

const access = (classroom: string) => ({
  classroom,
  archived: false,
  enrollment_status: "enrolled" as const,
  section: "",
})

describe("removeMemberFromOrg (#76)", () => {
  it("unenrolls every roster first, then removes org membership last", async () => {
    const calls: string[] = []
    unenrollMock.mockReset().mockImplementation((_c, input) => {
      calls.push(`unenroll:${input.classroom}`)
      return Promise.resolve({})
    })
    removeOrgMembershipMock.mockReset().mockImplementation(() => {
      calls.push("removeOrg")
      return Promise.resolve()
    })

    const result = await removeMemberFromOrg(client, {
      org: "acme",
      row: row({ classrooms: [access("cs101"), access("cs201")] }),
    })

    expect(calls).toEqual(["unenroll:cs101", "unenroll:cs201", "removeOrg"])
    expect(result.unenrolledClassrooms).toEqual(["cs101", "cs201"])
    expect(result.removed).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it("continues and still removes org membership when one unenroll fails", async () => {
    unenrollMock
      .mockReset()
      .mockImplementationOnce(() => Promise.reject(new Error("boom")))
      .mockImplementation(() => Promise.resolve({}))
    removeOrgMembershipMock.mockReset().mockResolvedValue(undefined)

    const result = await removeMemberFromOrg(client, {
      org: "acme",
      row: row({ classrooms: [access("cs101"), access("cs201")] }),
    })

    expect(result.unenrolledClassrooms).toEqual(["cs201"])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/cs101/)
    expect(removeOrgMembershipMock).toHaveBeenCalledTimes(1)
    expect(result.removed).toBe(true)
  })

  it("removes a member on no roster with zero unenroll calls", async () => {
    unenrollMock.mockReset()
    removeOrgMembershipMock.mockReset().mockResolvedValue(undefined)

    const result = await removeMemberFromOrg(client, {
      org: "acme",
      row: row({ classrooms: [], classification: "member-no-roster" }),
    })

    expect(unenrollMock).not.toHaveBeenCalled()
    expect(removeOrgMembershipMock).toHaveBeenCalledTimes(1)
    expect(result.removed).toBe(true)
  })
})
