import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectedClientTool } from '@bellum/contracts'
import { ComposerToolChips } from './ComposerToolChips'

const demo = vi.hoisted(() => ({ current: false }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.current }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const gmail: ConnectedClientTool = { provider: 'gmail', family: 'email', name: 'Gmail' }
const hubspot: ConnectedClientTool = { provider: 'hubspot', family: 'crm', name: 'HubSpot', needsReconnect: true }

beforeEach(() => {
  demo.current = false
})

/**
 * #5048 — « Tes outils avec Laura » : des puces au-dessus du composeur (revient sur #3708,
 * Louis 31/10/2026). Elles écrivent dans la MÊME sélection que l'ancien menu (`toolSourcesStore`),
 * seul geste de sélection depuis l'arbitrage du 31/10 (GA-26).
 */
describe('ComposerToolChips — #5048', () => {
  it('ne rend rien quand rien n’est branché (hors démonstration)', () => {
    const { container } = render(<ComposerToolChips tools={[]} excludedProviders={[]} onToggle={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('une puce par outil branché : nom, état, et « + » vers /integrations', () => {
    render(<ComposerToolChips tools={[gmail, hubspot]} excludedProviders={[]} onToggle={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Tes outils avec Laura' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gmail/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: 'Ajouter un outil' })).toHaveAttribute('href', '/integrations')
  })

  it('appuyer sur une puce bascule l’outil pour la conversation, sans déconnecter', () => {
    const onToggle = vi.fn()
    render(<ComposerToolChips tools={[gmail]} excludedProviders={[]} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /Gmail/ }))
    expect(onToggle).toHaveBeenCalledExactlyOnceWith('gmail')
  })

  it('un outil exclu n’est plus pressé', () => {
    render(<ComposerToolChips tools={[gmail]} excludedProviders={['gmail']} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Gmail/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('« à reconnecter » mène à /integrations et ne bascule rien dans la conversation', () => {
    const onToggle = vi.fn()
    render(<ComposerToolChips tools={[hubspot]} excludedProviders={[]} onToggle={onToggle} />)
    const reconnect = screen.getByRole('link', { name: /HubSpot.*à reconnecter/i })
    expect(reconnect).toHaveAttribute('href', '/integrations')
    fireEvent.click(reconnect)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('désactivées sans fil créé : un clic ne ferait rien', () => {
    render(<ComposerToolChips tools={[gmail]} excludedProviders={[]} onToggle={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: /Gmail/ })).toBeDisabled()
  })
})
