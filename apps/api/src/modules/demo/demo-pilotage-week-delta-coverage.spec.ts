import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROJECT_STAGES, stageOrder, type ProjectStage } from '@bellum/contracts'
import { COMMERCIAL_BRIEF_BY_COMPANY } from './commercial-brief-seed'
import { DEMO_PILOTAGE_WEEK_DELTA_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS, DEMO_PILOTAGE_WEEK_MOVES, demoPilotageRecentPayments } from './demo-dataset'

/**
 * Refonte Pilotage L1 (craft rule 9) — la salle de démonstration montre un
 * Cockpit RICHE : les cinq catégories d'opportunités, les règlements et les
 * missions qui finissent ne sont pas à zéro devant un prospect.
 */
const WEEK = 7
const DAY = 86_400_000

type Step = { to: string; days_ago: number }

/** La catégorie que le dernier pas du parcours produit — la MÊME règle que `WeekDeltaService`. */
function categoryOf(path: readonly Step[]): 'created' | 'advanced' | 'regressed' | 'lost' | 'won' {
  const last = path[path.length - 1]!
  const before = path[path.length - 2]
  if (last.to === 'won') return 'won'
  if (last.to === 'lost') return 'lost'
  if (!before) return 'created'
  return stageOrder(last.to as ProjectStage) > stageOrder(before.to as ProjectStage) ? 'advanced' : 'regressed'
}

describe('démo — le Cockpit « ce qui a bougé » est riche (refonte Pilotage L1)', () => {
  it('chaque catégorie d’opportunités a au moins une affaire dans les sept derniers jours', () => {
    const counts = new Map<string, number>()
    for (const move of DEMO_PILOTAGE_WEEK_MOVES) {
      const last = move.path[move.path.length - 1]!
      expect(last.days_ago).toBeGreaterThanOrEqual(0)
      expect(last.days_ago).toBeLessThan(WEEK)
      counts.set(categoryOf(move.path), (counts.get(categoryOf(move.path)) ?? 0) + 1)
    }
    for (const category of ['created', 'advanced', 'regressed', 'lost', 'won']) {
      expect([category, counts.get(category) ?? 0]).not.toEqual([category, 0])
    }
  })

  it('les parcours sont ordonnés dans le temps (du plus ancien au plus récent) et n’utilisent que des stades connus', () => {
    for (const move of DEMO_PILOTAGE_WEEK_MOVES) {
      const days = move.path.map(step => step.days_ago)
      expect({ label: move.label, days: [...days].sort((a, b) => b - a) }).toEqual({ label: move.label, days })
      for (const step of move.path) expect(PROJECT_STAGES as readonly string[]).toContain(step.to)
      // Seul le dernier pas est dans la semaine : les précédents ne gonflent pas les compteurs.
      for (const step of move.path.slice(0, -1))
        expect({ label: move.label, ok: step.days_ago >= WEEK }).toEqual({ label: move.label, ok: true })
    }
  })

  it('les comptes sont ceux des briefs de la salle, noms complets — pas un compte fictif', () => {
    const dossierNames = new Set(DEMO_DOSSIERS.map(dossier => dossier.account.company_name))
    for (const move of DEMO_PILOTAGE_WEEK_MOVES) {
      expect({ account: move.account, known: dossierNames.has(move.account) }).toEqual({
        account: move.account,
        known: true,
      })
      expect({ account: move.account, briefed: move.account in COMMERCIAL_BRIEF_BY_COMPANY }).toEqual({
        account: move.account,
        briefed: true,
      })
      expect(move.account.toLowerCase()).not.toContain('exemple')
    }
  })

  it('la salle porte aussi une affaire SANS montant saisi — jamais 0 €', () => {
    expect(DEMO_PILOTAGE_WEEK_MOVES.some(move => move.amount_cents === null)).toBe(true)
  })

  it('les règlements tombent dans les cinq derniers jours, quel que soit le jour de la visite', () => {
    // Le 20 du mois : la facture (le 2) précède tous les règlements.
    const visit = Date.UTC(2026, 9, 20, 10)
    const payments = demoPilotageRecentPayments(visit)
    expect(payments).toHaveLength(3)
    for (const payment of payments) {
      const age = (visit - new Date(payment.paidAt).getTime()) / DAY
      expect(age).toBeGreaterThan(0)
      expect(age).toBeLessThanOrEqual(5)
      expect(new Date(payment.paidAt).getTime()).toBeGreaterThan(new Date(payment.invoicedAt).getTime())
      expect(payment.invoicedAmountCents).not.toBeNull()
    }
  })

  it('le 1er du mois, un règlement antérieur à sa facture n’est pas semé', () => {
    const visit = Date.UTC(2026, 9, 1, 10)
    expect(demoPilotageRecentPayments(visit)).toEqual([])
  })

  it('le semis écrit les affaires, leur journal et les règlements', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toContain('DEMO_PILOTAGE_WEEK_MOVES')
    expect(source).toMatch(/seedPilotageWeekMoves\(/)
    expect(source).toMatch(/seedPilotageRecentPayments\(/)
    expect(source).toContain("'opportunity', $2")
  })

  it('est classée SEEDÉE dans demo-coverage, avec sa raison', () => {
    expect(DEMO_PILOTAGE_WEEK_DELTA_COVERAGE.state).toBe('seede')
    expect(DEMO_PILOTAGE_WEEK_DELTA_COVERAGE.reason).toContain('Refonte Pilotage L1')
  })
})
