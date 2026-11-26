import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Les colonnes lues par la vue Qualité existent-elles VRAIMENT ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT DU 22/08, TROUVÉ EN RECETTE LIVE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Missions actives sans date de fin » lisait `missions.end_date`. La colonne
 * s'appelle `ends_on`, et `end_date` n'apparaît dans AUCUNE migration du dépôt.
 * La requête échouait, le `catch` rendait `null`, et l'écran affichait « non
 * lu » — un état qui a l'air d'attendre une donnée, donc que personne ne va
 * vérifier. Une ligne cassée pour toujours, silencieuse.
 *
 * Aucun test unitaire ne pouvait l'attraper : le dépôt mocke la base, donc une
 * requête invalide passe au vert. Cette garde compare les identifiants du SQL
 * au texte des migrations — la seule source de vérité sur les colonnes qui
 * existent réellement.
 *
 * Elle ne vérifie PAS que la colonne appartient à la bonne table (il faudrait un
 * schéma complet en mémoire). Elle attrape la faute la plus fréquente et la plus
 * silencieuse : un nom qui n'existe nulle part.
 */

const MIGRATIONS = join(__dirname, '..', '..', 'migrations')

/** Tout le SQL du dépôt, en un seul texte. */
function migrationCorpus(): string {
  return readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .map(name => readFileSync(join(MIGRATIONS, name), 'utf8'))
    .join('\n')
}

/**
 * Les identifiants snake_case des requêtes — ceux qui désignent une colonne ou
 * une table. Les mots d'un seul segment (`email`, `stage`, `status`) sont
 * écartés : ils sont trop communs pour distinguer une colonne d'un mot-clé, et
 * la faute qu'on cherche porte presque toujours sur un nom composé.
 */
function snakeIdentifiers(sql: string): string[] {
  const KEYWORDS = new Set(['is_null', 'not_exists', 'order_by', 'group_by'])
  return [...new Set([...sql.matchAll(/\b([a-z][a-z0-9]*_[a-z0-9_]*)\b/g)].map(match => match[1] as string))].filter(
    identifier => !KEYWORDS.has(identifier),
  )
}

describe('la vue Qualité ne lit que des colonnes qui existent', () => {
  const corpus = migrationCorpus()
  const source = readFileSync(join(__dirname, 'data-hygiene.service.ts'), 'utf8')
  // Seul le SQL, pas les CLÉS de la table : `missions_without_end_date` est le
  // nom d'un contrôle, pas d'une colonne, et l'inclure ferait crier la garde
  // sur ses propres identifiants.
  const block = source.slice(source.indexOf('const QUERIES:'))
  const queries = [...block.matchAll(/`([^`]*)`/g)].map(match => match[1] as string).join('\n')

  it('chaque identifiant composé du SQL apparaît dans une migration', () => {
    const unknown = snakeIdentifiers(queries).filter(identifier => !corpus.includes(identifier))
    if (unknown.length > 0) {
      throw new Error(
        [
          'Un nom de colonne ou de table n’existe dans AUCUNE migration. La requête',
          'échouera en base, le catch rendra `null`, et l’écran affichera « non lu » —',
          'un état qui a l’air d’attendre une donnée, donc que personne ne vérifie.',
          '',
          ...unknown.map(name => `  · ${name}`),
        ].join('\n'),
      )
    }
    expect(unknown).toEqual([])
  })

  it('la garde lit bien quelque chose — et attraperait la faute du 22/08', () => {
    expect(snakeIdentifiers(queries).length).toBeGreaterThan(10)
    // `end_date` était le nom fautif : il n'apparaît nulle part.
    //
    // ⚠️ Une SOUS-CHAÎNE ne suffit pas, et ce n'est pas de la théorie : la
    // contrainte `CHECK` de `stock_snapshots` liste la clé d'hygiène
    // `missions_without_end_date`, qui contient les neuf caractères de
    // `end_date` sans nommer aucune colonne. La garde s'ancre donc sur des
    // FRONTIÈRES DE MOT — `_` étant un caractère de mot, `\bend_date\b` ne
    // reconnaît plus le nom du contrôle, et reconnaît toujours la faute.
    // Sans `g` : `RegExp.test()` est alors sans état (leçon des gardes borgnes).
    expect(/\bend_date\b/.test(corpus)).toBe(false)
    expect(/\bends_on\b/.test(corpus)).toBe(true)
  })
})
