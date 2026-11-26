import { screen } from '@testing-library/react'
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
 * #1574.1 — LE POTENTIEL STRUCTUREL SUR UNE OPPORTUNITÉ À RÉVEILLER.
 *
 * Le retour demande d'enrichir l'EXPLICATION de ce bloc avec la mémoire marché,
 * et pose dans la même phrase ce qu'elle n'a pas le droit de devenir : « ne
 * jamais transformer cette mémoire en prétexte automatique pour contacter le
 * client ». Ces tests tiennent les deux moitiés.
 *
 * ⚠️ Ils tiennent une STRUCTURE, pas une mise en page : jsdom ne met rien en
 * page. Ce qui se vérifie ici est que le badge existe quand la couverture
 * existe, qu'il se TAIT sinon, et surtout qu'il ne déplace PAS le choix du CTA
 * — c'est `new_signal`, et lui seul, qui décide s'il y a urgence à qualifier.
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

describe('DormantOpportunitiesCard — le potentiel structurel (#1574.1)', () => {
  it('porte le badge quand la mémoire marché couvre le compte', async () => {
    renderWithRouter(
      <DormantOpportunitiesCard opportunities={[opportunity({ market_paths: 135 })]} provenance={PROVENANCE} />,
    )

    // Le nom du compte est DANS le libellé accessible : quatre badges identiques
    // dans la même liste ne se distinguent pas sans lui (GA-32).
    expect(await screen.findByRole('button', { name: /Potentiel structurel fort pour Thales/ })).toBeInTheDocument()
  })

  it('se TAIT quand le compte n’est pas couvert — jamais « 0 parcours »', async () => {
    renderWithRouter(<DormantOpportunitiesCard opportunities={[opportunity()]} provenance={PROVENANCE} />)

    expect(await screen.findByText('Thales')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Potentiel structurel/ })).not.toBeInTheDocument()
  })

  it('se TAIT quand l’API est plus ancienne que le web et n’envoie pas le champ', async () => {
    // La fenêtre de déploiement : le web part en une minute, l'API en plusieurs.
    // Le champ est alors ABSENT, pas `null` — et l'écran doit tenir.
    const older = opportunity()
    delete (older as Partial<CockpitDormantOpportunity>).market_paths
    renderWithRouter(<DormantOpportunitiesCard opportunities={[older]} provenance={PROVENANCE} />)

    expect(await screen.findByText('Thales')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Potentiel structurel/ })).not.toBeInTheDocument()
  })

  it('ne déplace PAS le CTA : couvert et sans signal, on PRÉPARE, on ne « vérifie » pas', async () => {
    // La règle du retour : la mémoire marché augmente un POTENTIEL, elle ne
    // fabrique jamais une urgence. Un compte massivement observé mais sans
    // signal récent garde donc le geste de la relation.
    renderWithRouter(
      <DormantOpportunitiesCard opportunities={[opportunity({ market_paths: 999 })]} provenance={PROVENANCE} />,
    )

    expect(await screen.findByText('Préparer la reprise')).toBeInTheDocument()
    expect(screen.queryByText('Vérifier maintenant')).not.toBeInTheDocument()
  })
})
