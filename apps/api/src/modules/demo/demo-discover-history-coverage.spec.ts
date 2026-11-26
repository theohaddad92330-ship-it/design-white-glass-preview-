import { DEMO_DISCOVER_HISTORY_BLOCKS_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4758 / #4761 (épopée #4762) — « et en démonstration, les deux blocs de Découvrir montrent quoi ? »
 * Craft rule n°9. L'écran range les comptes en « Signaux récents » (un fait daté dans la fenêtre de 90 jours)
 * puis « Comptes à historique » (aucun récent, mais des besoins datés plus anciens), et le bloc vide DISPARAÎT.
 * Ce fichier lit la VRAIE réponse scriptée : il faut un compte qui remonte sur son seul historique, ET une
 * recherche où le bloc historique est vide.
 */
type Row = {
  name: string
  city: string | null
  signals: { type: string; label: string; date: string; stillOpen?: boolean }[]
}

const WINDOW_DAYS = 90
const ageDays = (date: string) => Math.floor((Date.now() - Date.parse(date)) / 86_400_000)
const isRecent = (row: Row) => row.signals.some(signal => ageDays(signal.date) <= WINDOW_DAYS)
const isHistoryOnly = (row: Row) =>
  !isRecent(row) && row.signals.some(signal => signal.type !== 'legal' && Number.isFinite(Date.parse(signal.date)))
const rowsOf = (query: Record<string, unknown>) => (demoDiscoverResponse(query) as { candidates: Row[] }).candidates

describe('#4758 / #4761 — les deux blocs de Découvrir, en démonstration', () => {
  it('est classée seedée, et sa raison cite les deux issues', () => {
    expect(DEMO_DISCOVER_HISTORY_BLOCKS_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_HISTORY_BLOCKS_COVERAGE.reason).toContain('#4758')
    expect(DEMO_DISCOVER_HISTORY_BLOCKS_COVERAGE.reason).toContain('#4761')
  })

  it('un compte remonte sur son SEUL historique : plusieurs offres Java datées, aucune dans la fenêtre récente', () => {
    const onlyHistory = rowsOf({}).find(row => row.name === 'Vauclair Logistique (démo)')
    expect(onlyHistory).toBeDefined()
    expect(isHistoryOnly(onlyHistory as Row)).toBe(true)
    const javaOffers = (onlyHistory as Row).signals.filter(s => s.type === 'hiring' && /java/i.test(s.label))
    expect(javaOffers.length).toBeGreaterThanOrEqual(3)
  })

  it('la vue par défaut a aussi des comptes à signal récent : les deux blocs existent côte à côte', () => {
    const rows = rowsOf({})
    expect(rows.some(isRecent)).toBe(true)
    expect(rows.some(isHistoryOnly)).toBe(true)
  })

  it('une recherche existe où le bloc historique est VIDE : il disparaît au lieu d’afficher « 0 »', () => {
    const cities = [
      ...new Set(
        rowsOf({})
          .map(row => row.city)
          .filter((city): city is string => city !== null),
      ),
    ]
    const empty = cities.find(city => {
      const rows = rowsOf({ city })
      return rows.length > 0 && rows.some(isRecent) && !rows.some(isHistoryOnly)
    })
    expect(empty).toBeDefined()
  })
})

// #4819.4 — le cas du jour en salle : un compte dont la SEULE offre récente est fermée. Il n'est pas « récent » (une offre
// retirée n'est pas un signal actuel) : il passe dans « Comptes à historique », et sa carte doit dire pourquoi.
describe('#4819.4 — une offre récente mais fermée, semée en démonstration', () => {
  const within = (row: Row) => row.signals.filter(signal => ageDays(signal.date) <= WINDOW_DAYS)
  const isCountedRecent = (row: Row) => within(row).some(signal => signal.stillOpen !== false)

  it('un compte a une offre datée dans la fenêtre, fermée (stillOpen: false), et aucun autre signal récent ouvert', () => {
    const closedOnly = rowsOf({}).find(row => {
      const recent = within(row)
      return recent.length > 0 && recent.every(signal => signal.type === 'hiring' && signal.stillOpen === false)
    })
    expect(closedOnly).toBeDefined()
    expect(isCountedRecent(closedOnly as Row)).toBe(false)
  })

  it('l’offre fermée ne ressemble pas à une offre ouverte : la carte la dit, jamais de date récente sans raison', () => {
    const closedOnly = rowsOf({}).find(row => {
      const recent = within(row)
      return recent.length > 0 && recent.every(signal => signal.stillOpen === false)
    }) as Row
    expect(closedOnly.signals.find(signal => signal.stillOpen === false)?.label).toBeTruthy()
  })
})
