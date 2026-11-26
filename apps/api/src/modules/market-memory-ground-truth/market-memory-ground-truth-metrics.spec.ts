import { MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS, type MarketMemoryGroundTruthLabel } from '@bellum/contracts'
import type { MarketMemoryGroundTruthJudgmentEntity } from '../../database/entities/market-memory-ground-truth-judgment.entity'
import { computeMarketMemoryGroundTruthMetrics } from './market-memory-ground-truth-metrics'

// #1622 — le test qui compte le plus dans ce lot : sur un corpus VIDE, aucune
// des six métriques ne doit rendre un pourcentage. Le piège que ce lot nomme
// explicitement : un `0.0 %` de faux positifs sur zéro jugement se LIT « tout
// va bien » et VEUT DIRE « personne n'a regardé ».

function row(partial: Partial<MarketMemoryGroundTruthJudgmentEntity>): MarketMemoryGroundTruthJudgmentEntity {
  return {
    id: partial.id ?? 'id',
    caseKey: partial.caseKey ?? 'case',
    accountName: partial.accountName ?? 'Compte',
    accountWebsite: partial.accountWebsite ?? null,
    accountCountry: partial.accountCountry ?? null,
    esnName: partial.esnName ?? 'ESN',
    hadReading: partial.hadReading ?? true,
    readingRank: partial.readingRank ?? 1,
    readingPersons: partial.readingPersons ?? 10,
    readingCertainty: partial.readingCertainty ?? 'forte',
    label: (partial.label ?? 'useful_and_correct') as MarketMemoryGroundTruthLabel,
    judgedBy: partial.judgedBy ?? 'operateur@bellum.fr',
    judgedAt: partial.judgedAt ?? new Date('2026-09-11T00:00:00Z'),
  }
}

describe('computeMarketMemoryGroundTruthMetrics', () => {
  it('sur un corpus VIDE, les six métriques sont toutes non mesurées — jamais un pourcentage', () => {
    const metrics = computeMarketMemoryGroundTruthMetrics([])

    for (const name of Object.keys(metrics) as (keyof typeof metrics)[]) {
      expect(metrics[name].status).toBe('insufficient_data')
      // ⚠️ Aucun champ `value` ne doit exister dans cette branche : c'est le
      // TYPE qui retire le moyen d'afficher un pourcentage par erreur, pas
      // une discipline de lecture qu'un futur écran pourrait oublier.
      expect('value' in metrics[name]).toBe(false)
    }
    expect(metrics.coverage).toEqual({
      status: 'insufficient_data',
      judgmentsCount: 0,
      required: MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS,
    })
  })

  it('sous le seuil global mais AVEC des jugements, reste non mesuré (pas de division par zéro qui passerait inaperçue)', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ id: String(i), label: 'useful_and_correct' }))
    const metrics = computeMarketMemoryGroundTruthMetrics(rows)
    expect(metrics.human_usefulness.status).toBe('insufficient_data')
    expect(metrics.coverage.status).toBe('insufficient_data')
  })

  it('au-dessus du seuil, human_usefulness et entity_resolution_failure comptent chaque label séparément', () => {
    const labels: MarketMemoryGroundTruthLabel[] = [
      ...Array(10).fill('useful_and_correct'),
      ...Array(4).fill('plausible'),
      ...Array(3).fill('wrong_entity'),
      ...Array(2).fill('misleading'),
      ...Array(1).fill('irrelevant'),
      ...Array(2).fill('unknown'),
    ]
    const rows = labels.map((label, i) => row({ id: String(i), label, hadReading: true, readingRank: 20 }))
    // 22 jugements — au-dessus du seuil de 20.
    const metrics = computeMarketMemoryGroundTruthMetrics(rows)

    expect(metrics.human_usefulness).toEqual({ status: 'measured', value: 10 / 22, judgmentsCount: 22 })
    expect(metrics.entity_resolution_failure).toEqual({ status: 'measured', value: 3 / 22, judgmentsCount: 22 })
    // wrong_entity (3) + misleading (2) = 5 faux positifs sur 22.
    expect(metrics.false_positive_rate).toEqual({ status: 'measured', value: 5 / 22, judgmentsCount: 22 })
    // Toutes les lignes ont `hadReading: true` ⇒ couverture pleine.
    expect(metrics.coverage).toEqual({ status: 'measured', value: 1, judgmentsCount: 22 })
    // ⚠️ Ce total (22) n'est JAMAIS obtenu par soustraction (22 - fauxPositifs
    // - useful) : chaque compte ci-dessus vient d'un filtre direct sur le
    // label, et l'assertion suivante prouve qu'ils s'additionnent bien jusqu'au
    // total plutôt que de laisser `plausible`/`unknown` disparaître.
    expect(10 + 4 + 3 + 2 + 1 + 2).toBe(rows.length)
  })

  it('precision_at_3 et precision_at_10 ont chacune LEUR PROPRE dénominateur (les jugements de ce rang), pas le total du corpus', () => {
    // 25 jugements avec un rang > 10 (hors de portée des deux métriques de
    // précision), et seulement 2 avec un rang <= 3 : le corpus GLOBAL dépasse
    // le seuil, mais precision_at_3 doit rester non mesurée — sinon deux
    // jugements suffiraient à afficher un pourcentage à 50 % de swing.
    const farRows = Array.from({ length: 25 }, (_, i) => row({ id: `far-${i}`, hadReading: true, readingRank: 20 }))
    const closeRows = [
      row({ id: 'close-1', hadReading: true, readingRank: 1, label: 'useful_and_correct' }),
      row({ id: 'close-2', hadReading: true, readingRank: 2, label: 'misleading' }),
    ]
    const metrics = computeMarketMemoryGroundTruthMetrics([...farRows, ...closeRows])

    expect(metrics.precision_at_3.status).toBe('insufficient_data')
    if (metrics.precision_at_3.status === 'insufficient_data') {
      expect(metrics.precision_at_3.judgmentsCount).toBe(2)
    }
    // Le corpus global (27) dépasse pourtant le seuil pour les métriques dont
    // le dénominateur est bien le total.
    expect(metrics.human_usefulness.status).toBe('measured')
  })

  it('un cas sans lecture (`hadReading: false`) ne porte jamais de rang, et ne compte dans aucune des deux précisions', () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      row({ id: String(i), hadReading: false, readingRank: null, label: 'unknown' }),
    )
    const metrics = computeMarketMemoryGroundTruthMetrics(rows)
    expect(metrics.coverage).toEqual({ status: 'measured', value: 0, judgmentsCount: 21 })
    expect(metrics.precision_at_3.status).toBe('insufficient_data')
  })
})
