import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { OrgStructureSection } from './OrgStructureSection'
import type { OrgStructureData } from './orgStructureData'

/**
 * « Relance un enrichissement pour la reconstituer » — et rien pour le faire.
 *
 * Le geste EXISTE : c'est celui que la carte d'organigramme pose déjà dans son
 * propre état vide. Ici le texte le nommait et laissait remonter la page le
 * chercher. Un état vide qui décrit la porte sans la poser est un cul-de-sac.
 */
const enrichMutate = vi.fn()
let enrichIsPending = false

vi.mock('@/features/accounts/hooks/useEnrichAccount', () => ({
  useEnrichOrganigram: () => ({ mutate: enrichMutate, isPending: enrichIsPending }),
}))
// #2502.1 — même défaut recette 17/09, un troisième endroit : `canEnrich`
// devient mutable pour exercer les DEUX états (zéro crédit / verrouillé).
let canEnrich = true
let locked = false
vi.mock('@/features/credits/hooks/useCreditGate', () => ({
  useCreditGate: () => ({ canEnrich, locked }),
}))
// Le planificateur d'enrichissement (bouton frère, hors périmètre de ce
// fichier) monte de vrais hooks TanStack Query — un QueryClient suffit à le
// laisser respirer sans en mocker le contenu.
vi.mock('@/features/accounts/api', () => ({
  accountsApi: {
    enrichmentPlan: vi.fn().mockResolvedValue({
      mode: 'next_batch',
      scopeLabel: '',
      contactsTargeted: { status: 'measured', value: 0 },
      waveCount: { status: 'measured', value: 0 },
      waveSize: 50,
      estimatedCredits: { status: 'measured', value: 0 },
    }),
    enrichmentConfirm: vi.fn(),
  },
  accountKeys: {
    detail: (id: string) => ['account', id],
    enrichmentPlan: (id: string, params: unknown) => ['account', 'enrichment-plan', id, params],
  },
}))
vi.mock('@/features/contacts/api', () => ({
  contactKeys: { byAccount: (id: string) => ['contacts', 'by-account', id] },
}))

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const EMPTY: OrgStructureData = {
  units: [],
  decisionChain: null,
  approachOrder: [],
  stakeholders: [],
  committee: null,
  isEmpty: true,
}

describe('OrgStructureSection — l’état vide pose le geste qu’il nomme', () => {
  beforeEach(async () => {
    enrichMutate.mockClear()
    enrichIsPending = false
    canEnrich = true
    locked = false
    await i18n.changeLanguage('fr')
  })

  it('offre l’enrichissement au lieu de seulement le décrire', async () => {
    const user = userEvent.setup()
    wrap(<OrgStructureSection data={EMPTY} accountId="acc-1" />)

    expect(screen.getByText('Structure décisionnelle non disponible')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Relancer l’enrichissement/i }))
    expect(enrichMutate).toHaveBeenCalledTimes(1)
  })

  /**
   * #3020 (retour bêta, ré-échoué en recette écran le 25/09/2026) — ce bouton
   * appelle la MÊME mutation `useEnrichOrganigram` que l'entête de l'onglet,
   * dont le correctif #3020 avait posé un avancement lisible. `isLoading`
   * (`packages/ui/src/components/button.tsx`) REMPLACE les enfants par un
   * spinner nu pendant l'appel : le texte conditionnel passé en ENFANT ici
   * (`{enrichMutation.isPending ? … : …}`) ne s'affichait donc JAMAIS —
   * exactement le symptôme mesuré en recette (« spinner muet »), sur un
   * chemin différent de celui déjà corrigé.
   */
  it('#3020 — pendant l’appel, un temps RÉEL s’affiche, jamais un spinner muet', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    enrichIsPending = true
    wrap(<OrgStructureSection data={EMPTY} accountId="acc-1" />)
    const cta = screen.getByRole('button', { name: i18n.t('accountOrg:organigramme.enrichingElapsed', { elapsed: 0 }) })
    expect(cta).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(
      screen.getByRole('button', { name: i18n.t('accountOrg:organigramme.enrichingElapsed', { elapsed: 3 }) }),
    ).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('n’affiche pas de bouton quand la structure est là — un bouton sur une bonne nouvelle est un reproche', () => {
    wrap(<OrgStructureSection data={{ ...EMPTY, isEmpty: false, units: [] }} accountId="acc-1" />)

    expect(screen.queryByRole('button', { name: /Relancer l’enrichissement/i })).not.toBeInTheDocument()
  })

  /**
   * #2502.1 — même défaut recette du 17/09 que `OrgMapEmptyState` et l'entête
   * de `TabOrganigramme` (`ebcc78bc5`), un TROISIÈME endroit resté non corrigé :
   * ce geste ne débite AUCUN crédit (même mutation, `useEnrichOrganigram`), le
   * griser à zéro crédit le rendait injoignable.
   */
  it('#2502.1 — reste actif à zéro crédit (geste gratuit)', () => {
    canEnrich = false
    wrap(<OrgStructureSection data={EMPTY} accountId="acc-1" />)
    expect(screen.getByRole('button', { name: /Relancer l’enrichissement/i })).toBeEnabled()
  })

  it('#2502.1 — se grise seulement quand l’accès est VERROUILLÉ (essai terminé)', () => {
    canEnrich = false
    locked = true
    wrap(<OrgStructureSection data={EMPTY} accountId="acc-1" />)
    const cta = screen.getByRole('button', { name: /Relancer l’enrichissement/i })
    expect(cta).toBeDisabled()
    expect(cta).toHaveAttribute('title', i18n.t('accountOrg:organigramme.enrichLockedTitle'))
  })
})
