// Centered full-height spinner shown while the viewer's course role is still
// resolving. Shared by the role-gated surfaces (RequireTeacher, the assignment
// index redirect, and the SubmissionsPage self-guard) so they present one
// consistent pending state instead of three near-identical inline copies.
const RoleResolvingFallback = ({
  className = "min-h-[60vh]",
}: {
  className?: string
}) => (
  <div className={`flex items-center justify-center ${className}`}>
    <span className="loading loading-spinner loading-lg" />
  </div>
)

export default RoleResolvingFallback
