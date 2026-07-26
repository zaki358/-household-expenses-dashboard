import { useEffect, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '読み込みに失敗しました'
}

/**
 * Minimal fetch-on-mount/deps-change hook used by the Dashboard and Charts
 * tabs. Re-fetches whenever `deps` changes (e.g. the selected month) and
 * ignores stale responses if a newer request started before the previous
 * one resolved.
 */
export function useApiResource<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ data: null, loading: true, error: null })

    fetcher()
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: errorMessage(error) })
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
