import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const navigateSpy = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))

const { AccountRelaunchBriefFlag } = await import('./AccountRelaunchBriefFlag')

const ACCOUNT = '22222222-2222-4222-8222-222222222222'

afterEach(() => {
  cleanup()
  navigateSpy.mockClear()
})

describe('le geste « relancer la prise de brief » — nulle part ailleurs qu’à sa condition', () => {
  it('ne rend RIEN quand la condition ne porte pas le geste', () => {
    const { container } = render(
      <AccountRelaunchBriefFlag accountId={ACCOUNT} companyName="Cegeform" shouldRelaunch={false} />,
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText(/prise de brief/i)).toBeNull()
  })

  it('rend le geste, cliquable, quand la condition porte', () => {
    render(<AccountRelaunchBriefFlag accountId={ACCOUNT} companyName="Cegeform" shouldRelaunch={true} />)
    expect(screen.getByText(/prise de brief/i)).toBeTruthy()
  })

  it('un bouton — ce qui se clique se tabule (GA-35), jamais un <div onClick>', () => {
    render(<AccountRelaunchBriefFlag accountId={ACCOUNT} companyName="Cegeform" shouldRelaunch={true} />)
    const button = screen.getByRole('button', { name: /prise de brief/i })
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
  })

  it('le clic navigue vers le dossier du compte, onglet Projets, et arrête la propagation', () => {
    render(<AccountRelaunchBriefFlag accountId={ACCOUNT} companyName="Cegeform" shouldRelaunch={true} />)
    const button = screen.getByRole('button', { name: /prise de brief/i })
    button.click()
    expect(navigateSpy).toHaveBeenCalledWith({
      to: '/accounts/$id',
      params: { id: ACCOUNT },
      search: { tab: 'projects' },
    })
  })
})
