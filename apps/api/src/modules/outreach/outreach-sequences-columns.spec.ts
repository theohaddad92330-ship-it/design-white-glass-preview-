import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Bug prod 29/09 — l'auto-stop `max_delay` échouait à chaque passage :
 * `column "updated_at" of relation "outreach_sequences" does not exist`.
 * `outreach_sequences` ne porte que `created_at` (voir l'entité) : aucun SQL brut
 * du dépôt ne doit écrire `updated_at` sur cette table.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'migrations' ? [] : sourceFiles(full)
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : []
  })
}

describe('outreach_sequences — SQL brut', () => {
  it('n’écrit jamais une colonne updated_at que la table n’a pas', () => {
    const offenders = sourceFiles(join(__dirname, '..', '..')).filter(file =>
      /UPDATE\s+outreach_sequences\s+\w*\s*SET[^`]*updated_at/i.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
