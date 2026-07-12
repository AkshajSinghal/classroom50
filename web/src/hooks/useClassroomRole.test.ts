import { describe, expect, it } from "vitest"
import {
  resolveClassroomRole,
  isStaffRole,
  isInstructorRole,
  isResolvedInstructorOrOwner,
  applyViewAs,
  roleLabelKey,
  type ClassroomRoleInput,
} from "./useClassroomRole"

const base: ClassroomRoleInput = {
  org: "acme",
  classroom: "cs101",
  isOwner: false,
  instructor: "non-member",
  ta: "non-member",
  student: "member",
}

describe("resolveClassroomRole", () => {
  it("owner outranks everything and needs no team read", () => {
    expect(
      resolveClassroomRole({
        ...base,
        isOwner: true,
        // even with unresolved team signals, owner short-circuits
        instructor: "unresolved",
        ta: "unresolved",
        student: "unresolved",
      }),
    ).toBe("owner")
  })

  it("instructor when in the instructor team", () => {
    expect(resolveClassroomRole({ ...base, instructor: "member" })).toBe(
      "instructor",
    )
  })

  it("instructor outranks ta when in both", () => {
    expect(
      resolveClassroomRole({ ...base, instructor: "member", ta: "member" }),
    ).toBe("instructor")
  })

  it("ta when in the ta team but not the instructor team", () => {
    expect(resolveClassroomRole({ ...base, ta: "member" })).toBe("ta")
  })

  it("student when on the student team and neither staff team", () => {
    expect(resolveClassroomRole(base)).toBe("student")
  })

  it("blocked when on none of the classroom's teams (not owner)", () => {
    expect(resolveClassroomRole({ ...base, student: "non-member" })).toBe(
      "blocked",
    )
  })

  it("config-repo access is no longer an input — student-team membership decides", () => {
    // A former "staff repo access but no team" case now hinges on team
    // membership alone: student team => student.
    expect(resolveClassroomRole({ ...base, student: "member" })).toBe("student")
  })

  describe("fail-closed (unresolved) on transient signals we depend on", () => {
    it("unresolved when a staff team read is in flight (might be staff)", () => {
      expect(resolveClassroomRole({ ...base, instructor: "unresolved" })).toBe(
        "unresolved",
      )
      expect(resolveClassroomRole({ ...base, ta: "unresolved" })).toBe(
        "unresolved",
      )
    })

    it("does NOT trust a student match while a staff signal is still in flight", () => {
      // student member but instructor unresolved => hold, don't render student
      expect(
        resolveClassroomRole({
          ...base,
          instructor: "unresolved",
          student: "member",
        }),
      ).toBe("unresolved")
    })

    it("does NOT go unresolved when a higher role already matched", () => {
      expect(
        resolveClassroomRole({
          ...base,
          instructor: "member",
          ta: "unresolved",
          student: "unresolved",
        }),
      ).toBe("instructor")
    })

    it("unresolved when the student read is in flight (staff definitively out)", () => {
      expect(resolveClassroomRole({ ...base, student: "unresolved" })).toBe(
        "unresolved",
      )
    })

    it("holds unresolved on a classroom route while ownership is still loading", () => {
      // isOwner undefined + no staff match yet => hold rather than decide.
      expect(
        resolveClassroomRole({
          ...base,
          isOwner: undefined,
          student: "non-member",
        }),
      ).toBe("unresolved")
    })

    it("still resolves a confirmed staff-team member while ownership loads (team read is definitive)", () => {
      expect(
        resolveClassroomRole({
          ...base,
          isOwner: undefined,
          instructor: "member",
        }),
      ).toBe("instructor")
      expect(
        resolveClassroomRole({ ...base, isOwner: undefined, ta: "member" }),
      ).toBe("ta")
    })

    it("resolves student/blocked only once ownership is known (isOwner false)", () => {
      expect(resolveClassroomRole({ ...base, isOwner: false })).toBe("student")
      expect(
        resolveClassroomRole({
          ...base,
          isOwner: false,
          student: "non-member",
        }),
      ).toBe("blocked")
    })
  })

  describe("org/classroom-less contexts", () => {
    it("is student with no org", () => {
      expect(resolveClassroomRole({ ...base, org: undefined })).toBe("student")
    })
    it("resolves OWNER on an org-level route with no classroom (Create Classroom regression)", () => {
      expect(
        resolveClassroomRole({
          ...base,
          classroom: undefined,
          isOwner: true,
        }),
      ).toBe("owner")
    })
    it("holds unresolved on an org-level route while ownership is still loading", () => {
      expect(
        resolveClassroomRole({
          ...base,
          classroom: undefined,
          isOwner: undefined,
        }),
      ).toBe("unresolved")
    })
    it("is student on an org-level route for a known non-owner", () => {
      expect(
        resolveClassroomRole({
          ...base,
          classroom: undefined,
          isOwner: false,
        }),
      ).toBe("student")
    })
  })
})

describe("role predicates", () => {
  it("isStaffRole: owner/instructor/ta/unresolved true; student/blocked false", () => {
    expect(isStaffRole("owner")).toBe(true)
    expect(isStaffRole("instructor")).toBe(true)
    expect(isStaffRole("ta")).toBe(true)
    expect(isStaffRole("unresolved")).toBe(true) // permissive: let page load
    expect(isStaffRole("student")).toBe(false)
    expect(isStaffRole("blocked")).toBe(false)
  })

  it("isInstructorRole: owner/instructor/unresolved true; ta/student/blocked false", () => {
    expect(isInstructorRole("owner")).toBe(true)
    expect(isInstructorRole("instructor")).toBe(true)
    expect(isInstructorRole("unresolved")).toBe(true)
    expect(isInstructorRole("ta")).toBe(false)
    expect(isInstructorRole("student")).toBe(false)
    expect(isInstructorRole("blocked")).toBe(false)
  })

  it("isResolvedInstructorOrOwner: owner/instructor true; unresolved/ta/student/blocked false", () => {
    expect(isResolvedInstructorOrOwner("owner")).toBe(true)
    expect(isResolvedInstructorOrOwner("instructor")).toBe(true)
    // The distinction from isInstructorRole: unresolved is NOT permissive here,
    // so owner-only reads gated on this never fire during role resolution.
    expect(isResolvedInstructorOrOwner("unresolved")).toBe(false)
    expect(isResolvedInstructorOrOwner("ta")).toBe(false)
    expect(isResolvedInstructorOrOwner("student")).toBe(false)
    expect(isResolvedInstructorOrOwner("blocked")).toBe(false)
  })

  it("roleLabelKey: owner+instructor => nav.roleInstructor, ta => nav.roleTa, student => nav.roleStudent, unresolved/blocked => null", () => {
    expect(roleLabelKey("owner")).toBe("nav.roleInstructor")
    expect(roleLabelKey("instructor")).toBe("nav.roleInstructor")
    expect(roleLabelKey("ta")).toBe("nav.roleTa")
    expect(roleLabelKey("student")).toBe("nav.roleStudent")
    expect(roleLabelKey("unresolved")).toBeNull()
    expect(roleLabelKey("blocked")).toBeNull()
  })
})

describe("applyViewAs (#221 downgrade-only preview)", () => {
  it("passes through when no preview is set", () => {
    expect(applyViewAs("owner", null)).toBe("owner")
    expect(applyViewAs("ta", null)).toBe("ta")
  })

  it("lets an owner preview ta or student", () => {
    expect(applyViewAs("owner", "ta")).toBe("ta")
    expect(applyViewAs("owner", "student")).toBe("student")
  })

  it("lets an instructor preview ta or student", () => {
    expect(applyViewAs("instructor", "ta")).toBe("ta")
    expect(applyViewAs("instructor", "student")).toBe("student")
  })

  it("NEVER escalates: a real ta/student previewing higher stays put", () => {
    expect(applyViewAs("ta", "student")).toBe("student")
    expect(applyViewAs("student", "ta")).toBe("student")
    expect(applyViewAs("student", "student")).toBe("student")
  })

  it("never raises above the actual role (instructor previewing 'ta' can't exceed)", () => {
    expect(applyViewAs("instructor", "ta")).toBe("ta")
  })

  it("does not clamp an unresolved role (guard still resolving)", () => {
    expect(applyViewAs("unresolved", "student")).toBe("unresolved")
  })

  it("does not clamp a blocked role (no classroom to preview)", () => {
    expect(applyViewAs("blocked", "student")).toBe("blocked")
    expect(applyViewAs("blocked", "ta")).toBe("blocked")
  })

  it("a preview equal to or above the actual role is a no-op", () => {
    expect(applyViewAs("ta", "ta")).toBe("ta")
  })
})
