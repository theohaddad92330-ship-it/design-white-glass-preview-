import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEEDBACK_FREE_TEXT_COLUMNS,
  FEEDBACK_REUSE_SCOPES,
  FEEDBACK_REUSE_SCOPE_COLUMN,
  FEEDBACK_ROW_TABLES,
  WORKSPACE_SCOPED_FEEDBACK_TABLES,
} from '@bellum/contracts'

/**
 * GA-47 — un retour ne franchit la frontière d'un espace qu'avec sa portée, et
 * son texte ne la franchit jamais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE N'EST PAS UNE RÈGLE PRODUIT
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est l'onzième invariant du registre de doctrine, et le SEUL des onze qui
 * n'avait aucun porteur : « le retour d'un bêta testeur ne se réutilise pas tel
 * quel chez un concurrent ». Sa raison est celle de GA-43 — **les espaces de
 * Bellum sont des ESN, donc des concurrents**. Un verbatim de client décrit une
 * stratégie : des zones, des seuils, des cibles, le nom d'un compte et ce qu'il
 * a répondu. Comme le coût d'accès, ça ne se rattrape pas après coup, puisque
 * l'information aura circulé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE ALORS QU'AUCUNE LECTURE INTER-ESPACES N'EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Au 27/08/2026, mesuré : **aucune** lecture de `account_feedback` ou de
 * `submission_feedback` ne traverse les espaces. Toutes sont bornées, soit par
 * `workspace_id`, soit par l'objet dont l'appartenance a été vérifiée juste
 * avant (`assertSubmission`, `findOneForWorkspace`).
 *
 * La garde ne corrige donc rien : elle empêche la lecture de DEMAIN. C'est
 * exactement la situation de GA-43, dont le docblock l'écrit — « la règle est
 * respectée, mais elle ne tient qu'à une ligne écrite à la main dans un
 * service, sans qu'aucun texte ne dise pourquoi ». Ici il n'y a même pas cette
 * ligne : il n'y avait, jusqu'à la migration `1790170000001`, aucune colonne sur
 * laquelle la poser.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES, TROIS CORPUS DIFFÉRENTS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Le schéma** — chaque table de retour porte `reuse_scope`, déclarée par
 *     son entité et contrainte en base. C'est ce qui rend la colonne impossible
 *     à oublier le jour où une quatrième table de retour apparaît.
 *  2. **La lecture** — toute requête SQL nommant une table de retour scopée doit
 *     être bornée ; si elle traverse, elle filtre sur la portée ET ne nomme
 *     aucune colonne de texte libre.
 *  3. **Le texte libre est nommé à un seul endroit**, et chaque nom de la liste
 *     existe vraiment sur une entité — sinon la liste vieillit en silence et la
 *     règle 2 ne surveille plus rien.
 *
 * ⚠️ Comme GA-43 et GA-46, cette garde lit du SQL dans des littéraux de gabarit.
 * Les commentaires partent AVANT lecture : ce docblock-ci écrit `verbatim` et
 * des noms de table, et se dénoncerait lui-même.
 */

const API_SRC = join(__dirname, '..')
const ENTITIES = join(API_SRC, 'database', 'entities')
const MIGRATIONS = join(API_SRC, 'migrations')

/**
 * Ce qui, dans une requête, prouve qu'elle reste dans un espace.
 *
 * `workspace_id` est le cas nominal. Les clés d'OBJET comptent parce que le
 * motif du dépôt est de vérifier l'appartenance de l'objet AVANT, puis de s'y
 * accrocher : `readFeedback` lit `WHERE f.submission_id = $1` juste après un
 * `assertSubmission(id, workspaceId)` qui rend `not_found` hors espace. La garde
 * ne peut pas voir cette vérification — elle est dans l'appelant, et c'est dit.
 */
const SCOPE_MARKERS = /workspace_id|submission_id|account_id|user_id/i

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Toute requête SQL brute qui LIT une table de retour scopée à un espace. */
function feedbackQueries(): { file: string; sql: string }[] {
  const found: { file: string; sql: string }[] = []
  for (const file of sourceFiles(join(API_SRC, 'modules'))) {
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const match of source.matchAll(/`([^`]*)`/gs)) {
      const sql = match[1] ?? ''
      if (!/\b(?:FROM|JOIN|INTO|UPDATE)\s+[a-z_.]*\b/i.test(sql)) continue
      if (!WORKSPACE_SCOPED_FEEDBACK_TABLES.some(table => new RegExp(`\\b${table}\\b`).test(sql))) continue
      found.push({ file, sql })
    }
  }
  return found
}

/** Le texte de l'entité qui porte une table donnée, ou `null`. */
function entitySource(table: string): string | null {
  for (const file of readdirSync(ENTITIES).filter(name => name.endsWith('.entity.ts'))) {
    const source = stripComments(readFileSync(join(ENTITIES, file), 'utf8'))
    if (new RegExp(`@Entity\\(\\s*(?:'${table}'|\\{\\s*name:\\s*'${table}')`).test(source)) return source
  }
  return null
}

/** Le SQL de tous les `up()` de migration, commentaires retirés. */
function migrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .map(name => stripComments(readFileSync(join(MIGRATIONS, name), 'utf8')).split('public async down')[0] ?? '')
    .join('\n')
}

describe('GA-47 — le schéma : chaque table de retour porte sa portée', () => {
  it('LIT quelque chose — les entités de retour existent', () => {
    // Sans cette assertion, un renommage de table rendrait la garde verte sur
    // du vide : c'est la leçon de GA-16, verte deux jours sur 12 % de corpus.
    const missing = FEEDBACK_ROW_TABLES.filter(table => entitySource(table) === null)
    expect(missing).toEqual([])
  })

  it('chaque entité DÉCLARE la colonne de portée', () => {
    const offenders = FEEDBACK_ROW_TABLES.filter(
      table => !new RegExp(`\\b${FEEDBACK_REUSE_SCOPE_COLUMN}\\b`).test(entitySource(table) ?? ''),
    )
    expect(offenders).toEqual([])
  })

  it('chaque entité pose le DÉFAUT le plus fermé', () => {
    // Un défaut ouvert se lirait comme un consentement que personne n'a donné.
    const offenders = FEEDBACK_ROW_TABLES.filter(
      table => !/default:\s*'tenant_private'/.test(entitySource(table) ?? ''),
    )
    expect(offenders).toEqual([])
  })

  it('la base CONTRAINT la colonne sur l’énumération, table par table', () => {
    // La contrainte passe AVANT le code qui écrit la valeur (leçon
    // `account_vocabulary.kind`). GA-12 vérifie ensuite qu'elle COUVRE
    // l'énumération TypeScript ; ici on vérifie qu'elle existe pour les TROIS.
    const sql = migrationSql()
    const offenders = FEEDBACK_ROW_TABLES.filter(
      table => !new RegExp(`CONSTRAINT\\s+${table}_${FEEDBACK_REUSE_SCOPE_COLUMN}_check`, 'i').test(sql),
    )
    expect(offenders).toEqual([])
  })

  it('l’énumération reste FERMÉE et courte — deux valeurs, pas un champ libre', () => {
    expect(FEEDBACK_REUSE_SCOPES).toEqual(['tenant_private', 'generalized_only'])
  })
})

describe('GA-47 — la lecture : un retour ne sort pas de son espace', () => {
  it('LIT quelque chose — des requêtes sur une table de retour existent', () => {
    const queries = feedbackQueries()
    expect(queries.length).toBeGreaterThan(0)
    // Ancrage sur une requête RÉELLE et connue : si elle disparaît, la garde
    // doit le dire plutôt que passer au vert sur un corpus vidé.
    expect(queries.some(({ sql }) => /FROM\s+submission_feedback/i.test(sql))).toBe(true)
  })

  it('chaque requête est BORNÉE, ou filtre explicitement sur la portée', () => {
    const offenders: string[] = []
    for (const { file, sql } of feedbackQueries()) {
      if (SCOPE_MARKERS.test(sql)) continue
      if (new RegExp(`\\b${FEEDBACK_REUSE_SCOPE_COLUMN}\\b`).test(sql)) continue
      offenders.push(`${file.slice(file.indexOf('/modules'))} : ${sql.trim().slice(0, 90)}`)
    }
    expect(offenders).toEqual([])
  })

  it('aucune requête NON BORNÉE ne nomme une colonne de texte libre', () => {
    // La seconde moitié de l'invariant, et l'asymétrie qui le porte : même une
    // portée `generalized_only` n'autorise que le MOTIF anonymisé — jamais la
    // phrase qui l'a inspiré. Une portée assez ouverte ne finit donc JAMAIS par
    // laisser sortir un verbatim.
    const offenders: string[] = []
    for (const { file, sql } of feedbackQueries()) {
      if (SCOPE_MARKERS.test(sql)) continue
      const leaked = FEEDBACK_FREE_TEXT_COLUMNS.filter(column => new RegExp(`\\b${column}\\b`).test(sql))
      if (leaked.length > 0) offenders.push(`${file.slice(file.indexOf('/modules'))} → ${leaked.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })

  it('sait dire NON — la règle rejouée sur des requêtes fabriquées', () => {
    // On ne casse pas une vraie requête pour le prouver : le faire ferait
    // circuler, le temps d'un test, ce que la garde protège. Même arbitrage
    // que GA-43 et GA-46.
    const fautive = `SELECT f.verbatim FROM submission_feedback f JOIN submissions s ON s.id = f.submission_id`
    const nue = `SELECT f.verbatim FROM submission_feedback f ORDER BY f.created_at DESC`
    const bornee = `SELECT f.verbatim FROM submission_feedback f WHERE f.workspace_id = $1`
    const parObjet = `SELECT f.note FROM account_feedback f WHERE f.account_id = $1`
    const generalisee = `SELECT count(*) FROM account_feedback f WHERE f.reuse_scope = 'generalized_only'`

    const crosses = (sql: string) => !SCOPE_MARKERS.test(sql)
    const scoped = (sql: string) => new RegExp(`\\b${FEEDBACK_REUSE_SCOPE_COLUMN}\\b`).test(sql)
    const leaksFreeText = (sql: string) =>
      crosses(sql) && FEEDBACK_FREE_TEXT_COLUMNS.some(column => new RegExp(`\\b${column}\\b`).test(sql))
    /** La règle entière, telle que les deux tests au-dessus l'appliquent. */
    const refused = (sql: string) => (crosses(sql) && !scoped(sql)) || leaksFreeText(sql)

    // Une lecture qui traverse et emporte le verbatim : refusée deux fois.
    expect(refused(nue)).toBe(true)
    expect(leaksFreeText(nue)).toBe(true)
    // Bornées : rien à vérifier de plus, elles ne sortent pas de leur espace.
    expect(refused(bornee)).toBe(false)
    expect(refused(parObjet)).toBe(false)
    // ⚠️ La requête « fautive » passe : elle se borne par `submission_id`, clé
    // d'objet dont l'appelant a vérifié l'appartenance. C'est la LIMITE de
    // cette garde — elle ne voit pas l'appelant — et elle est écrite, pas tue.
    expect(refused(fautive)).toBe(false)
    // Le seul chemin inter-espaces AUTORISÉ : une agrégation qui filtre sur la
    // portée et ne nomme aucun texte libre.
    expect(crosses(generalisee)).toBe(true)
    expect(refused(generalisee)).toBe(false)
    // Et le même agrégat qui voudrait emporter le verbatim : refusé.
    expect(refused(`${generalisee} AND f.note IS NOT NULL`)).toBe(true)
  })
})

describe('GA-47 — le texte libre est nommé à un seul endroit', () => {
  it('chaque colonne de texte libre existe VRAIMENT sur une entité de retour', () => {
    // Une liste qui vieillit sans qu'on le voie ferait surveiller des noms de
    // colonnes qui n'existent plus, donc rien du tout.
    const sources = FEEDBACK_ROW_TABLES.map(table => entitySource(table) ?? '').join('\n')
    const orphans = FEEDBACK_FREE_TEXT_COLUMNS.filter(column => !new RegExp(`\\b${column}:\\s`).test(sources))
    expect(orphans).toEqual([])
  })

  it('la liste n’est pas vide — une garde sans corpus passe au vert pour toujours', () => {
    expect(FEEDBACK_FREE_TEXT_COLUMNS.length).toBeGreaterThanOrEqual(3)
  })
})
