import type { EntityManager } from 'typeorm'
import { AccountsService } from './accounts.service'

/**
 * Incident 24/09 — une écriture FACULTATIVE n'annule plus l'analyse.
 *
 * `seedAccessFacts` et `seedDetectedPartners` tournent dans la transaction de
 * `saveResearch`. Leur échec était attrapé et averti — mais en Postgres, une
 * requête en erreur ABANDONNE toute la transaction : la requête suivante
 * (l'UPDATE de `applyResearch`) rendait « current transaction is aborted » et
 * l'analyse de SOPRA STERIA échouait pour un `observed_at = "None"`.
 *
 * Le faux ci-dessous joue cette sémantique : une erreur sur une connexion la
 * marque abandonnée, sauf si elle survient dans une transaction imbriquée
 * (SAVEPOINT), dont l'annulation laisse la transaction parente saine.
 */
class FakePgTx {
  aborted = false

  constructor(private readonly failOn: RegExp) {}

  query(sql: string): Promise<unknown> {
    if (this.aborted) {
      return Promise.reject(
        new Error('current transaction is aborted, commands ignored until end of transaction block'),
      )
    }
    if (this.failOn.test(sql)) {
      this.aborted = true
      return Promise.reject(new Error('invalid input syntax for type timestamp with time zone: "None"'))
    }
    return Promise.resolve([])
  }

  getRepository(): unknown {
    return {
      query: (sql: string) => this.query(sql),
      findOne: () => Promise.resolve({ id: 'a1', workspace_id: 'w1' }),
    }
  }

  // ROLLBACK TO SAVEPOINT : l'échec reste dans la transaction imbriquée.
  transaction<T>(work: (inner: EntityManager) => Promise<T>): Promise<T> {
    const inner = new FakePgTx(this.failOn)
    return work(inner as unknown as EntityManager)
  }
}

type Seeds = {
  seedAccessFacts(id: string, data: unknown, manager?: EntityManager): Promise<void>
  seedDetectedPartners(id: string, data: unknown, manager?: EntityManager): Promise<void>
}

function service(): Seeds {
  const svc = new AccountsService({} as never, {} as never, {} as never, {} as never, undefined, undefined, undefined)
  return svc as unknown as Seeds
}

describe('une écriture facultative ne fait pas échouer la transaction (incident 24/09)', () => {
  it('seedAccessFacts en échec laisse la suite de la transaction passer', async () => {
    const tx = new FakePgTx(/INSERT INTO access_facts/)
    const data = { awardedContracts: [{ winner: 'Sopra Steria', notifiedDate: '2026-01-15' }] }
    await service().seedAccessFacts('a1', data, tx as unknown as EntityManager)
    await expect(tx.query('UPDATE accounts SET status = $1')).resolves.toEqual([])
  })

  it('seedDetectedPartners en échec laisse la suite de la transaction passer', async () => {
    const tx = new FakePgTx(/INSERT INTO account_partners/)
    const data = { esnPresence: [{ name: 'Capgemini', certainty: 'forte', detectedAt: '2026-08-22' }] }
    await service().seedDetectedPartners('a1', data, tx as unknown as EntityManager)
    await expect(tx.query('UPDATE accounts SET status = $1')).resolves.toEqual([])
  })

  it('le faux sait dire NON : une erreur hors SAVEPOINT abandonne la transaction', async () => {
    const tx = new FakePgTx(/INSERT/)
    await expect(tx.query('INSERT INTO access_facts')).rejects.toThrow('None')
    await expect(tx.query('UPDATE accounts')).rejects.toThrow('aborted')
  })
})
