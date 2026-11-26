import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getMetadataArgsStorage } from 'typeorm'
import { ENTITIES } from '../database/database.module'

/**
 * GA-36 — une colonne ajoutée par migration est DÉCLARÉE par son entité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A PRODUIT CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * La migration `1789531284416-AccountEntitiesAndSites` a ajouté
 * `opportunities.entity_id` et `missions.site_id`. Aucune des deux colonnes n'a
 * été déclarée dans son entité TypeORM. Conséquences constatées le 24/08/2026
 * (croisement de l'addendum Stelya) :
 *
 * - `opportunities.entity_id` n'était lisible qu'en SQL BRUT
 *   (`open-needs.service.ts` fait un `leftJoin` textuel) — tout repository
 *   TypeORM la voyait comme inexistante, et `findOne({ where: { entity_id } })`
 *   aurait IGNORÉ la condition en silence (leçon `returned-rows` du PDF 5) ;
 * - `missions.site_id` n'avait NI lecteur NI écrivain : une colonne 100 % morte
 *   pendant des semaines, invisible de tous les tests.
 *
 * Une colonne qu'une migration crée sans que l'entité la déclare est exactement
 * le « chemin d'écriture non branché » que ce dépôt a déjà payé trois fois — en
 * pire : ici même la LECTURE est débranchée.
 *
 * La règle : pour chaque `ALTER TABLE <t> ADD COLUMN <c>` des migrations (moins
 * les colonnes re-supprimées ou renommées plus loin), si `<t>` est portée par
 * une entité TypeORM, alors `<c>` doit être une colonne déclarée de cette
 * entité. Les tables SANS entité (checkpoints LangGraph…) ne sont pas le sujet
 * — GA-16 les couvre.
 *
 * Preuve que la garde LIT quelque chose et sait dire NON : le test « corpus non
 * vide » ci-dessous, et sa première exécution a échoué sur les deux colonnes du
 * défaut fondateur avant qu'elles ne soient déclarées.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE CETTE GARDE NE PEUT PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit des MIGRATIONS, pas une base. « Une migration ajoute la colonne »
 * n'est donc PAS « la colonne existe en production » — et le 24/08/2026, obéir
 * à la garde a cassé la production : déclarer `profiles.onboarding_completed`
 * (ajoutée par `1776067200000-AuditFixes` avec un `IF NOT EXISTS`) a mis
 * `/workspaces/me` et `/briefing/today` en 500, parce que la colonne n'existe
 * pas sur la vraie table. `profiles` est une table SUPABASE, créée hors TypeORM :
 * la migration s'est appliquée sur une table qui n'était pas celle-là.
 *
 * D'où {@link NOT_IN_PRODUCTION} : une colonne mesurée ABSENTE de la base réelle
 * ne se déclare pas, et la liste dit comment on l'a su. Ajouter une entrée
 * demande une preuve (un log d'erreur de production), jamais une intuition —
 * sans quoi cette liste deviendrait la porte de sortie de la garde.
 */

const MIGRATIONS = join(__dirname, '..', 'migrations')

/**
 * Colonnes qu'une migration déclare et que la base de PRODUCTION n'a pas.
 *
 * `table.colonne` → la preuve. Mesuré, jamais supposé.
 */
const NOT_IN_PRODUCTION: Readonly<Record<string, string>> = {
  // 24/08/2026, logs Railway : « column ProfileEntity.onboarding_completed does
  // not exist » sur GET /workspaces/me et GET /briefing/today. Supplantée depuis
  // longtemps par l'événement produit `onboarding_completed` (product_events),
  // qui est ce que lit réellement l'activation.
  'profiles.onboarding_completed': 'absente de la base — 500 en production le 24/08/2026',
}

/**
 * ⚠️ Un `ALTER TABLE` porte souvent PLUSIEURS actions, séparées par des virgules.
 *
 * La première version de cette garde cherchait `ALTER TABLE x ADD COLUMN y` en
 * une seule expression : elle ne voyait donc que la PREMIÈRE colonne de chaque
 * instruction. La migration `1789693128476-InvoiceReference` en ajoute sept ;
 * la garde en voyait une — celle qui était déclarée — et restait verte pendant
 * que six colonnes n'existaient sur aucune entité. C'est ainsi que `paid_at` a
 * pu être LU par le chiffre d'affaires encaissé sans qu'aucun champ ne le porte.
 *
 * On isole donc l'instruction d'abord (jusqu'au `;` ou la fin du littéral), puis
 * on lit TOUTES ses actions.
 */
const ALTER_TABLE = /ALTER\s+TABLE\s+(?:ONLY\s+)?"?([a-z0-9_]+)"?([\s\S]*?)(?=;|`|ALTER\s+TABLE|$)/gi
const ADD_COLUMN = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi
const DROP_COLUMN = /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi
const RENAME_COLUMN = /RENAME\s+COLUMN\s+"?([a-z0-9_]+)"?\s+TO\s+"?([a-z0-9_]+)"?/gi

/** Retire commentaires ligne et bloc AVANT toute lecture — leçon GA-08 : une
 *  apostrophe ou un mot-clé dans un commentaire se lit comme du vrai SQL. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Colonnes ajoutées par les `up()` des migrations, nettes des suppressions et
 *  renommages ultérieurs, par table. */
function addedColumnsByTable(): Map<string, Set<string>> {
  const added = new Map<string, Set<string>>()
  for (const file of readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .sort()) {
    const source = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'))
    // Seul le `up()` compte : le `down()` restaure volontairement l'état d'avant.
    const up = source.split('public async down')[0] ?? source
    // Une instruction à la fois, puis TOUTES ses actions — voir le commentaire
    // d'`ALTER_TABLE` : la version d'avant n'en lisait qu'une par instruction.
    for (const [, rawTable, body] of up.matchAll(ALTER_TABLE)) {
      const table = (rawTable as string).toLowerCase()
      const statement = body as string
      for (const [, column] of statement.matchAll(ADD_COLUMN)) {
        const set = added.get(table) ?? new Set<string>()
        set.add((column as string).toLowerCase())
        added.set(table, set)
      }
      for (const [, column] of statement.matchAll(DROP_COLUMN)) {
        added.get(table)?.delete((column as string).toLowerCase())
      }
      for (const [, from, to] of statement.matchAll(RENAME_COLUMN)) {
        const set = added.get(table)
        if (set?.delete((from as string).toLowerCase())) set.add((to as string).toLowerCase())
      }
    }
  }
  return added
}

/** Table SQL → colonnes déclarées, depuis les métadonnées des entités ENREGISTRÉES
 *  (celles que l'application charge réellement — pas un glob de fichiers). */
function declaredColumnsByTable(): Map<string, Set<string>> {
  const storage = getMetadataArgsStorage()
  const registered = new Set<unknown>(ENTITIES)
  const byTable = new Map<string, Set<string>>()
  const targetsByTable = new Map<string, unknown[]>()
  for (const table of storage.tables) {
    if (!registered.has(table.target) || typeof table.name !== 'string') continue
    const name = table.name.toLowerCase()
    targetsByTable.set(name, [...(targetsByTable.get(name) ?? []), table.target])
  }
  for (const [name, targets] of targetsByTable) {
    const columns = new Set<string>()
    for (const column of storage.columns) {
      if (!targets.includes(column.target)) continue
      columns.add(((column.options.name ?? column.propertyName) as string).toLowerCase())
    }
    byTable.set(name, columns)
  }
  return byTable
}

describe('GA-36 — les colonnes des migrations sont déclarées par leur entité', () => {
  const added = addedColumnsByTable()
  const declared = declaredColumnsByTable()

  it('lit un corpus non vide (des deux côtés)', () => {
    // Une garde qui ne lit rien est verte pour toujours — leçon des six gardes
    // borgnes. `accounts.siren` est ajoutée par migration ET déclarée : si l'un
    // des deux lecteurs se casse, cette assertion tombe.
    expect(added.get('accounts')?.has('siren')).toBe(true)
    expect(declared.get('accounts')?.has('siren')).toBe(true)
    expect(added.size).toBeGreaterThan(10)
    expect(declared.size).toBeGreaterThan(50)
  })

  it('aucune colonne ajoutée par migration ne manque à son entité', () => {
    const missing: string[] = []
    for (const [table, columns] of added) {
      const entityColumns = declared.get(table)
      if (!entityColumns) continue // table sans entité : le sujet de GA-16, pas le nôtre
      for (const column of columns) {
        if (NOT_IN_PRODUCTION[`${table}.${column}`]) continue
        if (!entityColumns.has(column)) missing.push(`${table}.${column}`)
      }
    }
    expect(missing.sort()).toEqual([])
  })

  it('la liste des colonnes absentes de production porte sa preuve', () => {
    // Une exception sans raison écrite est une exception qu'on ne saura pas
    // relire — et cette liste est la seule porte de sortie de la garde.
    for (const [column, proof] of Object.entries(NOT_IN_PRODUCTION)) {
      // Jest n'accepte pas de message sur `expect` : l'entrée est nommée dans
      // l'assertion elle-même pour que l'échec dise LAQUELLE est fautive.
      expect(`${column} → ${/^[a-z0-9_]+\.[a-z0-9_]+$/.test(column)}`).toBe(`${column} → true`)
      expect(`${column} → ${proof.length > 20}`).toBe(`${column} → true`)
    }
  })
})
