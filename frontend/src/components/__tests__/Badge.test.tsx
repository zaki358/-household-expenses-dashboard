import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '../Badge'

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>New</Badge>)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('applies the primary blue pill background', () => {
    render(<Badge>New</Badge>)
    const badge = screen.getByText('New')
    expect(badge.className).toContain('bg-primary')
    expect(badge.className).toContain('rounded-full')
  })
})
