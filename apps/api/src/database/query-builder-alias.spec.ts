import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Garde : un `createQueryBuilder()` SANS alias ne doit jamais porter un `where`
 * préfixé par un alias.
 *
 * C'est le bug qui a fait échouer l'analyse de VINCI ENERGIES en phase classify
 * (audit terrain du 17/08). `applyEnrichment` réutilisait, pour son `UPDATE`, le
 * prédicat écrit pour le `SELECT` — `c.account_id = :accountId …` — sur un
 * builder sans alias. Un `UPDATE contacts` n'a pas de table `c` : PostgreSQL
 * refusait la requête (« missing FROM-clause entry for table "c" »), la phase
 * tombait, et les crédits du run avaient déjà été débités.
 *
 * Le test lit le SOURCE plutôt que d'exécuter du SQL : l'erreur ne se voit qu'à
 * l'exécution contre un vrai PostgreSQL, que la suite unitaire n'a pas. Un
 * scanner ne prouve pas la requête, il empêche la forme qui l'a cassée.
 */
const SRC = join(__dirname, '..')

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') tsFiles(full, out)
    } else if (entry.name.endsWith('.ts') && !entry.name.includes('.spec.')) {
      out.push(full)
    }
  }
  return out
}

/** Les fragments `where`/`andWhere` attachés à un `createQueryBuilder()` nu. */
function aliasedWheresOnUnaliasedBuilder(source: string): string[] {
  const lines = source.split('\n')
  const found: string[] = []
  lines.forEach((line, index) => {
    if (!/createQueryBuilder\(\s*\)/.test(line)) return
    // Une chaîne de query builder tient dans une poignée de lignes ; au-delà on
    // sort du builder et on lirait le `where` de quelqu'un d'autre.
    const block = lines.slice(index, index + 14).join('\n')
    const clauses = block.match(/\.(?:where|andWhere)\(\s*[`'"][^`'"]+/g) ?? []
    for (const clause of clauses) {
      const predicate = clause.replace(/^[^`'"]*[`'"]/, '')
      if (/^[A-Za-z_][A-Za-z0-9_]*\./.test(predicate)) found.push(`L${index + 1}: ${predicate.slice(0, 80)}`)
    }
  })
  return found
}

describe('createQueryBuilder sans alias', () => {
  it("n'utilise jamais un prédicat préfixé par un alias", () => {
    const offenders = tsFiles(SRC)
      .map(file => ({ file, hits: aliasedWheresOnUnaliasedBuilder(readFileSync(file, 'utf8')) }))
      .filter(entry => entry.hits.length > 0)
      .map(entry => `${entry.file}\n  ${entry.hits.join('\n  ')}`)

    expect(offenders).toEqual([])
  })

  it('reconnaît la forme exacte qui a cassé la phase classify', () => {
    const broken = `
      const res = await repo
        .createQueryBuilder()
        .update(ContactEntity)
        .where('c.account_id = :accountId', params)
        .execute()
    `
    expect(aliasedWheresOnUnaliasedBuilder(broken)).toHaveLength(1)
  })

  it('ne signale pas un prédicat sans alias', () => {
    const fine = `
      await repo.createQueryBuilder().delete().where('user_id = :userId', { userId }).execute()
    `
    expect(aliasedWheresOnUnaliasedBuilder(fine)).toHaveLength(0)
  })
})
