import type { QueryRunner } from 'typeorm'
import { CanonicalTriggerEventsWidenKinds1796322780200 } from '../1796322780200-CanonicalTriggerEventsWidenKinds'

/**
 * Le CLICHÉ des `canonicalTriggerKindValues` au moment DE CETTE migration —
 * jamais l'import live du paquet, qui grandit à chaque émetteur migré
 * (`1796342400000-CanonicalTriggerEventsWidenKindsReponsePositive.ts` en
 * ajoute un de plus). Une migration passée est un fait figé ; son témoin doit
 * l'être aussi, sinon chaque membre neuf casse une preuve qui n'a plus rien à
 * voir avec CE lot.
 */
const KINDS_AT_THIS_MIGRATION = [
  'duplicate_pair_detected',
  'submission_stalled',
  'renewal_at_risk',
  'invoicing_blocked',
  'account_untouched',
  'rep_inactive',
  'credits_exhausted',
  'account_no_next_action',
  'project_no_decision',
  'need_without_shortlist',
  'timesheet_missing',
  'payment_overdue',
  'mission_without_end_date',
  'staffing_collision',
  'credit_low',
  'ao_publie',
  'timesheet_chase',
  'invoice_readiness_routine',
  'margin_alert',
] as const

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

describe('CanonicalTriggerEventsWidenKinds1796322780200', () => {
  it('élargit le CHECK à TOUTES les valeurs de canonicalTriggerKindValues (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKinds1796322780200().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const kind of KINDS_AT_THIS_MIGRATION) {
      expect(flat).toContain(`'${kind}'`)
    }
  })

  it('retire la contrainte avant de la reposer — jamais deux CHECK en même temps', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKinds1796322780200().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS canonical_trigger_events_kind_check')
    expect(flat).toContain('ADD CONSTRAINT canonical_trigger_events_kind_check CHECK')
  })

  it('down() referme le CHECK sur la seule valeur d’origine — rejoue la migration initiale', async () => {
    const { runner, queries } = createRunner()
    await new CanonicalTriggerEventsWidenKinds1796322780200().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain("CHECK (kind IN ('duplicate_pair_detected'))")
  })
})
