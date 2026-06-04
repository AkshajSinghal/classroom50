import {
  AlertTriangle,
  CheckCircle2,
  GraduationCap,
  UserRound,
} from "lucide-react"

import GitHub from "@/assets/github.svg?react"
import GitHubWhite from "@/assets/github_white.svg?react"
import type { GitHubUser } from "@/hooks/github/types"
import { useParams } from "@tanstack/react-router"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useGithubAuth } from "@/auth/useGithubAuth"
import { useMutation } from "@tanstack/react-query"
import { acceptAssignment } from "@/hooks/github/mutations"

const initialsFor = (user: GitHubUser | null) => {
  const source = user?.name || user?.login || "?"
  return source
    .split(/\s|-/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

const titleForSlug = (slug: string) =>
  slug
    .split("-")
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ")

const AcceptAssignmentPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const client = useGitHubClient()

  const { user } = useGithubAuth()
  const username = user?.login

  const expectedRepoName = username
    ? `${classroom}-${assignment}-${username}`.toLowerCase()
    : `${classroom}-${assignment}-{your-github-username}`.toLowerCase()

  const acceptMutation = useMutation({
    mutationFn: () =>
      acceptAssignment({
        client,
        org,
        classroom,
        assignmentSlug: assignment,
      }),
  })

  const isBusy = acceptMutation.isPending
  const displayName = user?.name || user?.login || "GitHub user"

  return (
    <div className="min-h-screen bg-base-100">
      <div className="navbar bg-base-100 shadow-sm">
        <div className="flex p-6 text-lg font-bold">
          <GraduationCap className="size-8 text-[#accefb] mr-2" /> Classroom 50
        </div>
      </div>
      <div className="card w-200 max-w-[calc(100vw-2em)] p-8 m-auto rounded-xl mt-10 border border-[#eee]">
        <div className="card-body gap-4">
          <span className="badge badge-primary badge-soft">
            <UserRound className="size-4" />
            Individual Assignment
          </span>
          <h1 className="text-xl font-bold pt-6">{titleForSlug(assignment)}</h1>
          <h2 className="text-lg">
            Accept this assignment to get your own copy of the starter code
            repository.
          </h2>

          <div className="divider" />

          <label className="label text-lg">Signed in as</label>

          <div className="flex flex-col gap-8">
            <div className="flex gap-4 bg-[#fafafa] p-4 rounded-xl border border-[#ddd]">
              <div className="avatar avatar-placeholder">
                {user?.avatar_url ? (
                  <div className="w-12 rounded-full">
                    <img
                      src={user.avatar_url}
                      alt={`${displayName}'s GitHub avatar`}
                    />
                  </div>
                ) : (
                  <div className="bg-base-200 text-black rounded-full w-12">
                    <span>{initialsFor(user)}</span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-medium text-base-content">
                  {displayName}
                </div>

                <div className="flex items-center gap-1 text-sm text-base-content/60">
                  <GitHub className="size-4" />
                  <span>{username ?? "Checking GitHub user..."}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-col bg-[#fafafa] p-4 rounded-xl border border-[#ddd]">
              <label className="label text-lg">
                Repository will be created as:
              </label>

              <div className="flex gap-4 min-w-0">
                <GitHub className="size-6 shrink-0" />
                <pre className="text-lg overflow-x-auto">
                  {org}/{expectedRepoName}
                </pre>
              </div>
            </div>

            {acceptMutation.isError && (
              <div className="alert alert-error items-start">
                <AlertTriangle className="size-5 shrink-0" />
                <div>
                  <div className="font-bold">Could not accept assignment</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm">
                    {acceptMutation.error instanceof Error
                      ? acceptMutation.error.message
                      : "Something went wrong while accepting the assignment."}
                  </div>
                </div>
              </div>
            )}

            {acceptMutation.data && (
              <div className="alert alert-success items-start p-8">
                <CheckCircle2 className="size-5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold">
                    {acceptMutation.data.status === "already-accepted"
                      ? "Assignment already accepted"
                      : "Assignment accepted"}
                  </div>

                  <div className="mt-1">
                    Repository:{" "}
                    <a
                      className="link font-mono"
                      href={acceptMutation.data.repo.html_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {acceptMutation.data.repo.full_name}
                    </a>
                  </div>

                  <div className="mt-4 max-w-full overflow-hidden rounded-lg bg-black text-sm text-white">
                    <div className="flex gap-2 px-6 pt-6">
                      <span className="block h-3 w-3 rounded-full bg-white/40" />
                      <span className="block h-3 w-3 rounded-full bg-white/40" />
                      <span className="block h-3 w-3 rounded-full bg-white/40" />
                    </div>

                    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-6 py-6 font-mono text-base">
                      <span className="select-none text-white/50">$</span>

                      <code className="min-w-0 whitespace-pre-wrap break-all leading-relaxed">
                        {acceptMutation.data.cloneCommand}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!acceptMutation.data && (
              <button
                type="button"
                className="btn btn-primary w-full text-xl p-8"
                disabled={isBusy || !username}
                onClick={() => acceptMutation.mutate()}
              >
                {acceptMutation.isPending ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Creating repository...
                  </>
                ) : (
                  <>
                    <GitHubWhite className="size-6" />
                    Accept Assignment & Create Repository
                  </>
                )}
              </button>
            )}

            {acceptMutation.data && (
              <a
                className="btn btn-primary w-full text-xl p-8"
                href={acceptMutation.data.repo.html_url}
                target="_blank"
                rel="noreferrer"
              >
                <GitHubWhite className="size-6" />
                Open Repository
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AcceptAssignmentPage
