// Map over items running at most `limit` async tasks at once, preserving input
// order in the results. A bounded pool keeps GitHub's per-repo reads (onboarding
// YAML fetches, commit-author lookups) from fanning out into hundreds of
// simultaneous requests — which trip secondary rate limits — while still being
// far faster than a strictly sequential loop. Rejections propagate (the first
// rejection rejects the returned promise), matching Promise.all semantics.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const effectiveLimit = Math.max(1, Math.min(limit, items.length))
  const results = new Array<R>(items.length)
  let nextIndex = 0

  const worker = async (): Promise<void> => {
    while (true) {
      const current = nextIndex++
      if (current >= items.length) return
      results[current] = await task(items[current], current)
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()))
  return results
}
