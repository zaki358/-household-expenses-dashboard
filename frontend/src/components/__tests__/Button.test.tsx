import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '../Button'

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('defaults to the primary variant', () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('data-variant', 'primary')
    expect(button.className).toContain('bg-primary')
  })

  it('applies the secondary variant classes', () => {
    render(<Button variant="secondary">Learn more</Button>)
    const button = screen.getByRole('button', { name: 'Learn more' })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    expect(button.className).toContain('border-hairline-dark')
  })

  it('disables the button when variant is disabled', () => {
    render(<Button variant="disabled">Unavailable</Button>)
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled()
  })
})
