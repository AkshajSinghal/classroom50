// Authoring helpers for an assignment's `allowed_files` — an ordered,
// .gitignore-style allowlist of the files that belong to a submission
// (last match wins, `!` re-includes; empty means all files allowed).
//
// The GUI only authors the patterns; matching/enforcement lives server-side
// (the autograde runner and `gh student submit`, both via `git check-ignore`).
// In the form they're edited as a single textarea (one pattern per line), so
// these helpers convert between that text and the wire-shape `string[]`, and
// mirror the CLI's write-time validation (ValidateAllowedFiles) and the
// classroom50/assignments/v1 schema exactly so a bad value is caught here
// rather than by a rejected commit that could break assignments.json.

// The CLI rejects more than 100 patterns (AllowedFilesCap).
export const ALLOWED_FILES_CAP = 100

// Split textarea content into patterns: one per line, blank/whitespace-only
// lines dropped. Only the line separator is stripped (a trailing CR from a
// CRLF paste) — other whitespace is preserved verbatim, because the CLI and
// the v1 schema store a pattern as-is and .gitignore treats an unescaped
// trailing space as significant. Stripping it here would silently rewrite a
// CLI-authored pattern on an unrelated re-save. Order is preserved (matching
// is order-dependent: last match wins).
export function parseAllowedFiles(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim() !== "")
}

// Join stored patterns back into textarea content (one per line) for editing.
export function allowedFilesToText(patterns: string[] | undefined): string {
  return (patterns ?? []).join("\n")
}

// Validate the parsed patterns the way gh-teacher does. Returns an error
// message for the form, or undefined when valid. (Empty list is valid — it
// means "all files allowed".)
export function validateAllowedFiles(patterns: string[]): string | undefined {
  if (patterns.length > ALLOWED_FILES_CAP) {
    return `Too many patterns (${patterns.length}) — ${ALLOWED_FILES_CAP} max.`
  }
  for (const pattern of patterns) {
    if (pattern.trim() === "") {
      return "A pattern must not be empty."
    }
    // Newlines are the line separator, so they can't appear within a parsed
    // pattern; a NUL byte still could, and the CLI rejects it.
    if (pattern.includes("\u0000")) {
      return "A pattern must not contain a NUL character."
    }
  }
  return undefined
}
