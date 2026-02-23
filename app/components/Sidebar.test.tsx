import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Sidebar from './Sidebar'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: (props: any) => <a href={props.href}>{props.children}</a>,
}))

vi.mock('next/image', () => ({
  default: (props: any) => <img src={props.src} alt={props.alt} />,
}))

const completeSession = {
  user: {
    id: 'user-1',
    name: 'Test User',
    role: 'USER',
    expectationsVersion: 1,
    iracingCustomerId: 12345,
  },
  expires: '2027-01-01T00:00:00Z',
}

function setup() {
  vi.mocked(usePathname).mockReturnValue('/events')
  vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update: vi.fn() })
}

describe('Sidebar User Guide link', () => {
  it('shows User Guide link when userGuideUrl is provided', () => {
    setup()
    render(
      <Sidebar
        session={completeSession as any}
        userGuideUrl="https://www.youtube.com/watch?v=example"
      />
    )
    const link = screen.getByRole('link', { name: 'User Guide' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=example')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('does not show User Guide link when userGuideUrl is not provided', () => {
    setup()
    render(<Sidebar session={completeSession as any} />)
    expect(screen.queryByRole('link', { name: 'User Guide' })).not.toBeInTheDocument()
  })

  it('User Guide link appears after Team Expectations and before Changelog', () => {
    setup()
    render(
      <Sidebar
        session={completeSession as any}
        userGuideUrl="https://www.youtube.com/watch?v=example"
      />
    )
    const links = screen.getAllByRole('link').map((el) => el.textContent)
    const expectationsIdx = links.indexOf('Team Expectations')
    const userGuideIdx = links.indexOf('User Guide')
    const changelogIdx = links.indexOf('Changelog')
    expect(expectationsIdx).toBeGreaterThanOrEqual(0)
    expect(userGuideIdx).toBeGreaterThan(expectationsIdx)
    expect(changelogIdx).toBeGreaterThan(userGuideIdx)
  })
})
