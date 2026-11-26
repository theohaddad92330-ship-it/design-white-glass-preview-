import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CohorteEntonnoir, RapportEntonnoir } from './onboarding-funnel.client'

/**
 * #1642.2 — LE FILET DE `/produit/onboarding` APRÈS LE PASSAGE AUX PRIMITIVES.
 *
 * Cet écran n'avait AUCUN test de page avant ce lot (seule sa dérivation pure,
 * `onboarding-funnel.logic.test.ts`, était couverte). Ce fichier prouve que le
 * passage à `Card`/`CardHeader`/`KpiTile`/`DataTable`/`EmptyState` ne fait
 * disparaître AUCUNE information : les deux mots qui ne se ressemblent pas
 * (« trop tôt » / « non instrumentée »), la ligne masquée nommée, l'état
 * d'erreur, l'état vide.
 */
;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('./onboarding-funnel.client', async () => {
  const actual = await vi.importActual<typeof import('./onboarding-funnel.client')>('./onboarding-funnel.client')
  return { ...actual, fetchOnboardingFunnel: vi.fn() }
})

import { fetchOnboardingFunnel } from './onboarding-funnel.client'
import OnboardingFunnelPage from './page'

const fetchFunnel = vi.mocked(fetchOnboardingFunnel)

function cohorte(mois: string, espaces: number, overrides: Partial<CohorteEntonnoir> = {}): CohorteEntonnoir {
  return {
    cohorte: mois,
    espaces,
    etapes: [
      { cle: 'onboarding_started', etat: 'mesuree', atteints: espaces, part: 1 },
      { cle: 'onboarding_completed', etat: 'mesuree', atteints: 0, part: 0 },
      { cle: 'integration_connected', etat: 'non_mesuree', atteints: 0, part: null },
      { cle: 'analysis_started', etat: 'non_instrumentee', atteints: 0, part: null },
    ],
    delaiPremiereValeur: { medianJours: null, echantillon: 0 },
    ...overrides,
  }
}

const ETAPES: RapportEntonnoir['etapes'] = [
  { cle: 'onboarding_started', libelle: 'Onboarding démarré', graceJours: 0 },
  { cle: 'onboarding_completed', libelle: 'Onboarding terminé', graceJours: 0 },
  { cle: 'integration_connected', libelle: 'Intégration connectée', graceJours: 3 },
  { cle: 'analysis_started', libelle: 'Analyse démarrée', graceJours: 3 },
]

async function rendu(): Promise<string> {
  return renderToStaticMarkup(await OnboardingFunnelPage())
}

// #1642.2 — le passage aux primitives ne fait disparaître aucune information.
describe('/produit/onboarding — après le passage aux primitives', () => {
  beforeEach(() => {
    fetchFunnel.mockReset()
  })

  it('une cohorte affichée rend « non instrumentée » et « trop tôt », jamais un 0 % à leur place', async () => {
    fetchFunnel.mockResolvedValue({
      cohortes: [cohorte('2026-06', 8)],
      etapes: ETAPES,
      espaces: 8,
      calculeA: '2026-09-10T00:00:00.000Z',
    })
    const html = await rendu()
    expect(html).toContain('non instrumentée')
    expect(html).toContain('trop tôt')
    expect(html).toContain('100 %') // onboarding_started, part: 1
    expect(html).toContain('0 %') // onboarding_completed, part: 0 — un ZÉRO VRAI, pas un vide
  })

  it('une cohorte sous le seuil est MASQUÉE et NOMMÉE, jamais silencieusement absente', async () => {
    fetchFunnel.mockResolvedValue({
      cohortes: [cohorte('2026-06', 2), cohorte('2026-07', 9)],
      etapes: ETAPES,
      espaces: 11,
      calculeA: '2026-09-10T00:00:00.000Z',
    })
    const html = await rendu()
    expect(html).toContain('Cohortes masquées')
    expect(html).toContain('trop peu d’espaces (2 sur')
    // La cohorte affichée reste dans le tableau.
    expect(html).toContain('juillet 2026')
  })

  it('aucune cohorte du tout → état vide explicite, jamais une table absente sans explication', async () => {
    fetchFunnel.mockResolvedValue({ cohortes: [], etapes: ETAPES, espaces: 0, calculeA: '2026-09-10T00:00:00.000Z' })
    const html = await rendu()
    expect(html).toContain('il n’y a pas encore de cohorte à suivre')
  })

  it('toutes les cohortes sont masquées → le tableau ne rend rien, mais la raison est nommée', async () => {
    fetchFunnel.mockResolvedValue({
      cohortes: [cohorte('2026-06', 1)],
      etapes: ETAPES,
      espaces: 1,
      calculeA: '2026-09-10T00:00:00.000Z',
    })
    const html = await rendu()
    expect(html).toContain('rien ne peut être affiché sans désigner ses membres')
  })

  it('une panne de l’API rend une erreur, jamais un entonnoir vide qui la cacherait', async () => {
    fetchFunnel.mockRejectedValue(new Error('onboarding-funnel endpoint returned 500 Internal Server Error'))
    const html = await rendu()
    expect(html).toContain('Impossible de lire l’entonnoir')
    expect(html).toContain('500')
  })

  it('sait dire NON — un délai à `null` rend un tiret, jamais « 0 j » qui dirait « immédiat »', async () => {
    fetchFunnel.mockResolvedValue({
      cohortes: [cohorte('2026-06', 8, { delaiPremiereValeur: { medianJours: null, echantillon: 0 } })],
      etapes: ETAPES,
      espaces: 8,
      calculeA: '2026-09-10T00:00:00.000Z',
    })
    const html = await rendu()
    expect(html).not.toContain('0 j')
  })
})
