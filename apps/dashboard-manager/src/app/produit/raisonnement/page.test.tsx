import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FiabiliteJuge, MesureRaisonnement, RapportRaisonnement } from './reasoning-quality.client'

/**
 * Issue 3223.4 — l'écran Produit › Raisonnement de Laura. Ce qui compte : une
 * mesure absente se dit « non mesuré » (jamais « 0 % »), les mesures non
 * portées par la trace sont NOMMÉES, une panne se dit, FR et EN.
 */
;(globalThis as unknown as { React: typeof React }).React = React

const langue = vi.hoisted(() => ({ value: 'fr' as 'fr' | 'en' }))

vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual<typeof import('@/lib/i18n')>('@/lib/i18n')
  return { ...actual, getLang: () => langue.value }
})

vi.mock('./reasoning-quality.client', async () => {
  const actual = await vi.importActual<typeof import('./reasoning-quality.client')>('./reasoning-quality.client')
  return { ...actual, fetchReasoningQuality: vi.fn() }
})

import { fetchReasoningQuality } from './reasoning-quality.client'
import RaisonnementPage from './page'

const fetchReport = vi.mocked(fetchReasoningQuality)

const mesure = (value: number): MesureRaisonnement => ({ state: 'measured', value, sample: 40, excluded: 2 })
const absente: MesureRaisonnement = { state: 'unmeasured', reason: 'sample_too_small', sample: 3, excluded: 0 }

const jugeNonMesure: FiabiliteJuge = {
  state: 'unreliable',
  reason: 'not_measured',
  judgeVersion: 'j1',
  thresholdPercent: 85,
}

function rapport(
  overrides: Partial<RapportRaisonnement['metrics']> = {},
  extra: Partial<Pick<RapportRaisonnement, 'genericRecommendation' | 'contested'>> = {},
): RapportRaisonnement {
  return {
    windowDays: 30,
    turns: 120,
    metrics: {
      marketMemoryRate: mesure(35),
      publicOnlyRate: mesure(12.5),
      ignoredToolsRate: absente,
      budgetInterruptedRate: mesure(4),
      finalAnswerAfterBudgetRate: mesure(50),
      dataforgeUnavailableRate: mesure(20),
      internalSourceUnusedRate: mesure(8),
      counterAdviceRate: mesure(30),
      alternativesRate: mesure(45),
      noGoWithoutAlternativesRate: absente,
      userCorrectionRate: mesure(12),
      rerunAfterCorrectionRate: absente,
      falseSuccessRate: mesure(1.5),
      wrongZeroRate: absente,
      marketMemoryUncitedRate: mesure(30),
      correctionWithoutResultChangeRate: mesure(18),
      goLargeAccountWithoutAccessRate: absente,
      capabilityFallbackRate: mesure(7.5),
      ...overrides,
    },
    sourceRoute: [{ layer: 'market_memory', measure: mesure(35) }],
    genericRecommendation: { judge: jugeNonMesure, measure: null },
    contested: { minWorkspaces: 3, bySector: [], bySize: [] },
    notMeasured: [{ metric: 'taux de contre-conseil', reason: 'jugement commercial du tour non persisté' }],
    fallbackNotMeasured: [{ metric: 'repli de la cohorte canary', reason: 'la cohorte n’est pas persistée par tour' }],
    ...extra,
  }
}

async function rendu(): Promise<string> {
  return renderToStaticMarkup(await RaisonnementPage())
}

describe('/produit/raisonnement — issue 3223.4', () => {
  beforeEach(() => {
    fetchReport.mockReset()
    langue.value = 'fr'
  })

  it('rend les taux mesurés avec leur échantillon', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Raisonnement de Laura')
    expect(html).toContain('12.5 %')
    expect(html).toContain('40 tours (2 écartés, champ absent)')
    expect(html).toContain('Market Memory')
  })

  it('une mesure sans assez de tours se dit « non mesuré », jamais « 0 % »', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Non mesuré — échantillon trop petit')
    expect(html).not.toMatch(/>0 %</)
  })

  it('nomme ce que la trace ne porte pas encore, avec sa raison', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('taux de contre-conseil')
    expect(html).toContain('jugement commercial du tour non persisté')
  })

  it('rend les deux taux de correction (FR), le rerun non mesuré restant « non mesuré »', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Tours où l’utilisateur a corrigé Laura')
    expect(html).toContain('Corrections suivies d’un rerun de l’outil invalidé')
    expect(html).toContain('Non mesuré')
  })

  it('rend fausse réussite et mauvais zéro (FR) avec leur taux, ou « non mesuré »', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Tours qui déclarent une action faite sans preuve')
    expect(html).toContain('1.5 %')
    expect(html).toContain('Tours qui présentent une valeur inconnue comme zéro')
  })

  it('rend « mémoire marché non citée » (FR) avec son taux', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Tours où la mémoire marché a répondu sans être citée')
    expect(html).toContain('30 %')
  })

  it('rend « correction sans changement de résultat » et « GO grand compte sans accès » (FR), #3223 lot R17', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Corrections suivies d’un rerun, verdict inchangé')
    expect(html).toContain('18 %')
    expect(html).toContain('GO après preuve sur un grand compte sans accès connu')
  })

  it('#3223 — juge non fiable : « Non fiable », jamais un chiffre nu, et l’accord se dit « non mesuré »', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Réponses dont la recommandation est générique')
    expect(html).toContain('Non fiable — accord pas encore mesuré')
    expect(html).toContain('Non mesuré (seuil 85 %)')
  })

  it('#3223 — accord sous le seuil : l’accord se montre, la mesure reste non fiable', async () => {
    fetchReport.mockResolvedValue(
      rapport(
        {},
        {
          genericRecommendation: {
            judge: { ...jugeNonMesure, reason: 'below_threshold', agreementPercent: 70, agreed: 21, judged: 30 },
            measure: null,
          },
        },
      ),
    )
    const html = await rendu()
    expect(html).toContain('Non fiable — accord sous le seuil')
    expect(html).toContain('70 % — 21/30 cas (seuil 85 %)')
  })

  it('#3223 — juge fiable : le taux s’affiche avec son échantillon', async () => {
    fetchReport.mockResolvedValue(
      rapport(
        {},
        {
          genericRecommendation: {
            judge: {
              state: 'reliable',
              judgeVersion: 'j1',
              agreementPercent: 90,
              agreed: 27,
              judged: 30,
              thresholdPercent: 85,
              measuredAt: '2026-10-11',
            },
            measure: { state: 'measured', value: 22.5, sample: 40, excluded: 3 },
          },
        },
      ),
    )
    const html = await rendu()
    expect(html).toContain('22.5 %')
    expect(html).toContain('90 % — 27/30 cas (seuil 85 %)')
  })

  it('#3223 — classement agrégé : des segments, jamais un nom, et un vide qui se dit', async () => {
    fetchReport.mockResolvedValue(
      rapport(
        {},
        {
          contested: {
            minWorkspaces: 3,
            bySector: [
              {
                value: 'naf_62',
                measure: { state: 'measured', value: 40, sample: 30, excluded: 0 },
                contributingWorkspaces: 4,
              },
            ],
            bySize: [],
          },
        },
      ),
    )
    const html = await rendu()
    expect(html).toContain('Comptes et secteurs les plus contestés')
    expect(html).toContain('NAF 62')
    expect(html).toContain('40 %')
    expect(html).toContain('Pas assez de données communes')
  })

  it('une panne se dit, sans tableau', async () => {
    fetchReport.mockRejectedValue(new Error('boom'))
    const html = await rendu()
    expect(html).toContain('Impossible de lire le raisonnement de Laura')
    expect(html).toContain('boom')
    expect(html).not.toContain('<table')
  })

  it('parle anglais quand la langue est EN', async () => {
    langue.value = 'en'
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Laura’s reasoning')
    expect(html).toContain('Not measured — sample too small')
    expect(html).toContain('40 turns (2 set aside, field missing)')
  })

  it('#3861 (Q13) — le taux de repli IA a son tableau : le repli mesuré, et ce qui ne l’est pas, nommé', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Taux de repli IA')
    expect(html).toContain('7.5 %')
    expect(html).toContain('repli de la cohorte canary')
    expect(html).toContain('la cohorte n’est pas persistée par tour')
  })

  it('#3861 (Q13) — sans tour qui porte le champ, le repli se dit « non mesuré », jamais 0 %', async () => {
    fetchReport.mockResolvedValue(rapport({ capabilityFallbackRate: absente }))
    const html = await rendu()
    expect(html).toContain('Taux de repli IA')
    expect(html).not.toMatch(/>0 %</)
  })
})
