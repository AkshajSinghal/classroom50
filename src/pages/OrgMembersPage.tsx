import { useMemo, useState } from "react"
import { useParams } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Info, X } from "lucide-react"

import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import RequireTeacher from "@/components/RequireTeacher"
import Avatar from "@/components/avatar"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useToast } from "@/context/notifications/NotificationProvider"
import { useGitHubViewer } from "@/hooks/github/hooks"
import { githubKeys, invalidateInviteQueries } from "@/hooks/github/queries"
import useOrgMembersOverview from "@/hooks/useOrgMembersOverview"
import type { OrgMemberRow } from "@/util/orgMembers"
import { removeMemberFromOrg } from "@/pages/orgMembers/removeMemberFromOrg"

const ClassificationBadge = ({ row }: { row: OrgMemberRow }) => {
  if (row.classification === "on-roster-not-member") {
    return (
      <span className="badge badge-sm badge-warning badge-soft gap-1">
        <AlertTriangle className="size-3" /> Not an org member
      </span>
    )
  }
  if (row.classification === "member-no-roster") {
    return (
      <span className="badge badge-sm badge-ghost gap-1">
        <Info className="size-3" /> No classroom
      </span>
    )
  }
  return <span className="badge badge-sm badge-success badge-soft">Member</span>
}

const MemberDetail = ({
  org,
  row,
  isSelf,
  onClose,
  onRemoved,
}: {
  org: string
  row: OrgMemberRow
  isSelf: boolean
  onClose: () => void
  onRemoved: () => void
}) => {
  const client = useGitHubClient()
  const { notify } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const label = row.username || row.email

  const handleRemove = async () => {
    if (working) return
    setWorking(true)
    try {
      const result = await removeMemberFromOrg(client, { org, row })
      if (result.warnings.length > 0) {
        notify({
          tone: "warning",
          durationMs: 8000,
          message: result.warnings.join(" "),
        })
      } else {
        notify({
          tone: "success",
          durationMs: 6000,
          message: `${label} was removed from the ${org} organization${
            result.unenrolledClassrooms.length
              ? ` and unenrolled from ${result.unenrolledClassrooms.length} classroom${
                  result.unenrolledClassrooms.length === 1 ? "" : "s"
                }`
              : ""
          }.`,
        })
      }
      onRemoved()
    } catch (err) {
      notify({
        tone: "error",
        message: `Couldn't remove ${label}: ${
          err instanceof Error ? err.message : "something went wrong"
        }`,
      })
    } finally {
      setWorking(false)
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-base-100 shadow-xl">
        <div className="flex items-center justify-between border-b border-base-300 px-6 py-4">
          <h2 className="text-lg font-semibold">Member details</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <Avatar
            name={row.name || label}
            github={row.username}
            initials={(row.name || label || "?")[0]?.toUpperCase() ?? "?"}
            subtitle={row.username ? `@${row.username}` : row.email}
          />

          <div className="flex items-center gap-2">
            <ClassificationBadge row={row} />
            {row.email ? (
              <span className="text-sm text-base-content/60">{row.email}</span>
            ) : null}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Classroom access</h3>
            {row.classrooms.length === 0 ? (
              <p className="text-sm text-base-content/60">
                Not on any classroom roster.
              </p>
            ) : (
              <ul className="divide-y divide-base-300 rounded-box border border-base-300">
                {row.classrooms.map((access) => (
                  <li
                    key={access.classroom}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="font-medium">
                      {access.classroom}
                      {access.archived ? (
                        <span className="badge badge-xs badge-ghost ml-2">
                          archived
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2 text-base-content/60">
                      {access.section ? (
                        <span className="badge badge-xs badge-ghost">
                          {access.section}
                        </span>
                      ) : null}
                      {access.enrollment_status || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isSelf ? (
            <div className="rounded-box border border-base-300 bg-base-200/50 p-4 text-sm text-base-content/70">
              This is your signed-in account, so it can&apos;t be removed from
              the organization here.
            </div>
          ) : !row.isMember ? (
            <div className="rounded-box border border-base-300 bg-base-200/50 p-4 text-sm text-base-content/70">
              This student is on a roster but is not an organization member.
              Re-invite them from their classroom&apos;s Students page.
            </div>
          ) : confirming ? (
            <div className="rounded-box border border-error/30 bg-error/5 p-4 text-sm">
              <p className="text-base-content/80">
                {row.classrooms.length > 0 ? (
                  <>
                    {label} will first be unenrolled from{" "}
                    <span className="font-semibold">
                      {row.classrooms.length} classroom
                      {row.classrooms.length === 1 ? "" : "s"}
                    </span>{" "}
                    ({row.classrooms.map((c) => c.classroom).join(", ")}), then
                    removed from the{" "}
                    <span className="font-semibold">{org}</span> organization.
                    Their assignment repositories are not deleted.
                  </>
                ) : (
                  <>
                    {label} will be removed from the{" "}
                    <span className="font-semibold">{org}</span> organization.
                  </>
                )}
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={working}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-error btn-sm text-white"
                  disabled={working}
                  onClick={() => void handleRemove()}
                >
                  {working ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      Removing...
                    </>
                  ) : (
                    "Remove from organization"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-error btn-outline btn-sm self-start"
              onClick={() => setConfirming(true)}
            >
              Remove from organization
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const OrgMembersPage = () => {
  const { org } = useParams({ strict: false })
  const queryClient = useQueryClient()
  const { data: viewer } = useGitHubViewer()
  const { rows, isLoading, isError, notes } = useOrgMembersOverview(org)
  const [query, setQuery] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      [row.username, row.name, row.email].some((field) =>
        field.toLowerCase().includes(q),
      ),
    )
  }, [rows, query])

  const selected = rows.find((row) => row.key === selectedKey) ?? null
  const discrepancyCount = rows.filter(
    (row) => row.classification === "on-roster-not-member",
  ).length

  const isSelf = (row: OrgMemberRow) =>
    Boolean(viewer) &&
    (String(viewer?.id) === row.github_id ||
      viewer?.login?.toLowerCase() === row.username.toLowerCase())

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] xl:px-50">
          <RequireTeacher>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Members</h1>
              <p className="mt-1 text-sm text-base-content/60">
                Everyone in{" "}
                <span className="font-mono font-semibold">{org}</span> and the
                classrooms they belong to.
              </p>
            </div>

            {notes.length > 0 ? (
              <div className="alert alert-warning alert-soft mt-6 text-sm">
                <span>{notes.join(" ")}</span>
              </div>
            ) : null}

            {discrepancyCount > 0 ? (
              <div className="alert alert-warning alert-soft mt-6 text-sm">
                <AlertTriangle className="size-4" />
                <span>
                  {discrepancyCount} student
                  {discrepancyCount === 1 ? " is" : "s are"} on a roster but not
                  an organization member.
                </span>
              </div>
            ) : null}

            <div className="mt-6">
              <input
                type="search"
                className="input input-bordered w-full max-w-sm"
                placeholder="Search by name, username, or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="mt-4 card card-border w-full overflow-hidden bg-base-100 shadow-sm">
              {isLoading ? (
                <div className="flex items-center justify-center gap-3 px-6 py-12 text-base-content/50">
                  <span className="loading loading-spinner loading-md" />
                  <span className="text-sm">Loading members...</span>
                </div>
              ) : isError ? (
                <div className="px-6 py-10 text-center text-sm text-error">
                  Couldn&apos;t load organization members.
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-base-content/50">
                  No members match your search.
                </div>
              ) : (
                <ul className="divide-y divide-base-300">
                  {filtered.map((row) => (
                    <li key={row.key} className="px-6 py-4">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-4 text-left"
                        onClick={() => setSelectedKey(row.key)}
                      >
                        <div className="min-w-0 flex-1">
                          <Avatar
                            name={row.name || row.username || row.email}
                            github={row.username}
                            initials={
                              (row.name ||
                                row.username ||
                                row.email ||
                                "?")[0]?.toUpperCase() ?? "?"
                            }
                            subtitle={
                              row.username ? `@${row.username}` : row.email
                            }
                          />
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="hidden text-xs text-base-content/50 sm:inline">
                            {row.classrooms.length} classroom
                            {row.classrooms.length === 1 ? "" : "s"}
                          </span>
                          <ClassificationBadge row={row} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </RequireTeacher>
        </DrawerContent>
        <DrawerSidebar page="classes" selected="members" />
      </Drawer>

      {selected && org ? (
        <MemberDetail
          org={org}
          row={selected}
          isSelf={isSelf(selected)}
          onClose={() => setSelectedKey(null)}
          onRemoved={() => {
            setSelectedKey(null)
            queryClient.invalidateQueries({
              queryKey: githubKeys.orgMembers(org),
            })
            invalidateInviteQueries(queryClient, org)
          }}
        />
      ) : null}
    </div>
  )
}

export default OrgMembersPage
