import { describe, expect, it } from 'vitest'
import { formatMetricFooter, formatMetricValue, LABEL_CAPTIONS, METRIC_CAPTIONS } from './verite-terrain.logic'
import {
  MARKET_MEMORY_GROUND_TRUTH_LABELS,
  MARKET_MEMORY_GROUND_TRUTH_METRIC_NAMES,
} from '@/lib/market-memory-ground-truth'

// #1622 — le test qui compte le plus : sur un corpus VIDE (insufficient_data),
// aucune valeur numérique n'est produite. Un `0.0 %` ici serait exactement le
// piège que ce lot nomme.
describe('formatMetricValue', () => {
  it('un corpus insuffisant ne rend AUCUNE valeur (jamais 0,0 %)', () => {
    expect(formatMetricValue({ status: 'insufficient_data', judgmentsCount: 0, required: 20 })).toBeNull()
    expect(formatMetricValue({ status: 'insufficient_data', judgmentsCount: 7, required: 20 })).toBeNull()
  })

  it('une métrique mesurée rend un pourcentage à une décimale', () => {
    expect(formatMetricValue({ status: 'measured', value: 0.25, judgmentsCount: 20 })).toBe('25.0 %')
    expect(formatMetricValue({ status: 'measured', value: 1 / 3, judgmentsCount: 24 })).toBe('33.3 %')
  })
})

describe('formatMetricFooter', () => {
  it('un corpus insuffisant dit COMBIEN manque, jamais « aucune donnée »', () => {
    expect(formatMetricFooter({ status: 'insufficient_data', judgmentsCount: 3, required: 20 })).toBe(
      'non mesuré — 3/20 jugements requis',
    )
  })

  it('une métrique mesurée dit sur combien de jugements', () => {
    expect(formatMetricFooter({ status: 'measured', value: 0.5, judgmentsCount: 20 })).toBe('sur 20 jugements')
    expect(formatMetricFooter({ status: 'measured', value: 1, judgmentsCount: 1 })).toBe('sur 1 jugement')
  })
})

describe('LABEL_CAPTIONS / METRIC_CAPTIONS', () => {
  it('portent UNE légende pour chacun des six labels — aucun oublié', () => {
    for (const label of MARKET_MEMORY_GROUND_TRUTH_LABELS) {
      expect(LABEL_CAPTIONS[label]).toBeTruthy()
    }
    expect(Object.keys(LABEL_CAPTIONS)).toHaveLength(6)
  })

  it('portent UNE légende pour chacune des six métriques — aucune oubliée', () => {
    for (const name of MARKET_MEMORY_GROUND_TRUTH_METRIC_NAMES) {
      expect(METRIC_CAPTIONS[name]).toBeTruthy()
    }
    expect(Object.keys(METRIC_CAPTIONS)).toHaveLength(6)
  })
})
