import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { firstReturnedRow, returnedCount, returnedRows } from './returned-rows'

describe('returnedRows', () => {
  it('déplie la forme `[lignes, nombre]` d’un UPDATE', () => {
    expect(returnedRows([[{ id: 'a' }], 1])).toEqual([{ id: 'a' }])
  })

  it('laisse passer la forme d’un SELECT ou d’un INSERT', () => {
    expect(returnedRows([{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('ne confond pas deux lignes avec un couple', () => {
    // `[ligneA, ligneB]` est un SELECT parfaitement légitime : la signature du
    // couple exige un TABLEAU puis un NOMBRE.
    expect(returnedRows([[{ id: 'a' }], [{ id: 'b' }]])).toEqual([[{ id: 'a' }], [{ id: 'b' }]])
  })

  it('rend un tableau vide plutôt que d’exploser sur une réponse inattendue', () => {
    expect(returnedRows(undefined)).toEqual([])
    expect(returnedRows(null)).toEqual([])
    expect(returnedRows({})).toEqual([])
  })

  it('rend `null` — jamais un tableau — quand rien n’a été touché', () => {
    // C'est le cœur du défaut : `[[], 0]` est « truthy », donc tous les
    // `if (!row) throw NotFound` passaient et les champs valaient `undefined`.
    expect(firstReturnedRow([[], 0])).toBeNull()
    expect(firstReturnedRow([[{ id: 'a' }], 1])).toEqual({ id: 'a' })
  })

  it('compte les lignes réellement rendues', () => {
    expect(returnedCount([[{ id: 'a' }, { id: 'b' }], 2])).toBe(2)
    expect(returnedCount([[], 0])).toBe(0)
  })
})

/**
 * La garde : aucun `UPDATE … RETURNING` ne lit son résultat à la main.
 *
 * TypeORM rend `[lignes, nombre]` pour UPDATE et DELETE, et `lignes` pour tout
 * le reste. Onze endpoints indexaient `[0]` sur un UPDATE et rendaient donc un
 * tableau là où leur type annonçait un objet — pendant des mois, sans qu'un
 * test tombe, parce que le web ne lit pas ces réponses.
 */
describe('aucun UPDATE … RETURNING ne lit son résultat à la main', () => {
  const MODULES = join(__dirname, '..', 'modules')

  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        out.push(...sourceFiles(full))
        continue
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue
      out.push(full)
    }
    return out
  }

  it('chaque requête UPDATE/DELETE … RETURNING passe par `returnedRows`', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(MODULES)) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/`([^`]*RETURNING[^`]*)`/gs)) {
        const sql = (match[1] ?? '').trim().toUpperCase()
        if (!sql.startsWith('UPDATE') && !sql.startsWith('DELETE')) continue
        // ⚠️ La fenêtre s'ouvre des DEUX côtés.
        //
        // La première version ne regardait qu'APRÈS la requête, en supposant que
        // l'appelant lit son résultat plus bas. Mais envelopper à l'appel —
        // `returnedRows(await manager.query(...))` — met le garde AVANT le
        // littéral, et c'est même la forme la plus sûre : il n'y a alors aucun
        // moment où le couple brut existe sous un nom. La garde signalait donc
        // comme fautif le code exemplaire.
        //
        // La fenêtre amont est plus COURTE (200 contre 400) : au-delà, ce qu'on
        // trouverait appartiendrait vraisemblablement à la requête précédente.
        const start = match.index ?? 0
        const window = source.slice(Math.max(0, start - 200), start + (match[0]?.length ?? 0) + 400)
        if (!/returnedRows|firstReturnedRow|returnedCount/.test(window)) {
          offenders.push(`${file.slice(file.indexOf('/modules'))} → ${sql.split('\n')[0]?.slice(0, 50)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
