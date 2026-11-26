import { describe, expect, it } from 'vitest'
import { guardAgainstCorrectedSignals } from './corrected-fact-guard.js'

const correction = (verdict: 'faux' | 'obsolete' | 'inutile' | 'utile', ref: string, at = '2026-09-01T10:00:00Z') => ({
  target: 'signal' as const,
  targetRef: ref,
  verdict,
  at,
})

describe('guardAgainstCorrectedSignals (#3671)', () => {
  it('un fait déclaré faux ne revient pas tel quel au prochain lancement', () => {
    const out = guardAgainstCorrectedSignals(
      [{ signal: 'Levée de fonds 20 M€', date: 'juin 2026' }, { signal: 'Nouveau DSI' }],
      [correction('faux', 'levée de fonds 20 m€')],
    )
    expect(out.kept.map(s => s.signal)).toEqual(['Nouveau DSI'])
    expect(out.suppressed).toEqual(['Levée de fonds 20 M€'])
  })

  it('un fait corrigé qui revient avec une date POSTÉRIEURE reste, marqué « à confirmer »', () => {
    const out = guardAgainstCorrectedSignals(
      [{ signal: 'Levée de fonds 20 M€', date: '2026-09-20' }],
      [correction('faux', 'Levée de fonds 20 M€')],
    )
    expect(out.suppressed).toEqual([])
    expect(out.kept[0]).toMatchObject({ signal: 'Levée de fonds 20 M€', toConfirm: true })
  })

  it('« inutile » est une préférence : le fait exact reste, sans drapeau', () => {
    const out = guardAgainstCorrectedSignals([{ signal: 'Nouveau DSI' }], [correction('inutile', 'Nouveau DSI')])
    expect(out.kept).toEqual([{ signal: 'Nouveau DSI' }])
    expect(out.suppressed).toEqual([])
  })

  it('un retour sur une autre surface (contact) ne retire aucun signal', () => {
    const out = guardAgainstCorrectedSignals(
      [{ signal: 'Nouveau DSI' }],
      [{ target: 'contact', targetRef: 'Nouveau DSI', verdict: 'faux', at: '2026-09-01T10:00:00Z' }],
    )
    expect(out.kept).toHaveLength(1)
  })

  it('sans correction, la liste est rendue inchangée (no-op strict)', () => {
    const list = [{ signal: 'A' }, { signal: 'B' }]
    expect(guardAgainstCorrectedSignals(list, []).kept).toEqual(list)
  })
})
