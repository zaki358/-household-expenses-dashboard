import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionTitle } from '../SectionTitle'

describe('SectionTitle', () => {
  it('renders children text', () => {
    render(<SectionTitle level="display-xl">Dashboard</SectionTitle>)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders display-xl as an h1 at 54px weight 300', () => {
    render(<SectionTitle level="display-xl">Dashboard</SectionTitle>)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.className).toContain('text-[54px]')
    expect(heading.className).toContain('font-light')
  })

  it('renders heading-md as an h3 at weight 600 using the body font', () => {
    render(<SectionTitle level="heading-md">Card label</SectionTitle>)
    const heading = screen.getByRole('heading', { level: 3 })
    expect(heading.className).toContain('font-semibold')
    expect(heading.className).toContain('font-body')
  })

  it('defaults to heading-md', () => {
    render(<SectionTitle>Default</SectionTitle>)
    expect(screen.getByText('Default')).toHaveAttribute('data-level', 'heading-md')
  })
})
