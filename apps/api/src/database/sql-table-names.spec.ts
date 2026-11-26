import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Toute table nommée dans du SQL écrit à la main doit EXISTER.
 *
 * Le défaut que ce test verrouille a rendu deux fonctionnalités muettes en
 * production. T1 a unifié la sémantique du pivot — types `Project*`, routes
 * `/projects`, écran « Projets » — **sans renommer la table**, qui reste
 * `opportunities` (le mot voyage aussi comme clé de charge utile depuis le
 * service IA ; la renommer casserait ce contrat pour un gain nul). Écrire
 * `FROM projects` passe donc la relecture, passe le typage, passe la suite de
 * tests, et casse à l'exécution : `relation "projects" does not exist`.
 *
 * Pire : les deux appelants avalaient l'erreur. Le balayeur d'interventions
 * isole chaque nature dans un `try/catch` — le collecteur « positionnement en
 * souffrance » n'a donc JAMAIS rien remonté, sans que rien ne le dise à
 * l'écran. C'est la signature de ce dépôt : l'échec ressemble au succès.
 *
 * Le typage ne peut rien ici — une requête est une chaîne. Ce test relit donc
 * les chaînes et les compare aux tables réellement créées.
 */

const SRC = join(__dirname, '..')
const ENTITIES = join(__dirname, 'entities')
const MIGRATIONS = join(SRC, 'migrations')

/**
 * Les tables qui existent vraiment : celles déclarées par une entité TypeORM,
 * plus celles créées par une migration sans entité (lues en SQL direct).
 *
 * Les DEUX sources sont lues, et aucune liste n'est tenue à la main : une
 * allowlist manuelle finirait par accueillir la faute qu'on cherche à empêcher.
 */
function knownTables(): Set<string> {
  const names = new Set<string>()
  for (const file of readdirSync(ENTITIES)) {
    if (!file.endsWith('.entity.ts')) continue
    const source = readFileSync(join(ENTITIES, file), 'utf8')
    for (const match of source.matchAll(/@Entity\(\{\s*name:\s*'([^']+)'/g)) names.add(match[1]!)
  }
  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith('.ts')) continue
    const source = readFileSync(join(MIGRATIONS, file), 'utf8')
    for (const match of source.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi)) {
      names.add(match[1]!)
    }
  }
  // Une table RENOMMÉE n'existe plus sous son ancien nom, et son `CREATE TABLE`
  // d'origine reste pourtant dans l'historique des migrations. Sans cette passe,
  // la garde accueillait le nom mort : `user_credits` a été renommée
  // `subscriptions` en juin, et un balayage quotidien interrogeait encore
  // l'ancien nom — donc échouait en silence, tous les jours.
  //
  // Seul le bloc `up()` est lu : le `down()` d'un renommage contient le
  // renommage INVERSE, qui n'a jamais tourné en production.
  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith('.ts')) continue
    const source = readFileSync(join(MIGRATIONS, file), 'utf8')
    const upOnly = source.split(/public\s+async\s+down/)[0] ?? source
    for (const match of upOnly.matchAll(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s+RENAME\s+TO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    )) {
      names.delete(match[1]!)
      names.add(match[2]!)
    }
  }
  // `_migrations` : la table de suivi que TypeORM crée LUI-MÊME au premier
  // `migration:run` (`migrationsTableName: '_migrations'`, `data-source.ts` +
  // `database.module.ts`) — jamais par un `CREATE TABLE` écrit dans ce dépôt,
  // donc ni les entités ni les migrations ci-dessus ne la voient. Elle existe
  // bel et bien en production (#balayage-weekly-digest la lit pour dater
  // l'exécution réelle d'une migration : `admin-weekly-digest-sweep.service.ts`).
  names.add('_migrations')
  return names
}

/**
 * Ce qui suit FROM/JOIN sans être une table Postgres.
 *
 * Fonctions ensemblistes, tables dérivées (la parenthèse), catalogues système.
 */
const NOT_A_TABLE = /^(lateral|unnest|generate_series|jsonb_|json_|regexp_|string_to|values|\(|information_schema|pg_)/i

/**
 * Fichiers qui écrivent du SQL d'un AUTRE dialecte.
 *
 * Le client Salesforce écrit du SOQL, où `FROM Contact` et `FROM Opportunity`
 * désignent des objets Salesforce et non des tables Postgres. Les confondre
 * ferait échouer le test sur du code parfaitement correct.
 */
const OTHER_DIALECTS = /modules\/salesforce\//

/** Retire les commentaires : la prose anglaise contient « from the … ». */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
}

/** Ne garde que les gabarits (backticks) — le SQL n'est jamais ailleurs. */
function templateLiterals(source: string): string {
  return [...source.matchAll(/`([^`]*)`/g)].map(match => match[1]!).join('\n')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // Les migrations CRÉENT les tables : elles nomment légitimement des noms
      // qui n'existent pas encore au moment où elles s'écrivent.
      if (entry === 'migrations') continue
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

/**
 * Le SQL, débarrassé de ses COMMENTAIRES.
 *
 * ⚠️ Sans ça, la garde lit `-- second LEFT JOIN direct sur supplier_invoices`
 * et signale « direct » comme une table inconnue. C'est la forme la plus
 * fréquente de garde borgne dans ce dépôt — celle qui cherche un MOT sans
 * regarder s'il est du code ou de la prose — et `CLAUDE.md` en fait une règle :
 * retirer les commentaires AVANT de lire un fichier source.
 *
 * Les deux formes sont retirées : `--` jusqu'à la fin de la ligne, et les blocs
 * `/* … *\/`. On remplace par une espace plutôt que par rien, pour ne pas coller
 * deux identifiants qu'un commentaire séparait.
 */
function withoutSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** Les identifiants qui suivent `FROM` / `JOIN` / `INSERT INTO`. */
function tablesNamedIn(raw: string): string[] {
  const sql = withoutSqlComments(raw)
  const cteNames = new Set(
    // ⚠️ `\b` AVANT la virgule ne matche jamais : une CTE suivante s'écrit
    // `),\n  nom AS (`, et entre `)` et `,` il n'y a PAS de frontière de mot —
    // deux caractères non-mots. La garde ne voyait donc que la PREMIÈRE CTE
    // d'une requête et prenait toutes les suivantes pour des tables inconnues.
    // Son propre test n'exerçait qu'une CTE unique : un cas jamais joué.
    [...sql.matchAll(/(?:\bWITH|,)\s+([a-z_][a-z0-9_]*)\s+AS\s*\(/gi)].map(m => m[1]!.toLowerCase()),
  )
  const found: string[] = []
  // `(?<!\bDISTINCT\s+)` : `IS [NOT] DISTINCT FROM` est un opérateur de COMPARAISON,
  // pas une source de lignes — ce qui le suit est une valeur (`EXCLUDED.x`, `$2`,
  // une colonne), jamais une table. Faux positif mesuré en CI le 13/09/2026 (#1981).
  for (const match of sql.matchAll(/\b(?<!\bDISTINCT\s+)(?:FROM|JOIN|INSERT\s+INTO)\s+([a-zA-Z_(][a-zA-Z0-9_]*)/g)) {
    const name = match[1]!
    if (NOT_A_TABLE.test(name)) continue
    if (cteNames.has(name.toLowerCase())) continue
    found.push(name)
  }
  return found
}

describe('les tables nommées en SQL existent', () => {
  const tables = knownTables()

  it('le registre des tables est lisible', () => {
    // Un registre vide ferait passer le test sur n'importe quel SQL.
    expect(tables.size).toBeGreaterThan(80)
  })

  it('aucun fichier ne référence une table inconnue', () => {
    const offences: string[] = []
    for (const file of sourceFiles(SRC)) {
      if (OTHER_DIALECTS.test(file)) continue
      const sql = templateLiterals(stripComments(readFileSync(file, 'utf8')))
      for (const name of tablesNamedIn(sql)) {
        if (!tables.has(name)) offences.push(`${file.replace(SRC, '')} → « ${name} »`)
      }
    }
    // Le message porte le nom fautif ET son fichier : « relation does not exist »
    // en production ne dit ni l'un ni l'autre.
    expect(offences).toEqual([])
  })

  it('sait reconnaître la table inventée qui a coûté deux fonctionnalités', () => {
    // Le garde doit échouer sur ce qu'il est censé attraper — sinon c'est une
    // tautologie, et ce dépôt en a déjà rencontré.
    expect(tablesNamedIn('SELECT 1 FROM projects p')).toContain('projects')
    expect(tables.has('projects')).toBe(false)
    expect(tables.has('opportunities')).toBe(true)
  })

  it('ne lit pas un nom de table dans un COMMENTAIRE', () => {
    // Le faux positif mesuré le 31/08/2026 : « direct » signalé comme table
    // inconnue parce qu'un commentaire disait « LEFT JOIN direct sur … ».
    expect(tablesNamedIn('-- un LEFT JOIN direct sur autre chose\nSELECT 1 FROM missions m')).toEqual(['missions'])
    expect(tablesNamedIn('/* JOIN inventee */ SELECT 1 FROM missions m')).toEqual(['missions'])
    // …et elle sait TOUJOURS dire non sur du vrai code, commentaire ou pas.
    expect(tablesNamedIn('-- rien ici\nSELECT 1 FROM projects p')).toContain('projects')
  })

  it('ne lit pas `IS [NOT] DISTINCT FROM` comme une table, et sait toujours dire NON à côté', () => {
    // Faux positif mesuré en CI le 13/09/2026 (#1981, lot 7A) : l'upsert du
    // marqueur « premier du jour » compare `… IS DISTINCT FROM EXCLUDED.last_shown_on`,
    // et la garde signalait « EXCLUDED » — la pseudo-ligne d'`ON CONFLICT`, pas une
    // table. `IS DISTINCT FROM` est un OPÉRATEUR de comparaison : rien ne le suit
    // qui soit une source de lignes.
    const upsert =
      'INSERT INTO user_daily_brief (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET x = 1 ' +
      'WHERE user_daily_brief.last_shown_on IS DISTINCT FROM EXCLUDED.last_shown_on RETURNING user_id'
    expect(tablesNamedIn(upsert)).toEqual(['user_daily_brief'])
    expect(tablesNamedIn('SELECT 1 FROM missions m WHERE m.a IS NOT DISTINCT FROM EXCLUDED.a')).toEqual(['missions'])
    // NON — une table inconnue dans la MÊME requête reste attrapée.
    expect(tablesNamedIn('SELECT 1 FROM projects p WHERE p.a IS DISTINCT FROM p.b')).toContain('projects')
  })

  it('ne se trompe ni sur une table dérivée, ni sur une CTE', () => {
    expect(tablesNamedIn('SELECT * FROM (SELECT 1) r')).toEqual([])
    expect(tablesNamedIn('WITH recent AS (SELECT 1) SELECT * FROM recent')).toEqual([])
    // La SECONDE CTE et les suivantes — le cas que la garde ne jouait pas, et
    // par lequel elle a signalé `declared` comme une table inconnue.
    expect(tablesNamedIn('WITH a AS (SELECT 1),\n  b AS (SELECT 2)\n SELECT * FROM a JOIN b ON true')).toEqual([])
  })
})
