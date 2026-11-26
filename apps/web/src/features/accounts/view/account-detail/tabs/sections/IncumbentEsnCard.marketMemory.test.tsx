import type { AccountIntelligenceContextView } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { IncumbentEsnCard } from './IncumbentEsnCard'
// #3672 revient sur le libellé de provenance de #1607, délibérément ; ce qui tient : la source reste nommée (une par fait/champ), déclaré vs déduit reste distinct, date et certitude restent affichées.

let esnObservedDetail: { esnName: string; persons: number; certainty: string }[] | undefined = []

// #2116.10 — l'ESN en place vient désormais du contexte canonique, jamais de
// `raw_analysis` recalculé ici : un seul incumbent nommé, Capgemini ou Sopra
// Steria selon le test, suffit à exercer la corroboration.
function contextWith(name: string): AccountIntelligenceContextView {
  return {
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
    incumbentEsn: {
      state: 'known',
      value: [{ name, contractType: null, strengths: null, weaknesses: null }],
      provenance: { source: 'public_sources', observedAt: null },
    },
    technologies: { state: 'unknown' },
    entryPaths: { state: 'unknown' },
    recommendations: [],
  }
}

vi.mock('@/features/accounts/hooks/useAccountIntelligenceContext', () => ({
  useAccountIntelligenceContext: () => ({ data: contextWith(currentIncumbentName) }),
}))

vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  // Respecte `enabled`, comme le ferait le vrai hook (React Query rend
  // `data: undefined` tant que la requête n'est pas activée).
  useAccountMarketContext: (_accountId: string | undefined, enabled: boolean) => ({
    data:
      !enabled || esnObservedDetail === undefined
        ? undefined
        : { paths_observed: 41, esn_observed: 3, esn_observed_detail: esnObservedDetail },
  }),
}))

let currentIncumbentName = 'Capgemini'

beforeEach(() => {
  esnObservedDetail = []
  currentIncumbentName = 'Capgemini'
})

/**
 * #1607.3 — LA CORROBORATION DES ESN EN PLACE PAR LA MÉMOIRE MARCHÉ.
 *
 * ⚠️ Ce que ces tests tiennent, verbatim depuis le lot :
 *  1. Sous 3 observations, la corroboration ne dit RIEN — et aucun libellé
 *     n'emploie « en place » / « travaille actuellement » / « est fournisseur ».
 *  2. Une absence d'observation n'est JAMAIS rendue comme un « non ».
 */
describe('IncumbentEsnCard — corroboration par la mémoire marché (#1607.3)', () => {
  it('corrobore une ESN nommée par l’analyse ET observée à ou au-dessus du seuil', async () => {
    esnObservedDetail = [{ esnName: 'Capgemini', persons: 9, certainty: 'forte' }]
    renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)

    expect(await screen.findByText('Capgemini')).toBeInTheDocument()
    expect(screen.getByText(/aussi observé dans l.historique/)).toBeInTheDocument()
    expect(screen.getByText(/9 parcours/)).toBeInTheDocument()
  })

  it('sous le seuil de 3, la corroboration dit « 1-2 parcours » — jamais le compte exact (#4016 L10)', async () => {
    esnObservedDetail = [{ esnName: 'Capgemini', persons: 2, certainty: 'faible' }]
    const { container } = renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)

    expect(await screen.findByText('Capgemini')).toBeInTheDocument()
    expect(screen.getByText(/aussi observé dans l.historique — 1-2 parcours/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/(?<![-\d])2 parcours/)
  })

  it('à 0 parcours la corroboration NE DIT RIEN', async () => {
    esnObservedDetail = [{ esnName: 'Capgemini', persons: 0, certainty: 'faible' }]
    renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)

    expect(await screen.findByText('Capgemini')).toBeInTheDocument()
    expect(screen.queryByText(/aussi observé dans l.historique/)).not.toBeInTheDocument()
  })

  it('une ESN nommée mais ABSENTE du corpus n’affiche jamais un « non » — silence total', async () => {
    esnObservedDetail = []
    currentIncumbentName = 'Sopra Steria'
    renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)

    expect(await screen.findByText('Sopra Steria')).toBeInTheDocument()
    expect(screen.queryByText(/aussi observé dans l.historique/)).not.toBeInTheDocument()
    // Aucune formulation négative n'est inventée à la place du silence.
    expect(
      screen.queryByText(/pas observé|non confirmé|absente? de la mémoire|aucune observation/i),
    ).not.toBeInTheDocument()
  })

  it('n’écrit jamais « en place » / « travaille actuellement » / « est fournisseur » depuis la mémoire marché seule', async () => {
    esnObservedDetail = [{ esnName: 'Capgemini', persons: 9, certainty: 'forte' }]
    const { container } = renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)
    await screen.findByText('Capgemini')

    const texte = container.textContent ?? ''
    expect(texte).not.toMatch(/travaille actuellement/i)
    expect(texte).not.toMatch(/est fournisseur/i)
    // « en place » reste le vocabulaire du TITRE de la carte (constat de
    // l'analyse elle-même) — jamais celui de la phrase de corroboration, qui
    // ne doit pas non plus l'employer.
    const phraseDeCorroboration = screen.getByText(/aussi observé dans l.historique/)
    expect(phraseDeCorroboration.textContent ?? '').not.toMatch(/en place/i)
  })
})
