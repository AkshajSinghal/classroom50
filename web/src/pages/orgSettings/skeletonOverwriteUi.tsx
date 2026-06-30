import { useCallback, useEffect, useRef, useState } from "react"

import { ConfirmModal } from "@/components/modals"
import {
  makeConfirmSkeletonOverwrite,
  settleOverwrite,
} from "./overwriteConfirm"

// Wires the skeleton-overwrite confirmation into a React surface: owns the
// modal-open state, the resolver ref, and the unmount cleanup that settles a
// parked run rather than letting it hang. Shared by the wizard (OrgSetupPage)
// and the re-run surface (RerunOnboarding) so the two can't drift. Pass the
// returned `confirmSkeletonOverwrite` to initClassroom50 and render
// <SkeletonOverwriteModal> with `overwritePaths`/`resolveOverwrite`.
export function useSkeletonOverwriteConfirm() {
  const [overwritePaths, setOverwritePaths] = useState<string[] | null>(null)
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      settleOverwrite(resolveRef, false)
    }
  }, [])

  const resolveOverwrite = (ok: boolean) => {
    settleOverwrite(resolveRef, ok)
    setOverwritePaths(null)
  }

  // Built lazily (useCallback) so the resolver ref is only touched when the hook
  // is actually invoked mid-run, not during render.
  const confirmSkeletonOverwrite = useCallback(
    (paths: string[]) =>
      makeConfirmSkeletonOverwrite(
        resolveRef,
        setOverwritePaths,
        () => mountedRef.current,
      )(paths),
    [],
  )

  return {
    overwritePaths,
    resolveOverwrite,
    confirmSkeletonOverwrite,
    mountedRef,
  }
}

// The "are you sure" prompt before overwriting drifted skeleton files. Open when
// `paths` is non-null; the bundled copy explains that overwriting resets local
// customizations (matching the CLI's stance that these files are user-editable).
export function SkeletonOverwriteModal({
  paths,
  onConfirm,
  onClose,
}: {
  paths: string[] | null
  onConfirm: () => void
  onClose: () => void
}) {
  const count = paths?.length ?? 0
  return (
    <ConfirmModal
      open={paths !== null}
      dangerous={false}
      needsConfirm={false}
      title="Update workflow files to the latest version?"
      confirmLabel="Overwrite"
      cancelLabel="Keep mine"
      description={
        <>
          <p>
            {count === 1
              ? "1 Classroom 50 workflow/script file in your config repo differs from the latest bundled version and will be overwritten:"
              : `${count} Classroom 50 workflow/script files in your config repo differ from the latest bundled version and will be overwritten:`}
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 font-mono text-xs">
            {paths?.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-3">
            If you customized any of these files, overwriting resets your
            changes to the bundled version — choose <strong>Keep mine</strong>{" "}
            to leave them untouched and continue with everything else.
          </p>
        </>
      }
      onConfirm={() => {
        onConfirm()
        return Promise.resolve()
      }}
      onClose={onClose}
    />
  )
}
