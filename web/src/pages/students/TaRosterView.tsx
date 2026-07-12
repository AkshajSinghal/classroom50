import { useTranslation } from "react-i18next"

import useGetStudents from "@/hooks/useGetStudents"
import { groupStudentsBySection } from "@/pages/students/EnrolledStudents"
import {
  GitHubIdentity,
  initialsFor,
} from "@/pages/orgMembers/memberPresentation"
import { Alert, Badge, Card, CardBody, Spinner } from "@/components/ui"
import {
  ROLE_BADGE_TONE,
  ROLE_LABEL_KEY,
  knownRosterRole,
} from "@/util/rosterRoles"
import { nameFromParts } from "@/util/students"
import type { MemberListRow } from "@/util/memberRow"
import type { Student } from "@/types/classroom"

// A TA's read-only roster, sourced authoritatively from roster.csv (not GitHub
// teams). TAs can't read the owner-only endpoints that drive the team-driven
// view, and roster.csv is the class list the course works against, so the TA
// view renders it directly with role attribution from the CSV `role` column.
// Read-only by construction: no edit, select, or invite affordances, and no
// owner-only API calls (it reuses useGetStudents' member-permission contents
// read).

const studentToMemberRow = (student: Student): MemberListRow => ({
  key: student.github_id || student.username || student.email,
  username: student.username,
  github_id: student.github_id,
  name:
    nameFromParts(student.first_name, student.last_name) ||
    student.username ||
    student.email,
  email: student.email,
})

const RoleBadge = ({ role }: { role: string }) => {
  const { t } = useTranslation()
  const known = knownRosterRole(role)
  if (!known) return null
  return (
    <Badge size="sm" tone={ROLE_BADGE_TONE[known]} ghost={known === "student"}>
      {t(ROLE_LABEL_KEY[known])}
    </Badge>
  )
}

const TaRosterView = ({
  org,
  classroom,
}: {
  org: string
  classroom: string
}) => {
  const { t } = useTranslation()
  const { students, isLoading, isError } = useGetStudents(org, classroom)

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return <Alert tone="error">{t("students.taRosterLoadError")}</Alert>
  }

  const grouped = groupStudentsBySection(students)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">
          {t("students.taRosterHeading")}
        </h1>
        <p className="text-sm text-base-content/60">
          {t("students.taRosterCaveat")}
        </p>
      </div>

      {students.length === 0 ? (
        <Card dashed shadow={false}>
          <CardBody className="text-center text-sm text-base-content/60">
            {t("students.taRosterEmpty")}
          </CardBody>
        </Card>
      ) : (
        grouped.map(({ section, students: sectionStudents }) => (
          <Card key={section}>
            <CardBody className="gap-3">
              <h2 className="text-sm font-semibold text-base-content/70">
                {section}
              </h2>
              <ul className="flex flex-col divide-y divide-base-200">
                {sectionStudents.map((student) => {
                  const row = studentToMemberRow(student)
                  return (
                    <li
                      key={row.key}
                      className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-base-200 text-xs font-medium"
                      >
                        {initialsFor(row)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{row.name}</span>
                        <GitHubIdentity row={row} />
                        {student.email ? (
                          <span className="truncate text-xs text-base-content/60">
                            {student.email}
                          </span>
                        ) : null}
                      </span>
                      <RoleBadge role={student.role} />
                    </li>
                  )
                })}
              </ul>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  )
}

export default TaRosterView
