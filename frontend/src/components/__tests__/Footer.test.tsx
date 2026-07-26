import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Footer } from '../Footer'

describe('Footer', () => {
  it('renders the wordmark, link grid children, and fineprint', () => {
    render(
      <Footer wordmark="PlayStation" fineprint="© 2026">
        <span>Support</span>
      </Footer>,
    )
    expect(screen.getByTestId('footer-wordmark')).toHaveTextContent('PlayStation')
    expect(screen.getByTestId('footer-links')).toHaveTextContent('Support')
    expect(screen.getByTestId('footer-fineprint')).toHaveTextContent('© 2026')
  })

  it('uses the dark elevated surface background', () => {
    render(<Footer wordmark="Brand" />)
    const footer = screen.getByRole('contentinfo')
    expect(footer.className).toContain('bg-surface-dark-elevated')
  })
})
