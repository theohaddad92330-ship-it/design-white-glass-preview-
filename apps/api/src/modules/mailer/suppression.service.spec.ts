import { FindOperator } from 'typeorm'
import { PERSON_ERASURE_HMAC_KEY_ENV } from '../../common/person-erasure-hmac'
import { erasedEmailFingerprint } from '../contacts/person-erasure-fingerprint'
import { SuppressionService } from './suppression.service'

/**
 * Les quatre conditions d'arrêt d'une séquence sont « imposées et non
 * désactivables » (PDF 2 §10.4). Deux l'étaient — une réponse et un rendez-vous
 * mettent la séquence en pause. Les deux autres ne l'étaient PAS : un opt-out
 * ou un rebond bloquaient l'envoi au dernier moment, mais la séquence restait
 * `active` avec ses étapes en attente, indéfiniment.
 */
describe('SuppressionService — un opt-out arrête ce qui court', () => {
  const build = () => {
    const execute = jest.fn().mockResolvedValue(undefined)
    const insertBuilder = {
      insert: jest.fn(() => insertBuilder),
      values: jest.fn(() => insertBuilder),
      orIgnore: jest.fn(() => insertBuilder),
      execute,
    }
    const suppressions = {
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => insertBuilder),
      query: jest.fn().mockResolvedValue(undefined),
    }
    const members = { find: jest.fn().mockResolvedValue([]) }
    return { service: new SuppressionService(suppressions as never, members as never), suppressions, execute }
  }

  it('annule les séquences actives de l’interlocuteur et skippe leurs étapes restantes', async () => {
    const { service, suppressions, execute } = build()
    await service.suppress('w-1', '  Claire.Meunier@EDF.FR ', 'unsubscribe')

    expect(execute).toHaveBeenCalled()
    const [sequenceSql, sequenceParams] = suppressions.query.mock.calls[0] as [string, unknown[]]
    // `cancelled` et non `paused` : une pause se reprend, un opt-out non.
    expect(sequenceSql).toContain("status = 'cancelled'")
    expect(sequenceParams).toEqual(['w-1', 'claire.meunier@edf.fr'])

    const [stepSql] = suppressions.query.mock.calls[1] as [string]
    // Une étape restée `pending` sur une séquence annulée continuerait de
    // remonter dans « ce qui est dû aujourd'hui ».
    expect(stepSql).toContain("status = 'skipped'")
  })

  it('enregistre quand même l’opt-out si l’arrêt des séquences échoue — c’est lui qui protège la personne', async () => {
    const { service, suppressions, execute } = build()
    suppressions.query.mockRejectedValue(new Error('boom'))
    await expect(service.suppress('w-1', 'claire@edf.fr', 'bounce')).resolves.toBeUndefined()
    expect(execute).toHaveBeenCalled()
  })

  it('n’essaie rien sur une adresse vide', async () => {
    const { service, suppressions } = build()
    await service.suppress('w-1', '   ', 'bounce')
    expect(suppressions.query).not.toHaveBeenCalled()
  })
})

/**
 * #2297.51 — l'opposition d'une personne EFFACÉE n'est plus stockée qu'en
 * empreinte HMAC de son adresse. Le contrôle d'envoi doit la reconnaître sous
 * ses deux formes — en clair (toutes les oppositions ordinaires) et en empreinte
 * — et ne jamais faiblir, même sans clé.
 */
describe('SuppressionService — #2297.51 une opposition gardée en empreinte', () => {
  // Une clé FIXE de test — jamais la valeur posée sur un serveur.
  const TEST_KEY = 'test-only-person-erasure-key-0123456789abcdef'
  const savedKey = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  afterEach(() => {
    if (savedKey === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = savedKey
  })

  type Row = { workspace_id: string; email: string; reason: string; erased_at: Date | null }

  /** Un `count` qui LIT vraiment ses critères : égalité, `In`, `Not(IsNull())`. */
  function satisfies(value: unknown, condition: unknown): boolean {
    if (condition instanceof FindOperator) {
      if (condition.type === 'in') return (condition.value as unknown[]).includes(value)
      if (condition.type === 'isNull') return value === null || value === undefined
      if (condition.type === 'not') return !satisfies(value, condition.child ?? condition.value)
      throw new Error(`opérateur non simulé : ${condition.type}`)
    }
    return value === condition
  }

  const build = (rows: Row[]) => {
    const pending: Row[] = []
    const insertBuilder = {
      insert: jest.fn(() => insertBuilder),
      values: jest.fn((values: Row) => {
        pending.push(values)
        return insertBuilder
      }),
      orIgnore: jest.fn(() => insertBuilder),
      execute: jest.fn(async () => {
        rows.push(...pending.splice(0).map(row => ({ ...row, erased_at: row.erased_at ?? null })))
      }),
    }
    const suppressions = {
      count: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          rows.filter(row =>
            Object.entries(where).every(([column, condition]) => satisfies(row[column as keyof Row], condition)),
          ).length,
      ),
      createQueryBuilder: jest.fn(() => insertBuilder),
      query: jest.fn().mockResolvedValue(undefined),
    }
    const members = { find: jest.fn().mockResolvedValue([{ workspace_id: 'w-1' }]) }
    return { service: new SuppressionService(suppressions as never, members as never), rows }
  }

  const erasedRow = (email: string): Row => ({
    workspace_id: 'w-1',
    email: erasedEmailFingerprint('w-1', email) as string,
    reason: 'unsubscribe',
    erased_at: new Date('2026-09-19T10:00:00Z'),
  })

  it('refuse l’envoi vers l’adresse d’une personne effacée — son opposition n’est plus qu’une empreinte', async () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
    const { service, rows } = build([])
    rows.push(erasedRow('claire.perrin@acme.fr'))

    expect(await service.isSuppressed('w-1', '  Claire.Perrin@ACME.fr ')).toBe(true)
    expect(await service.isSuppressedForUser('user-1', 'claire.perrin@acme.fr')).toBe(true)
    // Aucune adresse en clair n'a été nécessaire pour le savoir.
    expect(JSON.stringify(rows)).not.toContain('claire')
  })

  it('reconnaît toujours une opposition ordinaire, en clair', async () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
    const { service } = build([
      { workspace_id: 'w-1', email: 'jean.dupont@acme.fr', reason: 'unsubscribe', erased_at: null },
    ])
    expect(await service.isSuppressed('w-1', 'Jean.Dupont@acme.fr')).toBe(true)
  })

  it('sait dire NON : une autre adresse, ou la même dans un autre espace, n’est pas opposée', async () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
    const { service, rows } = build([])
    rows.push(erasedRow('claire.perrin@acme.fr'))
    expect(await service.isSuppressed('w-1', 'marc.dubois@acme.fr')).toBe(false)
    expect(await service.isSuppressed('w-2', 'claire.perrin@acme.fr')).toBe(false)
  })

  it('sans clé, dans un espace qui a une opposition en empreinte : on se TAIT (envoi refusé), on ne devine pas', async () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
    const { service, rows } = build([])
    rows.push(erasedRow('claire.perrin@acme.fr'))
    delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]

    expect(await service.isSuppressed('w-1', 'claire.perrin@acme.fr')).toBe(true)
    expect(await service.isSuppressed('w-1', 'marc.dubois@acme.fr')).toBe(true)
    // Un espace sans aucune empreinte n'est pas bâillonné par l'absence de clé.
    expect(await service.isSuppressed('w-2', 'marc.dubois@acme.fr')).toBe(false)
  })

  it('un désabonnement ultérieur de la personne effacée ne réécrit pas son adresse en clair', async () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
    const { service, rows } = build([])
    rows.push(erasedRow('claire.perrin@acme.fr'))

    await service.suppress('w-1', 'Claire.Perrin@acme.fr', 'unsubscribe')

    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain('claire')
    expect(await service.isSuppressed('w-1', 'claire.perrin@acme.fr')).toBe(true)
  })

  it('sait dire NON : un désabonnement ordinaire s’enregistre toujours en clair', async () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
    const { service, rows } = build([])
    await service.suppress('w-1', 'Marc.Dubois@acme.fr', 'unsubscribe')
    expect(rows.map(row => row.email)).toEqual(['marc.dubois@acme.fr'])
  })
})
