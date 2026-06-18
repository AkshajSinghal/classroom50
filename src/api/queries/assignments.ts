import type { GitHubClient } from "@/hooks/github/client"
import type { Assignment } from "@/types/classroom"
import { decodeBase64Utf8 } from "@/util/github"

export type GetAssignmentsFileInput = {
  org: string
  path: string
  ref: string
}
export type AssignmentsFile = {
  schema: "classroom50/assignments/v1"
  assignments: Assignment[]
}
export async function getAssignmentsFile(
  client: GitHubClient,
  input: GetAssignmentsFileInput,
): Promise<AssignmentsFile> {
  const { org, path, ref } = input

  const file = await client.request<{
    type: "file"
    encoding: "base64"
    content: string
  }>(
    `/repos/${org}/classroom50/contents/${path}?ref=${encodeURIComponent(ref)}`,
  )

  if (file.type !== "file") {
    throw new Error(`${path} is not a file`)
  }

  const json = decodeBase64Utf8(file.content)

  return JSON.parse(json) as AssignmentsFile
}

export async function getAssignmentsJson(
  client: GitHubClient,
  input: {
    org: string
    classroom: string
    ref?: string
  },
) {}
