import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'
import { DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #2967 (lot V39) — l'onglet Historique d'un besoin lit désormais le journal
 * `commercial_transitions` : la table est SEEDÉE, et cette garde prouve que
 * la salle y montre au moins une vraie transition (pas seulement des
 * naissances) et la source `laura` que l'écran nomme.
 */
describe('commercial_transitions en démo (#2967)', () => {
  const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('est classée seedée, et le semis l’écrit réellement', () => {
    expect(DEMO_SEEDED_TABLES).toContain('commercial_transitions')
    expect(source).toContain('INSERT INTO commercial_transitions')
    expect(source).toContain('this.seedNeedStatusJournal(')
  })

  it('au moins un besoin ouvert a quitté `to_qualify` — une transition de→vers existe', () => {
    expect(DEMO_DELIVERY_CLIENT.openNeeds.some(need => need.status !== 'to_qualify')).toBe(true)
  })

  it('la première VRAIE transition semée porte la source `laura`, les suivantes `human`', () => {
    expect(source).toMatch(/source: lauraJournalPending && need\.status !== 'to_qualify' \? 'laura' : 'human'/)
  })
})
