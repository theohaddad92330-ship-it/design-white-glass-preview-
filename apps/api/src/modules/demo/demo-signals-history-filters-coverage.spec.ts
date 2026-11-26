import { DEMO_SIGNALS_HISTORY_FILTERS_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4756 — « et en démonstration, un croisement techno × zone rend-il un résultat ? » (craft rule n°9).
 *
 * Le croisement se calcule à l'écran (`applyHistoryFilters`, web) : ce fichier prouve que la DONNÉE semée le permet —
 * sur le premier compte du jeu hors SNCF, dont le tableau `job_offers` reste intact (deux lots y avaient déjà semé).
 */
type Signal = {
  signal: string
  type?: string
  date?: string
  freshness?: string
  location?: string
  offer_attachment?: { status: string; skills: string[]; job_family: string | null }
}
const FIRST_ACCOUNT_OUTSIDE_SNCF = DEMO_DOSSIERS.find(d => d.account.company_name !== 'SNCF')!
const signals = (FIRST_ACCOUNT_OUTSIDE_SNCF.account.recent_signals ?? []) as unknown as Signal[]
const pastOffers = signals.filter(s => s.type === 'recrutement' && s.freshness === 'archive')
const javaInLille = pastOffers.filter(
  s => s.offer_attachment?.skills.includes('Java') && /^Lille\b/.test(s.location ?? ''),
)

const MONTH_MS = 30.4375 * 24 * 60 * 60 * 1000
const SEED_MOMENT = Date.parse('2026-10-28')
const periodOf = (date: string): string => {
  const age = (SEED_MOMENT - Date.parse(date)) / MONTH_MS
  return age < 6 ? 'under6m' : age < 12 ? '6to12m' : age < 24 ? '12to24m' : 'over24m'
}

describe('#4756 — recherche et filtres croisés de l’Historique, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_SIGNALS_HISTORY_FILTERS_COVERAGE.state).toBe('seede')
    expect(DEMO_SIGNALS_HISTORY_FILTERS_COVERAGE.reason).toContain('#4756')
  })

  it('le semis est posé sur le premier compte hors SNCF, jamais dans les offres de SNCF', () => {
    expect(FIRST_ACCOUNT_OUTSIDE_SNCF.account.company_name).toBe('Société Générale')
    expect(pastOffers.length).toBeGreaterThanOrEqual(5)
  })

  it('« Java à Lille » rend un résultat : trois offres, trois tranches de période différentes', () => {
    expect(javaInLille).toHaveLength(3)
    expect(new Set(javaInLille.map(s => periodOf(s.date ?? ''))).size).toBe(3)
  })

  it('sait dire NON : Java à Paris ne rend rien, et une offre Lille n’est pas une offre Paris', () => {
    const javaInParis = pastOffers.filter(
      s => s.offer_attachment?.skills.includes('Java') && /^Paris\b/.test(s.location ?? ''),
    )
    expect(javaInParis).toHaveLength(0)
    expect(pastOffers.some(s => /^Paris\b/.test(s.location ?? ''))).toBe(true)
  })

  it('chaque offre passée porte un lieu, des compétences et une date lisible (jamais « 0 », jamais deviné)', () => {
    for (const offer of pastOffers.filter(s => s.location)) {
      expect(offer.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(offer.offer_attachment?.status).toBe('attached')
      expect(offer.offer_attachment?.skills.length).toBeGreaterThan(0)
    }
  })

  it('les offres semées ici sont toutes passées de plus de 90 jours (aucune ne se fait passer pour le signal du jour)', () => {
    for (const offer of pastOffers.filter(s => s.location)) {
      expect(SEED_MOMENT - Date.parse(offer.date ?? '')).toBeGreaterThan(90 * 24 * 60 * 60 * 1000)
    }
  })
})
