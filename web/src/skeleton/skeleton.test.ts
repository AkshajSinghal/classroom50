import { describe, it, expect } from "vitest"

import {
  SKELETON_PATHS,
  buildSkeletonFiles,
  bundledSkeletonPaths,
  DEFAULT_BRANCH_PLACEHOLDER,
} from "./skeleton"

// Guards the bundled skeleton against drift from the CLI tree at
// cli/gh-teacher/skeleton/dotgithub.
describe("bundled skeleton", () => {
  it("bundles every path the GUI deploys", () => {
    const bundled = new Set(bundledSkeletonPaths())
    for (const rel of SKELETON_PATHS) {
      expect(bundled.has(rel), `missing bundled skeleton file: ${rel}`).toBe(
        true,
      )
    }
  })

  it("builds target-repo files under .github/ with non-empty content", () => {
    const files = buildSkeletonFiles("main")
    expect(files.length).toBe(SKELETON_PATHS.length)
    for (const file of files) {
      expect(file.path.startsWith(".github/")).toBe(true)
      expect(file.type).toBe("blob")
      expect(file.mode).toBe("100644")
      expect(file.content.length).toBeGreaterThan(0)
    }
  })

  it("substitutes the default-branch placeholder", () => {
    const files = buildSkeletonFiles("trunk")
    const publish = files.find(
      (f) => f.path === ".github/workflows/publish-pages.yaml",
    )
    expect(publish).toBeDefined()
    // Placeholder gone; the push trigger pins the resolved branch.
    expect(publish!.content).not.toContain(DEFAULT_BRANCH_PLACEHOLDER)
    expect(publish!.content).toContain("trunk")
  })

  it("bundles the regrade workflow + script the GUI dispatches", () => {
    const bundled = new Set(bundledSkeletonPaths())
    expect(bundled.has("workflows/regrade.yaml")).toBe(true)
    expect(bundled.has("scripts/regrade_repos.py")).toBe(true)
  })
})
