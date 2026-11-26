import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * LA GARDE QUI REND LE `try/catch` PAR AXE TENABLE.
 *
 * `LauraProbeService` isole chaque mesure dans son propre `try` : une table
 * absente rend `null` pour cet axe, et les six autres continuent. C'est la bonne
 * conduite en production — et un piège en développement, parce qu'un nom de
 * table FAUX produit exactement le même `null` qu'une donnée absente. Le score
 * serait alors calculé sur quatre axes au lieu de sept, sans que rien ne le
 * signale : un espace parfaitement sain afficherait « à surveiller » pour
 * toujours.
 *
 * C'est la famille de défauts que le dépôt corrige depuis le PDF 3 — lire et
 * écrire dans deux tables différentes, derrière des tests verts. Ici la lecture
 * est du SQL brut, donc ni le compilateur ni TypeORM ne peuvent le voir : cette
 * garde le fait à leur place, en comparant les tables citées aux entités
 * déclarées.
 */

const ENTITIES = join(__dirname, '..', '..', 'database', 'entities')
const PROBE = join(__dirname, 'laura-probe.service.ts')

function declaredTables(): Set<string> {
  const tables = new Set<string>()
  for (const file of readdirSync(ENTITIES).filter(name => name.endsWith('.entity.ts'))) {
    const source = readFileSync(join(ENTITIES, file), 'utf8')
    for (const match of source.matchAll(/@Entity\(\s*(?:\{\s*name:\s*)?'([a-z0-9_]+)'/g)) {
      tables.add(match[1] as string)
    }
  }
  return tables
}

function citedTables(): string[] {
  const source = readFileSync(PROBE, 'utf8')
  return [...new Set([...source.matchAll(/\bFROM\s+([a-z0-9_]+)/g)].map(match => match[1] as string))].sort()
}

describe('les mesures de santé lisent des tables qui existent', () => {
  const declared = declaredTables()
  const cited = citedTables()

  it('cite au moins les six tables du §5.6 — une garde vide passe au vert pour toujours', () => {
    expect(cited.length).toBeGreaterThanOrEqual(6)
  })

  it.each(citedTables())('%s est déclarée par une entité', table => {
    // Jest n'accepte pas de message sur `expect` : il vit dans le nom du cas,
    // qui porte déjà le nom de la table.
    expect(declared.has(table)).toBe(true)
  })

  it('n’écrit RIEN — un axe de score qui écrirait serait un chemin d’écriture caché', () => {
    const source = readFileSync(PROBE, 'utf8')
    expect(source).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+[a-z_]+\s+SET|DELETE\s+FROM|TRUNCATE)\b/i)
  })
})

/**
 * GA — une requête de sonde n'invente pas de colonne.
 *
 * Trouvé dans les logs de production du 23/08 : `creditUse` interrogeait
 * `subscriptions WHERE workspace_id = $1`. La table est clé par UTILISATEUR —
 * c'est le propriétaire de l'espace qui porte l'abonnement. La requête levait
 * donc à chaque appel : l'axe « consommation de crédits » du score de santé de
 * Laura n'a JAMAIS été mesurable, et la production journalisait l'erreur en
 * boucle.
 *
 * Ce qui a caché le défaut : `creditUse` rattrape et rend `null`, et `null` est
 * une valeur LÉGITIME pour un axe non évaluable. Un axe cassé et un axe non
 * mesurable rendaient exactement la même chose.
 */
describe('les requêtes de la sonde portent sur des colonnes qui existent', () => {
  const source = readFileSync(PROBE, 'utf8')

  it('ne cherche jamais `workspace_id` dans `subscriptions`', () => {
    expect(source).not.toMatch(/FROM subscriptions[\s\S]{0,80}workspace_id\s*=/)
  })

  it('passe par le PROPRIÉTAIRE de l’espace, comme les autres lecteurs de quota', () => {
    expect(source).toMatch(/JOIN subscriptions s ON s\.user_id = w\.owner_user_id/)
  })
})

/**
 * GA — le même défaut, en GÉNÉRAL cette fois.
 *
 * Les deux cas ci-dessus nomment UNE requête, celle qui a échoué en production.
 * La sonde en porte maintenant plus de trente : les brancher a été le geste qui
 * a fait passer Laura de huit interventions déclenchables à vingt-cinq, et
 * chaque requête ajoutée est une occasion de plus d'écrire `completed` au lieu
 * de `completed_at`. Le compilateur ne peut rien voir — c'est du SQL dans une
 * chaîne — et le `try/catch` transforme la faute en `null`, c'est-à-dire en
 * « rien à signaler ».
 *
 * Ce que la garde fait : elle prend tout identifiant `snake_case` écrit dans un
 * littéral SQL et exige qu'une entité TypeORM le déclare, comme table ou comme
 * colonne. Les littéraux entre apostrophes sont RETIRÉS d'abord : `'renewal_at_risk'`
 * est une valeur d'enum, pas une colonne, et l'exiger comme telle ferait une
 * garde qui crie au loup.
 *
 * ⚠️ Ce qu'elle ne voit PAS, et il faut le savoir : un vrai nom de colonne lu sur
 * la mauvaise table. Vérifier ce couple demanderait de résoudre les alias SQL,
 * ce qui est un analyseur, pas une garde. Elle attrape les fautes de frappe et
 * les colonnes inventées, qui sont l'essentiel du risque.
 */
describe('GA — aucun identifiant SQL de la sonde n’est inventé', () => {
  /** Mots du langage, alias d'une lettre et fonctions — jamais des colonnes. */
  const SQL_WORDS = new Set([
    'select',
    'from',
    'where',
    'and',
    'or',
    'not',
    'exists',
    'join',
    'left',
    'inner',
    'outer',
    'on',
    'as',
    'count',
    'filter',
    'group',
    'by',
    'having',
    'max',
    'min',
    'sum',
    'avg',
    'limit',
    'offset',
    'order',
    'asc',
    'desc',
    'case',
    'when',
    'then',
    'else',
    'end',
    'null',
    'is',
    'in',
    'any',
    'all',
    'interval',
    'current_date',
    'current_timestamp',
    // Fonction Postgres, pas une colonne : elle borne la journée civile de
    // `spontaneousQueriesYesterday`. Elle entre ici parce que la passe « mot en
    // snake_case » ne sait pas distinguer une fonction d'une colonne — pas
    // parce qu'un identifiant inconnu serait devenu acceptable.
    'date_trunc',
    // Même raison (intégration G 11/10, métiers placés déduits) : trois fonctions
    // jsonb de `placedRolesUnknown`, qui disent « un rôle déduit non retiré » sans
    // déplier le tableau comme une table.
    'jsonb_array_length',
    'jsonb_path_query_array',
    'to_jsonb',
    'now',
    'int',
    'integer',
    'date',
    'true',
    'false',
    'distinct',
    'coalesce',
    'cast',
    'union',
  ])

  function declared(): { tables: Set<string>; columns: Set<string> } {
    const tables = new Set<string>()
    const columns = new Set<string>()
    for (const file of readdirSync(ENTITIES).filter(name => name.endsWith('.entity.ts'))) {
      const entity = readFileSync(join(ENTITIES, file), 'utf8')
      for (const match of entity.matchAll(/@Entity\(\s*(?:\{\s*name:\s*)?'([a-z0-9_]+)'/g)) {
        tables.add(match[1] as string)
      }
      // Les propriétés d'entité, à deux espaces d'indentation — la forme que ce
      // dépôt tient partout. `?:` couvre les colonnes facultatives.
      for (const match of entity.matchAll(/^ {2}([a-z_][a-z0-9_]*)\??:\s/gm)) columns.add(match[1] as string)
    }
    return { tables, columns }
  }

  /** Les littéraux SQL de la sonde, apostrophes VIDÉES de leur contenu. */
  function sqlLiterals(): string[] {
    const source = readFileSync(PROBE, 'utf8')
    return [...source.matchAll(/`([^`]*SELECT[^`]*)`/g)]
      .map(match => match[1] as string)
      .map(block => block.replace(/'[^']*'/g, "''"))
  }

  const { tables, columns } = declared()
  const literals = sqlLiterals()

  it('lit un corpus NON VIDE — sans ça, zéro identifiant inconnu ne prouve rien', () => {
    // Trois chiffres, parce que trois choses peuvent se vider en silence : les
    // entités, les colonnes qu'on en extrait, et les requêtes de la sonde.
    expect(tables.size).toBeGreaterThanOrEqual(100)
    expect(columns.size).toBeGreaterThanOrEqual(500)
    expect(literals.length).toBeGreaterThanOrEqual(20)
  })

  /**
   * Les identifiants d'une requête, en DEUX passes.
   *
   * ⚠️ La première version n'en faisait qu'une, sur `snake_case`. Elle a été
   * cassée volontairement en remplaçant `t.completed_at` par `t.completed` — et
   * elle est restée VERTE : la faute la plus probable, celle qui RETIRE le
   * suffixe d'une colonne, ne contient plus d'underscore. Une garde qui ne voit
   * qu'un tiers de son sujet est le défaut qu'elle prétendait empêcher.
   *
   * D'où la seconde passe, la plus sûre des deux : ce qui suit un point en SQL
   * est une colonne, quelle que soit son orthographe.
   */
  function identifiersIn(block: string): string[] {
    const qualified = [...block.matchAll(/\b[a-z][a-z0-9_]*\.([a-z_][a-z0-9_]*)/g)].map(match => match[1] as string)
    const bare = [...block.matchAll(/\b([a-z][a-z0-9]*_[a-z0-9_]*)\b/g)].map(match => match[1] as string)
    return [...qualified, ...bare]
  }

  it('n’écrit aucun identifiant qu’aucune entité ne déclare', () => {
    const unknown = new Set<string>()
    for (const block of literals) {
      for (const word of identifiersIn(block)) {
        if (SQL_WORDS.has(word) || tables.has(word) || columns.has(word)) continue
        unknown.add(word)
      }
    }
    expect([...unknown]).toEqual([])
  })

  it('voit les colonnes QUALIFIÉES, y compris sans underscore', () => {
    // Le cas exact de la cassure volontaire : `t.completed` au lieu de
    // `t.completed_at`. Sans cette assertion, la première passe suffirait à
    // faire croire que la garde regarde.
    expect(identifiersIn('SELECT 1 FROM tasks t WHERE t.completed IS NULL')).toContain('completed')
  })
})
