import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useApiResource } from './useApiResource'

describe('useApiResource', () => {
  it('starts loading and resolves with data', async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 42 })
    const { result } = renderHook(() => useApiResource(fetcher, []))

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toEqual({ value: 42 })
    expect(result.current.error).toBeNull()
  })

  it('captures an error message on rejection', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useApiResource(fetcher, []))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('boom')
  })

  it('re-fetches when deps change', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok')
    const { rerender } = renderHook(({ dep }) => useApiResource(fetcher, [dep]), {
      initialProps: { dep: 'a' },
    })

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    act(() => {
      rerender({ dep: 'b' })
    })

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  })
})
