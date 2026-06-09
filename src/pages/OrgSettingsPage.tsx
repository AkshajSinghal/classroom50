import { useState } from "react"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useParams } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { putRepoSecret } from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"

const OrgSettingsPage = () => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const { org } = useParams({ strict: false })
  const [collectToken, setCollectToken] = useState("")
  const [patSaved, setPatSaved] = useState(false)

  const patMutation = useMutation({
    mutationFn: () => {
      return putRepoSecret(
        client,
        org,
        "classroom50",
        "CLASSROOM50_COLLECT_TOKEN",
        collectToken,
      )
    },
    onSuccess: () => {
      setCollectToken("")
      setPatSaved(true)
      queryClient.invalidateQueries({ queryKey: ["orgs"] })
    },
  })

  const collectTokenUrl =
    "https://github.com/settings/personal-access-tokens/new?" +
    new URLSearchParams({
      name: `classroom50 collect token`,
      description: `Read-only token for classroom50 collection from ${org} repos`,
      target_name: org ?? "",
      expires_in: "90",
      contents: "read",
    }).toString()

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] xl:px-50">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Org Settings</h1>
            <p className="mt-2 max-w-2xl text-sm text-base-content/60">
              Adjust the settings for your org, including setting up a PAT
              (Personal Access Token).
            </p>
          </div>
          <div className="divider" />
          <div className="mt-8">
            <h2 className="text-xl font-bold">Personal Access Token (PAT)</h2>
            <p className="mt-2 text-sm text-base-content/60">
              Assign a Personal Access Token (PAT) to your Classroom 50 org to
              allow for the collection of scores.
            </p>
            <p className="text-sm text-base-content/60">
              Visit{" "}
              <a
                className="link link-info"
                href={collectTokenUrl}
                target="_blank"
                rel="noreferrer"
              >
                this URL
              </a>{" "}
              to set up your token on GitHub.
            </p>
            <div className="alert mt-4 max-w-2xl">
              NOTE: It is highly advised to NOT use your personal Teacher
              account to set up your Personal Access Token. Consider using a
              specially designated service account for this purpose.
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!patMutation.isPending) patMutation.mutate()
              }}
            >
              <div className="flex flex-col gap-2 max-w-2xl">
                <input
                  type="password"
                  className="input input-bordered w-full max-w-2xl mt-4"
                  autoComplete="off"
                  value={collectToken}
                  onChange={(e) => setCollectToken(e.target.value)}
                />
                <label className="label cursor-pointer justify-start gap-3 max-w-xl mt-2">
                  <input type="checkbox" className="checkbox" />
                  <span className="label-text max-w-xl">
                    I confirm this token belongs to an org-owned service
                    account, not a personal
                    <br /> teacher account.
                  </span>
                </label>
                <button
                  disabled={patMutation.isPending}
                  type="submit"
                  className="btn btn-primary w-40 self-end"
                >
                  {patMutation.isPending ? (
                    <span className="loading loading-spinner" />
                  ) : (
                    "Save PAT"
                  )}
                </button>
                {patSaved && (
                  <div className="alert alert-success mt-4">
                    Your Personal Access Token has been successfully saved.
                  </div>
                )}
              </div>
            </form>
          </div>
        </DrawerContent>
        <DrawerSidebar page="orgs" selected="settings" />
      </Drawer>
    </div>
  )
}

export default OrgSettingsPage
