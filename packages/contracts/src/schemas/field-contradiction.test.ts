import { describe, expect, it } from 'vitest'
import {
  contradictsConfirmedFact,
  FIELD_CONTRADICTION_SOURCES,
  visibleFieldContradictions,
  type FieldContradiction,
} from './field-contradiction.js'
import { FIELD_SOURCES } from './provenance.js'

// #4016.L13 — « fait confirmé jusqu'à preuve contraire ».
describe('contradictsConfirmedFact — une source automatique contredit un fait confirmé à la main', () => {
  const base = {
    field: 'email',
    currentValue: 'jean.dupont@acme.fr',
    currentSource: 'human' as const,
    currentObservedAt: '2026-10-01T10:00:00.000Z',
    incomingValue: 'j.dupont@acme.fr',
    incomingSource: 'pipeline' as const,
    incomingAt: '2026-10-10T10:00:00.000Z',
  }

  it('vrai quand le pipeline dit autre chose qu’une valeur humaine', () => {
    expect(contradictsConfirmedFact(base)).toBe(true)
  })

  it('vrai aussi pour un connecteur ou un modèle', () => {
    expect(contradictsConfirmedFact({ ...base, incomingSource: 'connector' })).toBe(true)
    expect(contradictsConfirmedFact({ ...base, incomingSource: 'model' })).toBe(true)
  })

  it('sait dire NON : la valeur en place n’est pas confirmée à la main', () => {
    expect(contradictsConfirmedFact({ ...base, currentSource: 'pipeline' })).toBe(false)
    expect(contradictsConfirmedFact({ ...base, currentSource: null })).toBe(false)
  })

  it('sait dire NON : une estimation ne contredit pas un fait, un humain le CORRIGE', () => {
    expect(contradictsConfirmedFact({ ...base, incomingSource: 'inferred' })).toBe(false)
    expect(contradictsConfirmedFact({ ...base, incomingSource: 'human' })).toBe(false)
  })

  it('sait dire NON : un blanc ou la même valeur ne contredit rien', () => {
    expect(contradictsConfirmedFact({ ...base, incomingValue: '  ' })).toBe(false)
    expect(contradictsConfirmedFact({ ...base, incomingValue: ' jean.dupont@acme.fr ' })).toBe(false)
  })

  it('les sources qui contredisent sont les sources automatiques OBSERVÉES', () => {
    expect([...FIELD_CONTRADICTION_SOURCES]).toEqual(
      FIELD_SOURCES.filter(source => source !== 'human' && source !== 'inferred'),
    )
  })
})

describe('visibleFieldContradictions — la contradiction se NOMME à côté, jamais à la place', () => {
  const row = (over: Partial<FieldContradiction> = {}): FieldContradiction => ({
    field: 'email',
    value: 'j.dupont@acme.fr',
    source: 'pipeline',
    observedAt: '2026-10-10T10:00:00.000Z',
    ...over,
  })
  const confirmed = { email: { source: 'human' as const, observedAt: '2026-10-01T10:00:00.000Z' } }

  it('montre la contradiction tant que le fait confirmé tient', () => {
    expect(visibleFieldContradictions([row()], confirmed)).toEqual([row()])
  })

  it('une correction humaine POSTÉRIEURE gagne : la contradiction tombe', () => {
    const recorrected = { email: { source: 'human' as const, observedAt: '2026-10-12T09:00:00.000Z' } }
    expect(visibleFieldContradictions([row()], recorrected)).toEqual([])
  })

  it('un champ qui n’est plus confirmé à la main n’affiche rien (plus de fait à défendre)', () => {
    expect(
      visibleFieldContradictions([row()], { email: { source: 'pipeline', observedAt: '2026-10-11T00:00:00Z' } }),
    ).toEqual([])
    expect(visibleFieldContradictions([row()], {})).toEqual([])
  })

  it('une seule ligne par champ : la plus récente', () => {
    const older = row({ value: 'jd@acme.fr', observedAt: '2026-10-05T10:00:00.000Z' })
    expect(visibleFieldContradictions([older, row()], confirmed)).toEqual([row()])
    expect(visibleFieldContradictions([row(), older], confirmed)).toEqual([row()])
  })
})
