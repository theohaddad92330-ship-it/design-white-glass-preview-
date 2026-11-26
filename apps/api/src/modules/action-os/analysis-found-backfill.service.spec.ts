import type { ContactEntity } from '../../database/entities/contact.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { AnalysisFoundBackfillService } from './analysis-found-backfill.service'
import { inMemoryRepository } from './testing/in-memory-repository'

/**
 * #3416.x2 — « un correctif de collecte RATTRAPE l'existant » : les analyses
 * réglées avant `CardResult.analysisFound` (ex. Thales) le reçoivent, CIBLÉES
 * (analyses de compte réussies sans le champ), idempotentes, simulées d'abord.
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const OTHER_WS = '7a0c2f10-0000-4000-8000-000000000009'
const KEY = 'card_account_analysis'

function harness() {
  const runs = inMemoryRepository<WorkflowRunEntity>()
  const contacts = inMemoryRepository<ContactEntity>()
  const service = new AnalysisFoundBackfillService(runs as never, contacts as never)
  const run = (over: Record<string, unknown>) => {
    runs.rows.push({
      id: `run-${runs.rows.length + 1}`,
      workspace_id: WS,
      definition_key: KEY,
      status: 'done',
      account_id: 'acc-1',
      result: { outcome: 'Analyse terminée' },
      ...over,
    } as unknown as WorkflowRunEntity)
  }
  const contact = (over: Record<string, unknown>) => {
    contacts.rows.push({
      id: `c-${contacts.rows.length + 1}`,
      workspace_id: WS,
      account_id: 'acc-1',
      deleted_at: null,
      hidden: false,
      email_verified: false,
      ...over,
    } as unknown as ContactEntity)
  }
  return { service, runs, run, contact }
}

describe('AnalysisFoundBackfillService (#3416.x2)', () => {
  it('simulation : compte ce qui serait rattrapé et n’écrit RIEN', async () => {
    const { service, runs, run, contact } = harness()
    run({})
    contact({ email_verified: true })
    contact({})
    const outcome = await service.run(WS, { dryRun: true })
    expect(outcome).toMatchObject({ dryRun: true, candidates: 1, updated: 0, wouldUpdate: 1 })
    expect((runs.rows[0].result as { analysisFound?: unknown }).analysisFound).toBeUndefined()
  })

  it('réel : écrit contacts trouvés / e-mails vérifiés depuis la base, sans toucher au reste du résultat', async () => {
    const { service, runs, run, contact } = harness()
    run({})
    contact({ email_verified: true })
    contact({})
    contact({ hidden: true, email_verified: true })
    contact({ deleted_at: new Date() })
    const outcome = await service.run(WS, { dryRun: false })
    expect(outcome).toMatchObject({ dryRun: false, updated: 1 })
    expect(runs.rows[0].result).toEqual({
      outcome: 'Analyse terminée',
      analysisFound: { contacts: 2, verifiedEmails: 1 },
    })
  })

  it('idempotent : un second passage ne trouve plus rien à faire', async () => {
    const { service, run, contact } = harness()
    run({})
    contact({})
    await service.run(WS, { dryRun: false })
    expect(await service.run(WS, { dryRun: false })).toMatchObject({ candidates: 0, updated: 0 })
  })

  it('CIBLÉ : ni autre espace, ni analyse non réussie, ni autre carte, ni run déjà doté — il sait dire NON', async () => {
    const { service, runs, run, contact } = harness()
    contact({})
    run({ workspace_id: OTHER_WS })
    run({ status: 'failed' })
    run({ definition_key: 'card_prepare_message' })
    run({ result: { outcome: 'x', analysisFound: { contacts: 5, verifiedEmails: 5 } } })
    run({ account_id: null })
    const outcome = await service.run(WS, { dryRun: false })
    expect(outcome).toMatchObject({ candidates: 0, updated: 0 })
    expect(
      runs.rows.every(
        row => (row.result as { analysisFound?: { contacts: number } } | null)?.analysisFound?.contacts !== 1,
      ),
    ).toBe(true)
  })

  it('un compte sans contact reste SANS analysisFound — jamais un zéro', async () => {
    const { service, runs, run } = harness()
    run({})
    const outcome = await service.run(WS, { dryRun: false })
    expect(outcome).toMatchObject({ candidates: 1, updated: 0, withoutContacts: 1 })
    expect((runs.rows[0].result as { analysisFound?: unknown }).analysisFound).toBeUndefined()
  })
})
