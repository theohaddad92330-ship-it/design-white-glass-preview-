import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ENTITIES } from './database.module'

/**
 * Toute classe `@Entity()` du dépôt doit être DÉCLARÉE à TypeORM.
 *
 * Le 03/08, six entités existaient sans figurer dans `ENTITIES` :
 * `AtsConnectionEntity`, `MailBatchEntity`, `NeedPlayEntity`,
 * `ProviderCostEntity`, `RoutineRunEntity`, `RoutineSubscriptionEntity`. Les
 * tables étaient là, les migrations passées, les tests unitaires verts — et en
 * production la moindre lecture répondait `EntityMetadataNotFoundError: No
 * metadata for "RoutineSubscriptionEntity"`, donc 500. Trois écrans morts, dont
 * deux depuis plus d'une semaine, sans que rien ne le signale.
 *
 * Rien ne pouvait l'attraper : `getRepositoryToken` est REMPLACÉ dans les specs,
 * si bien qu'aucun test ne touche la vraie liste. Le défaut ne se voit qu'au
 * premier appel réel — c'est-à-dire chez le client.
 *
 * Le balayage porte sur TOUT `src`, pas sur le seul dossier `entities/` : une
 * entité peut vivre à côté de son module (`watchlist-rules/`), et c'est
 * précisément celle-là qu'un balayage par dossier raterait.
 */

const SRC_DIR = join(__dirname, '..')

/** Tous les `.ts` du dépôt, hors tests et hors migrations (qui n'ont pas d'entité). */
function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'migrations') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) found.push(full)
  }
  return found
}

/**
 * Les classes décorées `@Entity(...)`, avec le fichier où elles vivent.
 *
 * On cherche la PREMIÈRE `class` qui suit chaque `@Entity(` plutôt que d'écrire
 * un motif d'un seul tenant : d'autres décorateurs se glissent couramment entre
 * les deux (`@Index`, `@Unique`), et un motif rigide les rate en silence — ce
 * qui redonnerait un test qui passe en ne regardant rien.
 */
function declaredEntities(): Array<{ className: string; file: string }> {
  const found: Array<{ className: string; file: string }> = []
  for (const file of sourceFiles(SRC_DIR)) {
    const source = readFileSync(file, 'utf8')
    let at = source.indexOf('@Entity(')
    while (at !== -1) {
      const className = /\bclass\s+(\w+)/.exec(source.slice(at))?.[1]
      if (className) found.push({ className, file: relative(SRC_DIR, file) })
      at = source.indexOf('@Entity(', at + 1)
    }
  }
  return found
}

describe('déclaration des entités TypeORM', () => {
  const entities = declaredEntities()
  const registered = new Set(ENTITIES.map(entity => entity.name))

  it('trouve bien les classes @Entity du dépôt', () => {
    // Filet du filet : si le balayage casse, tout le reste passerait en
    // déclarant zéro manquant.
    expect(entities.length).toBeGreaterThan(50)
  })

  it.each(entities.map(entity => [entity.className, entity.file]))(
    '%s est déclarée dans ENTITIES',
    (className, file) => {
      if (!registered.has(className)) {
        throw new Error(
          `« ${className} » (${file}) n'est pas dans ENTITIES (database.module.ts). ` +
            `Sans elle, TypeORM répond « No metadata for "${className}" » et tout écran qui la lit renvoie 500.`,
        )
      }
    },
  )

  it('ne déclare pas deux fois la même entité', () => {
    // Un doublon fait lever TypeORM au démarrage : l'API ne boote plus du tout.
    expect(registered.size).toBe(ENTITIES.length)
  })
})
