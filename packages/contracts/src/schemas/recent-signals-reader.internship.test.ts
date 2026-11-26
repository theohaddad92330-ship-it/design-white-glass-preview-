import { describe, expect, it } from 'vitest'
import { readRecentSignals } from './recent-signals-reader.js'

// Louis 12/10 + 14/10/2026 — aucune offre de STAGE dans les signaux, y compris
// celles DÉJÀ stockées : le lecteur unique de `recent_signals` les écarte.
describe('readRecentSignals — pas de stage (existant)', () => {
  it('écarte une offre de recrutement de stage, garde CDI et alternance', () => {
    const read = readRecentSignals([
      { type: 'recrutement', signal: 'Stage : Développeur Python', date: '2026-10-01' },
      { type: 'recrutement', signal: 'Stagiaire data analyst', date: '2026-10-01' },
      { type: 'recrutement', signal: 'Architecte cloud', date: '2026-10-02' },
      { type: 'recrutement', signal: 'Alternance - Développeur Java', date: '2026-10-03' },
    ])
    expect(read.map(s => s.label)).toEqual(['Architecte cloud', 'Alternance - Développeur Java'])
  })

  it('ne touche pas un signal qui n’est pas une offre (actualité) et garde l’index brut', () => {
    const read = readRecentSignals([
      { type: 'recrutement', signal: 'Stage : Ops', date: '2026-10-01' },
      { type: 'actualite', signal: 'Orange accueille 400 stagiaires', date: '2026-10-01' },
    ])
    expect(read).toHaveLength(1)
    expect(read[0]?.index).toBe(1)
  })
})
