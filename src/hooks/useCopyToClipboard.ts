import { useEffect, useRef, useState } from "react"

// Copies text to the clipboard and flips a `copied` flag that auto-resets after
// `resetMs`. Clears a pending reset before re-arming, cleans up on unmount, and
// leaves `copied` false if the clipboard write rejects (e.g. a non-secure
// context). Returns the flag plus a copy callback to wire to a button.
export function useCopyToClipboard(text: string, resetMs = 2000) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    },
    [],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      resetTimerRef.current = setTimeout(() => setCopied(false), resetMs)
    } catch {
      setCopied(false)
    }
  }

  return { copied, copy }
}
