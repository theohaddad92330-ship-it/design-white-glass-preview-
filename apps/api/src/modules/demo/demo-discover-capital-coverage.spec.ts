import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3941.5 (Louis 17/10, craft rule n°9) — « Augmentation de capital » est un critère de recherche du mode
 * Signaux : la salle démo le MONTRE, avec des données fictives. Le signal se dit « Augmentation de capital »,
 * daté, lié à une annonce ; jamais « levée » (on ne nomme pas ce qu'on ne sait pas), jamais un montant.
 */
type RawSignal = { type: string; label: string; date: string; url?: string; detail?: string }
type RawCandidate = { name: string; signals: RawSignal[] }

const capitalSignals = (): RawSignal[] =>
  (demoDiscoverResponse({}) as { candidates: RawCandidate[] }).candidates
    .flatMap(candidate => candidate.signals)
    .filter(signal => signal.label === 'Augmentation de capital')

describe('#3941.5 — l’augmentation de capital dans la salle démo', () => {
  it('au moins un compte de la vue par défaut porte une augmentation de capital DATÉE et liée', () => {
    const signals = capitalSignals()
    expect(signals.length).toBeGreaterThan(0)
    for (const signal of signals) {
      expect(signal.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(signal.url).toMatch(/^https:\/\/example\.org\//)
    }
  })

  it('SAIT DIRE NON — le signal ne dit jamais « levée » et n’affiche aucun montant', () => {
    for (const signal of capitalSignals()) {
      expect(`${signal.label} ${signal.detail ?? ''}`).not.toMatch(/lev[ée]e|€|\d/i)
    }
  })
})
