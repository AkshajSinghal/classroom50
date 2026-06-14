import GitHub from "@/assets/github.svg?react"

const Avatar = ({
  initials,
  name,
  github,
}: {
  initials: string
  name: string
  github: string
}) => {
  return (
    <div className="flex gap-3">
      <div className="avatar avatar-placeholder">
        <div className="bg-base-200 text-primary rounded-full w-12">
          <span>{initials || github.at(0)?.toUpperCase()}</span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-medium text-base-content">{name || github}</div>

        <div className="flex items-center gap-1 text-sm text-base-content/60">
          <GitHub className="size-4" />
          <pre>{github}</pre>
        </div>
      </div>
    </div>
  )
}

export default Avatar
