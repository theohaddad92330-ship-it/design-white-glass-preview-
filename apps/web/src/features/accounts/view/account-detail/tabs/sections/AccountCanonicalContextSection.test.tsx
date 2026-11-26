import type { AccountIntelligenceContextView } from '@bellum/contracts'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountCanonicalContextSection } from './AccountCanonicalContextSection'

const useAccountIntelligenceContext = vi.hoisted(() => vi.fn())
vi.mock('@/features/accounts/hooks/useAccountIntelligenceContext', () => ({ useAccountIntelligenceContext }))

/**
 * #2116 — L'APPELANT. La route `GET /accounts/:id/intelligence-context` était
 * exposée depuis #1618 et lue par personne ; ce test est ce qui empêche de
 * retomber dans le défaut n°1 du dépôt (« du code juste que personne
 * n'appelle »), en prouvant que l'écran passe bien l'identifiant du compte et
 * rend ce que la façade renvoie.
 */
const CONTEXT: AccountIntelligenceContextView = {
  accountId: 'acc-1',
  // #3219 (#190.1) — aucune contradiction de champ ouverte sur ce compte.
  conflicts: [],
  // #2116.3 / .6 / .7 — l'identité et la mémoire marché font partie de la vue
  // depuis ce lot ; ce fichier ne les teste pas, il les déclare INCONNUES
  // plutôt que de les inventer.
  companyName: { state: 'unknown' },
  sector: { state: 'unknown' },
  headquarters: { state: 'unknown' },
  marketMemory: {
    provenance: { source: 'market_memory', observedAt: null },
    read: { status: 'unavailable', reason: 'hors sujet de ce test' },
  },
  // #2116.10 — pas rendu par cette section (IncumbentEsnCard en est le seul
  // propriétaire) : présent uniquement parce que le champ n'est pas optionnel
  // au contrat.
  incumbentEsn: { state: 'unknown' },
  technologies: {
    state: 'known',
    value: [{ name: 'React', usage: null }],
    provenance: { source: 'public_sources', observedAt: '2026-09-01T00:00:00.000Z' },
  },
  entryPaths: { state: 'unknown' },
  recommendations: [],
}

describe('AccountCanonicalContextSection', () => {
  it('appelle la façade AVEC l’identifiant du compte, et rend sa réponse', async () => {
    useAccountIntelligenceContext.mockReturnValue({ data: CONTEXT })
    renderWithRouter(<AccountCanonicalContextSection accountId="acc-1" onTabChange={vi.fn()} />)
    // ⚠️ APRÈS le rendu : `renderWithRouter` monte à travers un routeur, donc
    // l'assertion posée avant l'attente compterait zéro appel et passerait
    // pour une preuve — c'est le faux vert de cette famille de tests.
    expect(await screen.findByText('React')).toBeInTheDocument()
    expect(useAccountIntelligenceContext).toHaveBeenCalledWith('acc-1')
  })

  it('sait dire NON : sans réponse de la façade, la section ne rend RIEN — pas « aucune ESN »', async () => {
    useAccountIntelligenceContext.mockReturnValue({ data: undefined })
    const { container } = renderWithRouter(<AccountCanonicalContextSection accountId="acc-1" onTabChange={vi.fn()} />)
    // La section EST montée (le hook a été appelé) et n'écrit rien : c'est ce
    // qui distingue « rien à dire » d'un composant qui n'a jamais été rendu.
    await waitFor(() => expect(useAccountIntelligenceContext).toHaveBeenCalledWith('acc-1'))
    expect(container.textContent).toBe('')
  })
})
