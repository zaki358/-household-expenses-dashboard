import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TextInput } from '../TextInput'

describe('TextInput', () => {
  it('renders a label associated with the input', () => {
    render(<TextInput label="Amount" name="amount" />)
    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
  })

  it('applies the 4px radius and dark hairline border classes', () => {
    render(<TextInput label="Amount" name="amount" />)
    const input = screen.getByLabelText('Amount')
    expect(input.className).toContain('rounded-sm')
    expect(input.className).toContain('border-hairline-dark')
  })

  it('applies the focus primary-border classes', () => {
    render(<TextInput label="Amount" name="amount" />)
    const input = screen.getByLabelText('Amount')
    expect(input.className).toContain('focus:border-primary')
  })

  it('renders without a label when none is provided', () => {
    render(<TextInput name="amount" placeholder="0" />)
    expect(screen.getByPlaceholderText('0')).toBeInTheDocument()
  })
})
