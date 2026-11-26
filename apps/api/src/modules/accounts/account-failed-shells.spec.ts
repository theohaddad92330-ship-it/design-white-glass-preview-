import { isFailure, isSuccess } from '@bellum/utils'
import { archiveFailedShells, FAILED_SHELL_SQL, type ShellManager } from './account-failed-shells'

/**
 * #4621.3 — les coquilles d'analyses échouées VIDES s'ARCHIVENT, par lot daté (199 du 18/10, 823 du 20/10),
 * dans l'espace qui les porte, sans jamais supprimer ni écraser une correction humaine.
 */
const WS = '11111111-1111-1111-1111-111111111111'

function makeManager(candidateIds: string[]) {
  const issued: Array<{ sql: string; params: unknown[] }> = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    issued.push({ sql, params })
    if (/^\s*SELECT/i.test(sql)) return candidateIds.map(id => ({ id }))
    // `UPDATE … RETURNING id` rend les lignes réellement archivées.
    if (/^\s*UPDATE/i.test(sql)) return [candidateIds.map(id => ({ id })), candidateIds.length]
    return []
  })
  const manager: ShellManager = { transaction: async cb => cb({ query }) }
  return { manager, issued }
}

const updates = (issued: Array<{ sql: string; params: unknown[] }>) => issued.filter(i => /^\s*UPDATE/i.test(i.sql))

describe('archiveFailedShells — le lot daté', () => {
  it.each(['', '2026-10', '18/10/2026', '2026-13-40', '2026-02-30', "2026-10-18'; DROP TABLE accounts"])(
    'refuse la date « %s » sans toucher la base',
    async date => {
      const { manager, issued } = makeManager(['a'])
      const result = await archiveFailedShells(manager, WS, { createdOn: date })
      expect(isFailure(result)).toBe(true)
      expect(issued).toHaveLength(0)
    },
  )

  it('refuse un espace vide : jamais « tout le parc »', async () => {
    const { manager, issued } = makeManager(['a'])
    const result = await archiveFailedShells(manager, '', { createdOn: '2026-10-18' })
    expect(isFailure(result)).toBe(true)
    expect(issued).toHaveLength(0)
  })

  it('à blanc (dryRun) : MESURE le lot sans rien écrire', async () => {
    const { manager, issued } = makeManager(['a', 'b', 'c'])
    const result = await archiveFailedShells(manager, WS, { createdOn: '2026-10-18', dryRun: true })
    expect(isSuccess(result) && result.output).toEqual({
      createdOn: '2026-10-18',
      candidates: 3,
      archived: 0,
      dryRun: true,
    })
    expect(updates(issued)).toHaveLength(0)
  })

  it('un lot qui n’a pas la taille attendue (199) n’est PAS archivé, et dit combien il en a trouvé', async () => {
    const { manager, issued } = makeManager(['a', 'b', 'c'])
    const result = await archiveFailedShells(manager, WS, { createdOn: '2026-10-18', expected: 199 })
    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.code).toBe('invalid_input')
    expect(result.problem.message).toContain('3')
    expect(result.problem.message).toContain('199')
    expect(updates(issued)).toHaveLength(0)
  })

  it('archive le lot attendu : statut archived, jamais de suppression, espace et jour en paramètres', async () => {
    const { manager, issued } = makeManager(['a', 'b'])
    const result = await archiveFailedShells(manager, WS, { createdOn: '2026-10-20', expected: 2 })
    expect(isSuccess(result) && result.output).toEqual({
      createdOn: '2026-10-20',
      candidates: 2,
      archived: 2,
      dryRun: false,
    })

    const [update] = updates(issued)
    expect(update?.sql).toMatch(/status\s*=\s*'archived'/)
    expect(update?.sql).toMatch(/commercial_status\s*=\s*'archived'/)
    expect(issued.map(i => i.sql).join('\n')).not.toMatch(/\bDELETE\b/i)
    // La raison de l'échec reste lisible : une coquille archivée redevient inconnue, elle ne disparaît pas.
    expect(update?.sql).not.toMatch(/error_message\s*=/)
    // L'espace et le jour sont des PARAMÈTRES, pas du texte.
    expect(update?.params).toEqual([WS, '2026-10-20', ['a', 'b']])
  })

  it('ne touche que ce qui est vide ET sans trace humaine, dans l’espace', async () => {
    const { manager, issued } = makeManager(['a'])
    await archiveFailedShells(manager, WS, { createdOn: '2026-10-18' })
    const sql = issued.map(i => i.sql).join('\n')
    expect(sql).toContain(FAILED_SHELL_SQL)
    expect(sql).toMatch(/workspace_id\s*=\s*\$1/)
    expect(sql).toMatch(/created_at AT TIME ZONE 'UTC'\)::date = \$2::date/)
    // Une correction humaine (tri commercial, note, tâche) sort la fiche du lot.
    expect(sql).toMatch(/commercial_status[^\n]*'inbox'/)
    expect(sql).toMatch(/FROM notes/)
    expect(sql).toMatch(/FROM tasks/)
  })

  it('la lecture ET l’écriture sont dans UNE transaction (le lot ne bouge pas entre les deux)', async () => {
    const transaction = jest.fn(async (cb: (m: { query: jest.Mock }) => Promise<unknown>) =>
      cb({ query: jest.fn(async () => []) }),
    )
    await archiveFailedShells({ transaction } as unknown as ShellManager, WS, { createdOn: '2026-10-18' })
    expect(transaction).toHaveBeenCalledTimes(1)
  })
})
