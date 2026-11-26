import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * PR 12C — LA LISTE DES COMPTES, CÔTÉ API (#4497.a/.b, #4498.a).
 *
 * Le faux dépôt accumule chaque `andWhere` (SQL + paramètres) du PREMIER clone — celui du total de pagination —
 * et rend les lignes brutes qu'on lui donne : on lit donc ce que la requête FILTRE et ce que la ligne PORTE.
 */
type Clause = { sql: string; params: Record<string, unknown> }

function createFake(rows: Record<string, unknown>[] = []) {
  const clauses: Clause[] = []
  const selected: string[][] = []
  let firstClone: Clause[] | undefined
  const makeQb = (own: Clause[]) => {
    const qb = {
      where: (sql: string, params: Record<string, unknown> = {}) => {
        own.push({ sql, params })
        return qb
      },
      andWhere: (sql: string, params: Record<string, unknown> = {}) => {
        own.push({ sql, params })
        return qb
      },
      setParameter: () => qb,
      orderBy: () => qb,
      addOrderBy: () => qb,
      select: (cols: string[]) => {
        selected.push(cols)
        return qb
      },
      offset: () => qb,
      limit: () => qb,
      clone: () => {
        if (!firstClone) firstClone = [...own]
        return makeQb([...own])
      },
      getCount: async () => 0,
      getRawMany: async () => rows,
    }
    return qb
  }
  const accounts = createMockRepository<AccountEntity>() as MockRepository<AccountEntity>
  accounts.createQueryBuilder = jest.fn(() => makeQb(clauses)) as never
  accounts.manager = { query: async () => [] } as never
  const service = new AccountsService(accounts as never, {} as never, {} as never, {} as never)
  return {
    service,
    selected,
    get where(): Clause[] {
      return firstClone ?? clauses
    },
  }
}

const sqlOf = (clauses: Clause[]) => clauses.map(c => c.sql).join(' AND ')

describe('#4497.a — la ville du compte voyage avec la ligne', () => {
  it('sélectionne le siège inscrit au registre', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })
    expect(fake.selected.flat()).toContain('account.headquarters AS headquarters')
  })

  it('rend `headquarters` tel que stocké, et `null` quand il est absent (jamais une ville devinée)', async () => {
    const fake = createFake([
      { id: 'a1', company_name: 'Airbus', headquarters: '2 rond-point Émile Dewoitine, 31700 Blagnac' },
      { id: 'a2', company_name: 'Sans siège', headquarters: null },
    ])
    const page = await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })
    expect(page.data.map(a => a.headquarters)).toEqual(['2 rond-point Émile Dewoitine, 31700 Blagnac', null])
  })
})

describe('#4497.b — la recherche couvre le SUJET du compte (ses signaux), pas seulement le nom', () => {
  it('une saisie texte cherche aussi dans le libellé des signaux stockés', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { q: 'recrute', offset: 0 })
    const sql = sqlOf(fake.where)
    expect(sql).toContain('company_name ILIKE')
    expect(sql).toContain('jsonb_array_elements(')
    expect(sql).toContain("jsonb_typeof(account.recent_signals) = 'array'")
    expect(sql).toContain("s ->> 'signal'")
    expect(sql).toContain("s ->> 'title'")
  })

  it('la recherche reste bornée à l’espace : la borne workspace précède toujours le OR', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { q: 'recrute', offset: 0 })
    expect(fake.where[0]?.sql).toContain('account.workspace_id = :workspaceId')
    expect(fake.where[0]?.params).toMatchObject({ workspaceId: 'ws-1' })
  })
})

describe('#4498.a — chaque axe se filtre à plusieurs valeurs (IN), sans jamais sortir de l’espace', () => {
  it('sector : plusieurs secteurs en OU', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { sector: ['Banque', 'Assurance'], offset: 0 })
    const clause = fake.where.find(c => c.sql.includes('account.sector ILIKE ANY'))
    expect(clause?.params['sectors']).toEqual(['%Banque%', '%Assurance%'])
  })

  it('score : deux paliers = deux bornes en OU', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { score: ['high', 'low'], offset: 0 })
    const clause = fake.where.find(c => c.sql.includes('account.priority_score') && c.sql.includes(' OR '))
    expect(clause).toBeDefined()
  })

  it('lifecycle, gate, entityKind, status : IN avec la liste', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', {
      lifecycle: ['customer', 'opening'],
      gate: ['pending', 'parked'],
      entityKind: ['bu', 'subsidiary'],
      status: ['completed', 'error'],
      offset: 0,
    })
    const params = Object.assign({}, ...fake.where.map(c => c.params))
    expect(params['lifecycles']).toEqual(['customer', 'opening'])
    expect(params['gates']).toEqual(['parked'])
    expect(params['entityKinds']).toEqual(['bu', 'subsidiary'])
    expect(params['statuses']).toEqual(['completed', 'error'])
    expect(sqlOf(fake.where)).toContain("COALESCE(account.priority_gate, 'pending') = 'pending'")
  })

  it('tag : une clé par étiquette, comparée sans casse', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { tag: ['SAP', 'cloud'], offset: 0 })
    const params = Object.assign({}, ...fake.where.map(c => c.params))
    expect(params['tagKeys']).toEqual(['sap', 'cloud'])
  })

  it('une valeur seule se comporte comme avant (liste d’un élément)', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { lifecycle: 'customer', offset: 0 })
    const params = Object.assign({}, ...fake.where.map(c => c.params))
    expect(params['lifecycles']).toEqual(['customer'])
  })

  it('REFUS d’espace : la borne workspace est TOUJOURS la première clause, filtres multi ou non', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-A', {
      sector: ['Banque', 'Assurance'],
      lifecycle: ['customer', 'opening'],
      tag: ['sap', 'cloud'],
      offset: 0,
    })
    expect(fake.where[0]?.sql).toBe('account.workspace_id = :workspaceId')
    expect(fake.where[0]?.params).toEqual({ workspaceId: 'ws-A' })
    // Aucune clause multi-valeur ne réécrit ni ne remplace cette borne.
    expect(fake.where.filter(c => 'workspaceId' in c.params)).toHaveLength(1)
  })

  it('« all » dans la liste vaut « pas de filtre » sur cet axe', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { lifecycle: ['all'], gate: ['all'], offset: 0 })
    const params = Object.assign({}, ...fake.where.map(c => c.params))
    expect(params['lifecycles']).toBeUndefined()
    expect(params['gates']).toBeUndefined()
  })
})

describe('#4498.c — Historique documenté / Références autorisées lisent les preuves du compte', () => {
  it('`documentedHistory: with` = au moins une preuve, DANS le même espace', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { documentedHistory: 'with', offset: 0 })
    const sql = sqlOf(fake.where)
    expect(sql).toContain('EXISTS (SELECT 1 FROM proofs pr WHERE pr.account_id = account.id')
    expect(sql).toContain('pr.workspace_id = account.workspace_id')
    expect(sql).not.toContain('NOT EXISTS (SELECT 1 FROM proofs')
  })

  it('`documentedHistory: without` = aucune preuve', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { documentedHistory: 'without', offset: 0 })
    expect(sqlOf(fake.where)).toContain('NOT EXISTS (SELECT 1 FROM proofs pr WHERE pr.account_id = account.id')
  })

  it('`authorizedReferences: only` = une preuve dont la citation est EXPLICITEMENT autorisée (jamais null)', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { authorizedReferences: 'only', offset: 0 })
    const sql = sqlOf(fake.where)
    expect(sql).toContain('pr.citation_allowed = true')
    expect(sql).toContain('pr.workspace_id = account.workspace_id')
  })

  it('« all » / absent : aucun prédicat de preuve', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', {
      documentedHistory: 'all',
      authorizedReferences: 'all',
      offset: 0,
    })
    expect(sqlOf(fake.where)).not.toContain('proofs')
  })
})
