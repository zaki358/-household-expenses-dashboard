import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MonthSelector } from '../MonthSelector'

describe('MonthSelector', () => {
  it('renders a pill per month and marks the selected one active', () => {
    render(<MonthSelector months={['2026-01', '2026-02']} selected="2026-02" onSelect={vi.fn()} />)

    const selected = screen.getByText('2026-02')
    const unselected = screen.getByText('2026-01')
    expect(selected.closest('button')).toHaveAttribute('data-active', 'true')
    expect(unselected.closest('button')).toHaveAttribute('data-active', 'false')
  })

  it('calls onSelect with the clicked month', () => {
    const onSelect = vi.fn()
    render(<MonthSelector months={['2026-01', '2026-02']} selected="2026-02" onSelect={onSelect} />)

    fireEvent.click(screen.getByText('2026-01'))

    expect(onSelect).toHaveBeenCalledWith('2026-01')
  })
})
