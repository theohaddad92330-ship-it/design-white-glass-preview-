import { DEMO_SIGNALS_HISTORY_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4755 — « et en démonstration, l'onglet Historique de /signals montre-t-il quelque chose ? » (craft rule n°9).
 *
 * Le rangement par compte est calculé à l'écran (`buildAccountHistory`) : ce fichier prouve que la DONNÉE semée le
 * permet — des offres de recrutement ARCHIVÉES, datées, avec leurs compétences, sur un compte de la salle.
 */
type Signal = {
  signal: string
  type?: string
  date?: string
  freshness?: string
  offer_attachment?: { status: string; skills: string[] }
}
const signalsOf = (company: string): Signal[] =>
  (DEMO_DOSSIERS.find(d => d.account.company_name === company)?.account.recent_signals ?? []) as unknown as Signal[]
const pastOffers = (company: string): Signal[] =>
  signalsOf(company).filter(s => s.type === 'recrutement' && s.freshness === 'archive')

describe('#4755 — l’onglet Historique de /signals, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_SIGNALS_HISTORY_COVERAGE.state).toBe('seede')
    expect(DEMO_SIGNALS_HISTORY_COVERAGE.reason).toContain('#4755')
  })

  it('SNCF porte au moins trois offres passées, datées, avec leurs compétences', () => {
    const offers = pastOffers('SNCF')
    expect(offers.length).toBeGreaterThanOrEqual(3)
    for (const offer of offers) {
      expect(offer.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(offer.offer_attachment?.status).toBe('attached')
      expect(offer.offer_attachment?.skills.length).toBeGreaterThan(0)
    }
    expect(offers.flatMap(offer => offer.offer_attachment?.skills ?? [])).toEqual(
      expect.arrayContaining(['Java', 'Spring']),
    )
  })

  it('sait dire NON : aucune offre passée ne se fait passer pour le signal du jour', () => {
    // Une offre archivée datée de moins de 90 jours serait « récente » à l'écran ET « passée » ici : on la refuse.
    const ninetyDaysBeforeSeed = Date.parse('2026-07-30')
    for (const offer of pastOffers('SNCF')) expect(Date.parse(offer.date ?? '')).toBeLessThan(ninetyDaysBeforeSeed)
  })
})
