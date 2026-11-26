import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluatePilotageChain, type PilotageInputs } from '@bellum/contracts'
import { i18n } from '@/i18n'
// ⚠️ Le routeur monte son arbre de façon ASYNCHRONE : un `container.textContent`
// lu juste après `renderWithRouter` est vide quoi qu'il arrive. Les cas qui ne
// rendent RIEN (donc aucun `<Link>`) se montent sans routeur, et le premier
// test — qui, lui, rend le lien — est leur témoin : il PROUVE que ce harnais
// sait afficher quelque chose.
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #2108.21 → .25 / #2108.107 / #2208.29 — TROIS CHIFFRES ET UN LIEN.
 *
 * La page d'arrivée ne porte pas de second cockpit : ce qu'elle montre du
 * pilotage est une ACCROCHE, et elle ne montre RIEN tant que la chaîne n'a pas
 * été lue — trois zéros diraient « aucune alerte ».
 */
const useQuery = vi.fn()
const planFeature = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return { ...actual, useQuery: (...args: unknown[]) => useQuery(...args) }
})
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: (...args: unknown[]) => planFeature(...args),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' }, loading: false }) }))

import { PilotageAccroche } from './PilotageAccroche'

const INPUTS: PilotageInputs = {
  contactsTargeted: 40,
  signals: 12,
  profilesPushed: 3,
  emailsSent: 20,
  replied: 6,
  meetings: 3,
  needsQualified: 4,
  needsTriaged: 10,
  needsDecided: 3,
  benchAvailable: 8,
  conversions: 2,
  marginBand: null,
  activeClients: 5,
  rejectedItems: 1,
  totalContacts: 120,
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  useQuery.mockReset()
  planFeature.mockReset()
  planFeature.mockReturnValue({ known: true, allowed: true })
})

describe('PilotageAccroche — l’accroche, jamais la lecture', () => {
  it('rend trois chiffres et UN lien vers la route qui porte la lecture', async () => {
    useQuery.mockReturnValue({ data: evaluatePilotageChain(INPUTS) })

    renderWithRouter(<PilotageAccroche />)

    expect(await screen.findByText('Le pilotage, en trois chiffres')).toBeInTheDocument()
    expect(screen.getByText('Ouvrir le pilotage')).toBeInTheDocument()
    // Les trois seaux sont NOMMÉS, « non mesuré » compris : il ne se fond pas
    // dans « tient ».
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
  })

  it('#4298.1 — une LIGNE dense, pas une grosse carte d’ouverture', async () => {
    useQuery.mockReturnValue({ data: evaluatePilotageChain(INPUTS) })

    const { container } = renderWithRouter(<PilotageAccroche />)

    await screen.findByText('Le pilotage, en trois chiffres')
    // Grammaire Cockpit : pas de boîte `p-4` ni de chiffre en `text-xl`.
    expect(container.innerHTML).not.toMatch(/\bp-4\b|text-xl/)
  })

  it('ne rend RIEN tant que la chaîne n’a pas été lue — pas de zéro rassurant', () => {
    useQuery.mockReturnValue({ data: undefined })

    const { container } = render(<PilotageAccroche />)

    expect(container.textContent).toBe('')
    expect(container.textContent).not.toContain('Le pilotage, en trois chiffres')
    expect(container.textContent).not.toContain('Ouvrir le pilotage')
  })

  it('ne LIT pas la chaîne quand la capacité n’est pas ouverte — la porte change, pas la page', () => {
    planFeature.mockReturnValue({ known: true, allowed: false })
    useQuery.mockReturnValue({ data: undefined })

    render(<PilotageAccroche />)

    expect(planFeature).toHaveBeenCalledWith('manager_cockpit')
    expect((useQuery.mock.calls[0]?.[0] as { enabled: boolean }).enabled).toBe(false)
  })
})
