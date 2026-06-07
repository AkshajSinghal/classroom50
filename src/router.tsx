import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import type { GitHubUser } from "./hooks/github/types"

export const router = createRouter({
  routeTree,
  context: {
    auth: {
      user: undefined!,
      status: "loading",
    },
  } as {
    auth: {
      user: GitHubUser
      status: string
    }
  },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export default router
