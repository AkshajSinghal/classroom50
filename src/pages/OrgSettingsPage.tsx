import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useParams } from "@tanstack/react-router"

const OrgSettingsPage = () => {
  const { org } = useParams({ strict: false })
  const collectTokenUrl =
    "https://github.com/settings/personal-access-tokens/new?" +
    new URLSearchParams({
      name: `classroom50 collect token`,
      description: `Read-only token for classroom50 collection from org repos`,
      target_name: org,
      expires_in: "90",
      contents: "read",
    }).toString()

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
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
          </div>
        </DrawerContent>
        <DrawerSidebar page="orgs" selected="settings" />
      </Drawer>
    </div>
  )
}

export default OrgSettingsPage
