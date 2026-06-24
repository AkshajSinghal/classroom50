// Marks a template-generate failure at accept time so the accept page can
// recognize it. Messages point students at their instructor, since they can't
// change template org settings themselves.
export class TemplateAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TemplateAccessError"
  }
}

// Out-of-org template: the owning org likely restricts third-party apps.
export function outOfOrgTemplateError(
  templateOwner: string,
  templateRepo: string,
  status: number,
): TemplateAccessError {
  return new TemplateAccessError(
    `Couldn't copy the template ${templateOwner}/${templateRepo} (HTTP ${status}). The ${templateOwner} organization restricts third-party apps. Ask your instructor to approve the Classroom 50 app for ${templateOwner} (or make the template public), then accept again.`,
  )
}

// In-org template: the classroom team likely lacks read on a private template.
export function inOrgTemplateError(
  templateOwner: string,
  templateRepo: string,
  status: number,
): TemplateAccessError {
  return new TemplateAccessError(
    `Couldn't copy the private template ${templateOwner}/${templateRepo} (HTTP ${status}). Ask your instructor to re-run assignment setup, then accept again.`,
  )
}
