import { routineKeySchema } from '@bellum/contracts'
import type { DataSource } from 'typeorm'
import { findRoutine } from './routine-catalog'
import { RoutineExecutors } from './routine-executors'
import { familyOfRoutine } from './routine-role-order'

/**
 * #2916 (#2399.2, LAU-FINAL-113) — « Signaler un compte sans prochaine
 * action », MODÈLE désactivé par défaut de la bibliothèque. Même patron que
 * `dormant-pool-resurface.spec.ts` : la REQUÊTE n'est pas recalculée ici —
 * elle appartient à `accounts/account-hygiene.sql.ts`
 * (`accountsWithoutNextActionCountSql`) et à ses propres gardes (GA-26, GA-53)
 * — seul l'EXÉCUTEUR est vérifié, plus le classement au catalogue.
 *
 * #3851 (lot W01, GA-07) — l'exécuteur interroge `dataSource` directement
 * (plus `DataHygieneService`, module `pilotage`) : le mock porte donc sur
 * `query`, pas sur un service injecté.
 */
function executorsWith(row: { n: string; total: string | null } | undefined): RoutineExecutors {
  const dataSource = { query: jest.fn().mockResolvedValue(row ? [row] : []) } as unknown as DataSource
  return new RoutineExecutors(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    dataSource,
  )
}

function executorsWithFailingQuery(): RoutineExecutors {
  const dataSource = { query: jest.fn().mockRejectedValue(new Error('connexion coupée')) } as unknown as DataSource
  return new RoutineExecutors(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    dataSource,
  )
}

const NOW = new Date('2026-10-07T09:00:00.000Z')

describe('accounts_without_next_action — l’exécuteur', () => {
  it('service absent (specs à constructeur nu) : elle se tait ET le dit', async () => {
    const executors = new RoutineExecutors(
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    )
    const out = await executors.run('accounts_without_next_action', 'u1', NOW, 'w1')
    expect(out.notified).toBe(false)
    expect(out.outcome).toContain('rien n’a été mesuré')
  })

  it('requête en échec (connexion coupée) : elle se tait ET le dit, jamais un faux zéro', async () => {
    const out = await executorsWithFailingQuery().run('accounts_without_next_action', 'u1', NOW, 'w1')
    expect(out.notified).toBe(false)
    expect(out.outcome).toContain('rien n’a été mesuré')
  })

  it('portefeuille propre (count 0) : elle se tait, comme un fait mesuré', async () => {
    const out = await executorsWith({ n: '0', total: '12' }).run('accounts_without_next_action', 'u1', NOW, 'w1')
    expect(out.notified).toBe(false)
    expect(out.outcome).toBe('Chaque compte suivi a une prochaine action.')
  })

  it('des comptes sans prochaine action : elle notifie et compte, sans rien envoyer', async () => {
    const out = await executorsWith({ n: '3', total: '12' }).run('accounts_without_next_action', 'u1', NOW, 'w1')
    expect(out.notified).toBe(true)
    expect(out.notification?.title).toContain('3')
    expect(out.notification?.body).toContain('3')
    expect(out.notification?.link).toBe('/accounts')
  })
})

describe('accounts_without_next_action — le catalogue', () => {
  it('est une clé du contrat, au catalogue, en famille commerciale, désactivée par défaut, et PRÉPARE sans envoyer', () => {
    expect(routineKeySchema.options).toContain('accounts_without_next_action')
    const def = findRoutine('accounts_without_next_action')
    expect(def).toBeDefined()
    expect(def?.automationLevel).toBe('n1_prepare')
    expect(def?.defaultEnabled).toBe(false)
    expect(familyOfRoutine('accounts_without_next_action')).toBe('commercial')
  })
})
