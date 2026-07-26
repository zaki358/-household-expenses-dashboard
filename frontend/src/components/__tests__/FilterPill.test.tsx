import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FilterPill } from '../FilterPill'

describe('FilterPill', () => {
  it('renders children text', () => {
    render(<FilterPill>All</FilterPill>)
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
  })

  it('defaults to transparent background with dark border', () => {
    render(<FilterPill>All</FilterPill>)
    const pill = screen.getByRole('button', { name: 'All' })
    expect(pill).toHaveAttribute('data-active', 'false')
    expect(pill.className).toContain('bg-transparent')
    expect(pill.className).toContain('border-hairline-dark')
  })

  it('flips to on-dark background when active', () => {
    render(<FilterPill active>Coming Soon</FilterPill>)
    const pill = screen.getByRole('button', { name: 'Coming Soon' })
    expect(pill).toHaveAttribute('data-active', 'true')
    expect(pill.className).toContain('bg-on-dark')
  })
})
