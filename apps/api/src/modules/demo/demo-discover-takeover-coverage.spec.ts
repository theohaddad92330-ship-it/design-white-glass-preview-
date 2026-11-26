import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4732.1 (recette 01/11, craft rule n°9) — « Rachat ou fusion » est un critère de recherche du mode Signaux :
 * la salle démo le MONTRE, avec des données fictives, daté et lié, sans montant ni acquéreur nommé.
 */
type RawSignal = { type: string; label: string; date: string; url?: string; detail?: string }
type RawCandidate = { name: string; signals: RawSignal[] }

const takeoverSignals = (): RawSignal[] =>
  (demoDiscoverResponse({}) as { candidates: RawCandidate[] }).candidates
    .flatMap(candidate => candidate.signals)
    .filter(signal => signal.label === 'Rachat ou fusion')

describe('#4732.1 — le rachat ou la fusion dans la salle démo', () => {
  it('au moins un compte de la vue par défaut porte un rachat ou une fusion DATÉ et lié', () => {
    const signals = takeoverSignals()
    expect(signals.length).toBeGreaterThan(0)
    for (const signal of signals) {
      expect(signal.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(signal.url).toMatch(/^https:\/\/example\.org\//)
    }
  })

  it('SAIT DIRE NON — aucun montant dans le signal', () => {
    for (const signal of takeoverSignals()) {
      expect(`${signal.label} ${signal.detail ?? ''}`).not.toMatch(/€|\d/)
    }
  })
})
