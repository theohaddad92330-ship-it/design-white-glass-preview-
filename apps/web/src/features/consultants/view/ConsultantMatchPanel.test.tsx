import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsultantMatch } from '@bellum/contracts'

// #4158.23 — la note « déjà proposé » a ses propres tests ; elle lit l'API des garde-fous.
vi.mock('@/features/team-guardrails/components/AlreadyProposedNote', () => ({ AlreadyProposedNote: () => null }))

/**
 * « Un score n'est jamais nu » — LU À L'ÉCRAN, sur ce tiroir (GA-18/GA-19).
 *
 * `selectPush` (`consultant-matching.ts`) exclut déjà un score `null` du push
 * qu'elle rend à l'écran — mais la carte est le dernier rempart : rien
 * n'empêche un futur appelant de lui passer un `ConsultantMatch` non mesuré
 * directement (un autre écran, un test, une évolution de `selectPush`). La
 * doctrine se tient donc aussi ICI, au niveau du composant, pas seulement au
 * niveau du calcul qui l'alimente d'ordinaire.
 *
 * Avant le correctif, un profil non mesuré n'existait pas : le calcul rendait
 * toujours un nombre — parfois 100/100 sur un seul critère évaluable, parfois
 * 0/100 sur un dénominateur nul. Ce test fixe la promesse inverse : `null`
 * s'écrit « non mesuré », jamais un chiffre.
 */

const OPPORTUNITY_ID = '11111111-1111-4111-8111-111111111111'

const BASE_MATCH: ConsultantMatch = {
  consultant_id: 'a0000000-0000-4000-8000-000000000001',
  full_name: 'Nadia Fournier',
  score: 84,
  // #2330.1/.5 — le verdict NOMMÉ, jamais un pourcentage seul.
  verdict: 'fortement_defendable',
  breakdown: [
    { criterion: 'stack', label: 'Compétences vs besoin', points: 30, max: 35, proof: 'Kubernetes en commun' },
    { criterion: 'availability', label: 'Disponibilité', points: 25, max: 25, proof: 'disponible immédiatement' },
    { criterion: 'sector', label: 'Expérience du secteur', points: 15, max: 15, proof: 'a déjà travaillé en banque' },
  ],
  unevaluated: [],
  skills: [],
  gaps: [],
  recommendedStep: 'proposer ce profil au client',
  reasons: ['Kubernetes en commun'],
  risks: [],
  blocked: false,
  clientHistory: null,
}

/** Le cas défensif : un score non mesuré, forcé dans `push` — ce qu'un
 *  appelant normal ne fait plus depuis `selectPush`, précisément pour vérifier
 *  que la carte tient la promesse SEULE, sans compter sur l'appelant. */
const UNMEASURED_MATCH: ConsultantMatch = {
  ...BASE_MATCH,
  consultant_id: 'a0000000-0000-4000-8000-000000000002',
  full_name: 'Zoé NonMesurée',
  score: null,
  verdict: 'non_evaluable',
  breakdown: [
    { criterion: 'availability', label: 'Disponibilité', points: 25, max: 25, proof: 'disponible immédiatement' },
  ],
  unevaluated: [
    'Compétences vs besoin',
    'Expérience du secteur',
    'Zone géographique',
    'Références citables',
    'Cadre contractuel',
  ],
  gaps: [],
  recommendedStep: "compléter la fiche (disponibilité ou compétences) avant de pouvoir l'évaluer",
  reasons: ['disponible immédiatement'],
}

const { matchQuery } = vi.hoisted(() => ({ matchQuery: vi.fn() }))
vi.mock('../hooks', () => ({
  useOpportunitiesForMatch: () => ({ data: [{ id: OPPORTUNITY_ID, label: 'Renfort SOC', company_name: 'EDF DSI' }] }),
  useConsultantMatch: () => matchQuery(),
  // #1952.5 (épopée #2844) — `BulkCvRewriteButton` monté sous la comparaison :
  // même mock minimal que les autres hooks de ce fichier, jamais appelé au
  // clic dans ces tests.
  useBulkCvRewriteEnqueue: () => ({ mutateAsync: vi.fn(), isPending: false, data: undefined }),
  useBulkCvRewriteJobStatus: () => ({ data: undefined }),
}))
vi.mock('@/features/submissions/api', () => ({ useCreateSubmission: () => ({ mutate: vi.fn(), isPending: false }) }))
// #2440.34 (épopée #2975) — `MatchCard` pose `ConsultantCvDialog`, qui lit
// désormais `useCredits` (donc `useSession`) pour le solde disponible avant
// le clic : même mock que `ConsultantCvDialog.test.tsx`, sans quoi ce panneau
// planterait faute de `SessionProvider`.
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: undefined }),
}))

const { ConsultantMatchPanel } = await import('./ConsultantMatchPanel')

function renderPanel() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <ConsultantMatchPanel selectedId={OPPORTUNITY_ID} onSelect={() => {}} />
    </QueryClientProvider>,
  )
}

afterEach(() => cleanup())

describe('ConsultantMatchPanel — un profil non mesuré ne rend jamais 0 (GA-18/GA-19)', () => {
  beforeEach(() => {
    matchQuery.mockReset().mockReturnValue({
      data: { ranked: [UNMEASURED_MATCH], top: [UNMEASURED_MATCH], push: [UNMEASURED_MATCH] },
      isLoading: false,
    })
  })

  it('n’affiche AUCUN score chiffré — « non mesuré » remplace le nombre', () => {
    renderPanel()

    // Jamais le gabarit numérique de la clé `match.score` («{{score}}/100»),
    // ni sous sa forme la plus trompeuse (un dénominateur nul repliait sur 0).
    expect(screen.queryByText('0/100')).not.toBeInTheDocument()
    expect(screen.queryByText(/^\d+\/100$/)).not.toBeInTheDocument()
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
  })

  it('NOMME ce qui n’a pas pu être évalué — un score n’est jamais nu, même absent', () => {
    renderPanel()

    expect(screen.getByText(/Non évaluable ici/)).toBeInTheDocument()
    expect(screen.getByText(/Compétences vs besoin/)).toBeInTheDocument()
    expect(screen.getByText(/Cadre contractuel/)).toBeInTheDocument()
  })
})

describe('ConsultantMatchPanel — un profil mesuré garde son score chiffré', () => {
  beforeEach(() => {
    matchQuery.mockReset().mockReturnValue({
      data: { ranked: [BASE_MATCH], top: [BASE_MATCH], push: [BASE_MATCH] },
      isLoading: false,
    })
  })

  it('sait dire NON à la fausse alerte : un score mesuré s’affiche normalement', () => {
    renderPanel()

    // #3812.2 — le badge dit ce qu'il mesure, jamais un « 84/100 » nu.
    expect(screen.getByText('Adéquation au besoin 84/100')).toBeInTheDocument()
    expect(screen.queryByText(/non mesuré/)).not.toBeInTheDocument()
  })

  it('#2330.1/.5 — affiche le verdict NOMMÉ, jamais un pourcentage seul', () => {
    renderPanel()

    expect(screen.getByText('Fortement défendable')).toBeInTheDocument()
  })
})

/**
 * #2330.6/.7 — un profil du TOP mais pas du PUSH (verdict `alternative`,
 * bloqué) reste VISIBLE avec son raisonnement complet, mais sans les actions
 * réservées aux profils réellement poussés — « pas de CV catalogue » se tient
 * en réservant l'ACTION, pas la VISIBILITÉ.
 */
const ALTERNATIVE_MATCH: ConsultantMatch = {
  ...BASE_MATCH,
  consultant_id: 'a0000000-0000-4000-8000-000000000003',
  full_name: 'Léo Compromis',
  score: 70,
  verdict: 'alternative',
  blocked: true,
  gaps: ['Kafka — non prouvé'],
  recommendedStep: 'vérifier avec le client : libre seulement sous 3 mois',
  risks: ['libre seulement sous 3 mois'],
}

describe('ConsultantMatchPanel — un profil du TOP non poussable reste visible, sans action', () => {
  beforeEach(() => {
    matchQuery.mockReset().mockReturnValue({
      data: { ranked: [ALTERNATIVE_MATCH], top: [ALTERNATIVE_MATCH], push: [] },
      isLoading: false,
    })
  })

  it('affiche le verdict ALTERNATIVE, ses gaps et sa prochaine étape', () => {
    renderPanel()

    expect(screen.getByText('Alternative')).toBeInTheDocument()
    expect(screen.getByText(/Kafka — non prouvé/)).toBeInTheDocument()
    // Le risque ET la prochaine étape citent tous deux ce motif — deux lignes
    // distinctes, jamais fondues.
    expect(screen.getAllByText(/libre seulement sous 3 mois/)).toHaveLength(2)
    expect(screen.getByText(/Prochaine étape/)).toBeInTheDocument()
  })

  it('NE montre AUCUN bouton d’action réservé aux profils poussés', () => {
    renderPanel()

    expect(screen.queryByRole('button', { name: /Positionner sur ce besoin/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Issue :/)).not.toBeInTheDocument()
  })
})

/**
 * #2330.8 — comparer 2 à 4 profils du TOP sur les mêmes axes, côte à côte.
 * Trois profils défendables : le troisième (non coché) ne doit apparaître
 * dans AUCUNE colonne du tableau de comparaison.
 */
const THIRD_MATCH: ConsultantMatch = {
  ...BASE_MATCH,
  consultant_id: 'a0000000-0000-4000-8000-000000000004',
  full_name: 'Farid Excellent',
  score: 91,
}

describe('ConsultantMatchPanel — #2330.8 comparer 2 à 4 profils sur les mêmes axes', () => {
  beforeEach(() => {
    matchQuery.mockReset().mockReturnValue({
      data: {
        ranked: [BASE_MATCH, ALTERNATIVE_MATCH, THIRD_MATCH],
        top: [BASE_MATCH, ALTERNATIVE_MATCH, THIRD_MATCH],
        push: [BASE_MATCH],
      },
      isLoading: false,
    })
  })

  it('n’affiche AUCUNE comparaison tant que moins de deux profils sont cochés', () => {
    renderPanel()

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('affiche les DEUX profils cochés côte à côte sur les mêmes axes — pas le troisième', async () => {
    renderPanel()
    const user = userEvent.setup()
    const checkboxes = screen.getAllByRole('checkbox', { name: 'Comparer' })
    expect(checkboxes).toHaveLength(3)

    await user.click(checkboxes[0])
    await user.click(checkboxes[1])

    expect(screen.getByRole('table')).toBeInTheDocument()
    // Les axes (critères) de la cible sont communs — repris du premier profil.
    expect(screen.getAllByText('Compétences vs besoin').length).toBeGreaterThan(0)
    // Le troisième profil, non coché, ne rentre pas dans le tableau : son nom
    // n'apparaît qu'une fois (sa propre carte), jamais une seconde fois côté
    // comparaison.
    expect(screen.getAllByText('Farid Excellent')).toHaveLength(1)
    // Les deux profils cochés, eux, apparaissent deux fois : leur carte ET la
    // colonne qui leur est dédiée dans le tableau.
    expect(screen.getAllByText('Nadia Fournier')).toHaveLength(2)
    expect(screen.getAllByText('Léo Compromis')).toHaveLength(2)
  })

  it('décocher repasse sous le seuil et retire la comparaison', async () => {
    renderPanel()
    const user = userEvent.setup()
    const checkboxes = screen.getAllByRole('checkbox', { name: 'Comparer' })

    await user.click(checkboxes[0])
    await user.click(checkboxes[1])
    expect(screen.getByRole('table')).toBeInTheDocument()

    await user.click(checkboxes[0])
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
