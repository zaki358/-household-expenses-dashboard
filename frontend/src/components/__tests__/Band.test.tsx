import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Band } from '../Band'

describe('Band', () => {
  it('renders children', () => {
    render(<Band>Hello band</Band>)
    expect(screen.getByText('Hello band')).toBeInTheDocument()
  })

  it('defaults to the light variant', () => {
    render(<Band>Content</Band>)
    const section = screen.getByText('Content')
    expect(section).toHaveAttribute('data-variant', 'light')
    expect(section.className).toContain('bg-canvas-light')
  })

  it('applies the dark variant background and text classes', () => {
    render(<Band variant="dark">Content</Band>)
    const section = screen.getByText('Content')
    expect(section.className).toContain('bg-canvas-dark')
    expect(section.className).toContain('text-on-dark')
  })

  it('applies the blue variant background', () => {
    render(<Band variant="blue">Content</Band>)
    expect(screen.getByText('Content').className).toContain('bg-primary')
  })

  it('uses hero padding when hero prop is set', () => {
    render(<Band hero>Content</Band>)
    expect(screen.getByText('Content').className).toContain('py-section')
  })
})
