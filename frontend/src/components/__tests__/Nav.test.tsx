import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Nav } from '../Nav'

describe('Nav', () => {
  it('renders the logo, nav items, and right cluster slots', () => {
    render(
      <Nav
        logo={<span>家計簿</span>}
        navItems={<span>Dashboard</span>}
        rightCluster={<span>Account</span>}
      />,
    )
    expect(screen.getByTestId('nav-logo')).toHaveTextContent('家計簿')
    expect(screen.getByTestId('nav-items')).toHaveTextContent('Dashboard')
    expect(screen.getByTestId('nav-right-cluster')).toHaveTextContent('Account')
  })

  it('renders with a black background as the primary-nav chrome', () => {
    render(<Nav logo={<span>Logo</span>} />)
    const nav = screen.getByRole('navigation')
    expect(nav.className).toContain('bg-canvas-dark')
  })
})
