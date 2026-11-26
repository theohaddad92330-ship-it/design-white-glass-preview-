import { missionsOfAccount, propagated } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { index } = vi.hoisted(() => ({ index: vi.fn() }))
vi.mock('@/features/propagation/hooks', () => ({ useContactSignedMissionsIndex: () => index() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a href="/missions" {...rest}>
      {children}
    </a>
  ),
}))

const { ContactSignedMissionsBadge } = await import('./ContactSignedMissionsBadge')

const CONTACT = '33333333-3333-4333-8333-333333333333'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'

function signed(count: number) {
  return new Map([
    [
      CONTACT,
      propagated({ contactId: CONTACT, accountId: ACCOUNT, signedMissions: count }, missionsOfAccount(ACCOUNT)),
    ],
  ])
}

beforeEach(() => index.mockReset().mockReturnValue(new Map()))
afterEach(cleanup)

describe('« ce contact a signé N missions »', () => {
  it('dit le compte et mène aux missions du compte (§4.4)', () => {
    index.mockReturnValue(signed(2))
    render(<ContactSignedMissionsBadge contactId={CONTACT} />)
    expect(screen.getByRole('link').textContent).toContain('A signé 2 missions')
  })

  it('accorde le singulier — « a signé 1 mission »', () => {
    index.mockReturnValue(signed(1))
    render(<ContactSignedMissionsBadge contactId={CONTACT} />)
    expect(screen.getByRole('link').textContent).toContain('A signé 1 mission')
  })
})

describe('aucun badge à zéro — l’absence de badge EST l’information', () => {
  it('un contact qui n’a rien signé n’a AUCUN badge', () => {
    // Le serveur ne rend aucune ligne dans ce cas, et `signedMissions` est un
    // `positive()` : zéro n'existe pas sur le fil. « A signé 0 mission » serait
    // une MESURE là où il n'y a que l'absence de mesure — et une étiquette
    // d'échec sur un prospect parfaitement normal.
    const { container } = render(<ContactSignedMissionsBadge contactId={CONTACT} />)
    expect(container.textContent).toBe('')
    expect(container.querySelector('a')).toBeNull()
  })

  it('ne se trompe pas de contact — l’index est lu par CLÉ, jamais par rang', () => {
    // Une jointure par position ferait porter les signatures d'un contact par
    // un autre : c'est le défaut qui a déjà produit « Free 119 € » ici.
    index.mockReturnValue(signed(2))
    const { container } = render(<ContactSignedMissionsBadge contactId="44444444-4444-4444-8444-444444444444" />)
    expect(container.textContent).toBe('')
  })
})

describe('le badge ne s’édite pas', () => {
  it('ne rend ni champ ni bouton — le compte se corrige dans les missions', () => {
    index.mockReturnValue(signed(3))
    const { container } = render(<ContactSignedMissionsBadge contactId={CONTACT} />)
    expect(container.querySelectorAll('input, textarea, select, button')).toHaveLength(0)
  })
})
