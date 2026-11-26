import { describe, expect, it } from 'vitest'
import { signalNature, signalsNotCoveredByLeads } from './lineNature'
import type { WatchSignal } from './watch'

const sig = (over: Partial<WatchSignal>): WatchSignal => ({
  id: 's',
  category: 'budget',
  date: '2026-09-04',
  freshness: 'current',
  temporalStatus: 'RECENT',
  type: 'Budget',
  signal: 'Budget cloud annoncé',
  source: 'Les Echos',
  angles: [],
  actionGate: { allowed: true },
  tags: [],
  perimeter: 'ACME',
  ...over,
})

describe('signalNature — #3676.6 : la nature de la ligne, en français simple', () => {
  it('un signal courant est un signal récent', () => {
    expect(signalNature(sig({}))).toBe('recentSignal')
  })
  it('une archive ou un statut périmé est de l’historique', () => {
    expect(signalNature(sig({ freshness: 'archive', temporalStatus: 'HISTORICAL' }))).toBe('history')
    expect(signalNature(sig({ freshness: 'archive', temporalStatus: 'STALE' }))).toBe('history')
  })
  it('⚠️ un signal non daté ne se dit ni récent ni historique : aucune nature', () => {
    expect(signalNature(sig({ freshness: 'undated', temporalStatus: 'UNDATED', date: '' }))).toBeNull()
  })
})

// #3995 revient sur #3676.6 pour la LISTE (elle montre tout) ; `signalsNotCoveredByLeads` ne sert plus qu'à
// dédoublonner « Ce que cela implique commercialement » (insights) et à repérer les signaux « En piste ».
describe('signalsNotCoveredByLeads — #3676 : un même fait = une seule ligne dans les insights', () => {
  const lead = [{ label: 'Budget  Cloud annoncé !', observed_on: '2026-09-04T08:00:00Z' }]
  it('un signal que dit déjà une piste (même texte, même jour) ne fait pas une seconde ligne', () => {
    expect(signalsNotCoveredByLeads([sig({ id: 'a' })], lead)).toEqual([])
  })
  // #3676 (réfuté prod 07/10) — la date de détection de la piste (02/10) n'est jamais celle du fait
  // publié (21/09) : le libellé normalisé (casse, espaces, tirets) suffit à rapprocher.
  it('#3676 — même libellé à une AUTRE date, casse/espaces/tirets différents : une seule ligne', () => {
    const feuille = [{ label: 'Feuille de route 2026-2029', observed_on: '2026-10-02T08:00:00Z' }]
    const signal = sig({ id: 'f', date: '2026-09-21', signal: ' feuille  de ROUTE 2026–2029 ' })
    expect(signalsNotCoveredByLeads([signal], feuille)).toEqual([])
  })
  it('sait dire NON : autre texte, le signal reste (même à la même date)', () => {
    const kept = [sig({ id: 'c', signal: 'Levée de fonds' }), sig({ id: 'e', signal: 'Budget cloud réduit' })]
    expect(signalsNotCoveredByLeads(kept, lead)).toHaveLength(2)
  })
  it('sans piste, rien ne bouge', () => {
    const all = [sig({ id: 'a' })]
    expect(signalsNotCoveredByLeads(all, [])).toBe(all)
  })
})
