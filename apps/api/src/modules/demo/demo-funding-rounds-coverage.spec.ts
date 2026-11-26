import { DEMO_FUNDING_ROUNDS_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4735.6 (craft rule n°9) — la source de levées de fonds se VOIT en salle : au moins un compte porte un tour daté, lié,
 * au montant tel que publié, sans jamais nommer le fournisseur. Société fictive « (exemple) » : un tour de table
 * affirmé sur une entreprise réelle serait un fait faux.
 */
type Signal = { signal?: string; source?: string; type?: string; date?: string; url?: string; detail?: string }
const fundingSignals = (): { account: string; signal: Signal }[] =>
  DEMO_DOSSIERS.flatMap(d =>
    ((d.account.recent_signals ?? []) as unknown as Signal[])
      .filter(s => s.type === 'levee_fonds')
      .map(signal => ({ account: d.account.company_name, signal })),
  )

describe('#4735.6 — la levée de fonds dans la salle démo', () => {
  it('est classée seedée, avec une raison écrite', () => {
    expect(DEMO_FUNDING_ROUNDS_COVERAGE.state).toBe('seede')
    expect(DEMO_FUNDING_ROUNDS_COVERAGE.reason).toContain('#4735')
    expect(DEMO_FUNDING_ROUNDS_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('au moins un compte porte une levée (le compte de comptes qui en portent est lu, jamais supposé)', () => {
    expect(new Set(fundingSignals().map(f => f.account)).size).toBeGreaterThan(0)
  })

  it('SAIT DIRE NON — date COMPLÈTE, lien http(s), montant avec sa devise publiée, source jamais nommée', () => {
    for (const { signal } of fundingSignals()) {
      expect(signal.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(signal.url).toMatch(/^https:\/\//)
      expect(signal.signal).toMatch(/\b(EUR|USD|GBP|CHF)\b/)
      expect(`${signal.signal} ${signal.source} ${signal.detail ?? ''}`).not.toMatch(/crunchbase/i)
    }
  })
})
