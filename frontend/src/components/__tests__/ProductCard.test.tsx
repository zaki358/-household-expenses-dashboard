import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductCard } from '../ProductCard'

describe('ProductCard', () => {
  it('renders children', () => {
    render(<ProductCard>Card content</ProductCard>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('defaults to the light variant with 8px radius', () => {
    render(<ProductCard>Card content</ProductCard>)
    const card = screen.getByText('Card content')
    expect(card).toHaveAttribute('data-variant', 'light')
    expect(card.className).toContain('rounded-md')
    expect(card.className).toContain('bg-surface-card')
  })

  it('applies dark variant classes', () => {
    render(<ProductCard variant="dark">Card content</ProductCard>)
    expect(screen.getByText('Card content').className).toContain('bg-surface-dark-card')
  })

  it('has no shadow by default and a soft shadow when active', () => {
    render(<ProductCard>Card content</ProductCard>)
    expect(screen.getByText('Card content').className).toContain('shadow-none')

    render(<ProductCard active>Active card</ProductCard>)
    expect(screen.getByText('Active card').className).toContain('shadow-[0_4px_12px_rgba(0,0,0,0.16)]')
  })
})
