import { fireEvent, renderHook, screen } from '@testing-library/react'
import { resetLauraIntro, useLauraOpenRequest } from '@/features/laura/bubble/laura-intro-store'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { CockpitDormantOpportunity, CockpitProvenance } from '@bellum/contracts'
import { DormantOpportunitiesCard } from './DormantOpportunitiesCard'

/*
 * #1812 — « Demander à {{copilot}} » ne prend plus de place sur un poste de
 * bureau : c'est la BULLE qui porte la question, et `AskLaura` ne rend alors
 * rien. Ce test mesure que la CARTE propose bien le geste, pas la bulle : on
 * double donc le dépôt pour dire « une autre instance la porte ». Le nouveau
 * chemin est gardé par `laura-intro-store.test.tsx`, `LauraIntroBar.test.tsx`,
 * `LauraDock.intro.test.tsx` et `AskLaura.test.tsx`.
 */
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

/**
 * #1574.2 — DEUX CTA DISTINCTS, JAMAIS LES DEUX EN MÊME TEMPS.
 *
 * « Préparer la reprise » suppose une RELATION passée à reprendre — la carte
 * porte alors une raison qui vient du silence ou d'un échange antérieur.
 * « Vérifier maintenant » s'affiche quand la raison d'agir est un signal
 * STRUCTUREL neuf (`new_signal`, ex. « Levée de fonds ») : une information sur
 * l'entreprise, pas sur la relation, qui demande d'abord une qualification
 * avant toute reprise de contact.
 */

const PROVENANCE: CockpitProvenance = {
  sources: ['bellum'],
  window_days: 90,
  population: 4,
  computed_at: '2026-09-06T09:00:00.000Z',
}

function opportunity(over: Partial<CockpitDormantOpportunity> = {}): CockpitDormantOpportunity {
  return {
    account_id: '11111111-1111-4111-8111-111111111111',
    company_name: 'Thales',
    logo_url: null,
    website: null,
    evidence: [{ kind: 'message_exchanged', label: null, occurred_at: '2026-01-10T00:00:00.000Z' }],
    last_interaction_at: '2026-01-10T00:00:00.000Z',
    new_signal: null,
    ...over,
  }
}

describe('DormantOpportunitiesCard — les deux CTA', () => {
  it('sans signal neuf : « Préparer la reprise », jamais « Vérifier maintenant »', async () => {
    renderWithRouter(<DormantOpportunitiesCard opportunities={[opportunity()]} provenance={PROVENANCE} />)

    expect(await screen.findByText('Préparer la reprise')).toBeInTheDocument()
    expect(screen.queryByText('Vérifier maintenant')).not.toBeInTheDocument()
  })

  it('avec un signal neuf : « Vérifier maintenant », jamais « Préparer la reprise »', async () => {
    renderWithRouter(
      <DormantOpportunitiesCard
        opportunities={[
          opportunity({ new_signal: { label: 'Levée de fonds', detected_at: '2026-09-01T00:00:00.000Z' } }),
        ]}
        provenance={PROVENANCE}
      />,
    )

    expect(await screen.findByText('Vérifier maintenant')).toBeInTheDocument()
    expect(screen.queryByText('Préparer la reprise')).not.toBeInTheDocument()
  })

  it('la question de vérification NOMME le signal, pas une phrase générique', async () => {
    renderWithRouter(
      <DormantOpportunitiesCard
        opportunities={[
          opportunity({ new_signal: { label: 'Levée de fonds', detected_at: '2026-09-01T00:00:00.000Z' } }),
        ]}
        provenance={PROVENANCE}
      />,
    )

    // #4309.1 (lot LAURA, 19/10/2026) — sur bureau, le CTA ouvre la bulle SUR PLACE : la question part
    // dans le magasin de Laura, lue ici comme la bulle la lit.
    resetLauraIntro()
    fireEvent.click((await screen.findByText('Vérifier maintenant')).closest('button')!)
    expect(renderHook(() => useLauraOpenRequest()).result.current?.question).toContain('Levée de fonds')
  })
})
