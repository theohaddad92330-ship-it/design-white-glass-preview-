import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { RETIRED_TABLES, TABLE_SCOPES, type TableScope } from '@bellum/contracts'
import { getMetadataArgsStorage } from 'typeorm'
import { ENTITIES } from '../database/database.module'

/**
 * GA-65 — toute table du dépôt est CLASSÉE `scoped` ou `shared`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome 7 §23.1 demande deux catégories formelles et une liste que la garde
 * d'isolation puisse lire : « **sans cette distinction formelle, le test
 * `GA-06` du PDF 9 devient ingérable** » (au dépôt : GA-46,
 * `workspace-isolation.spec.ts`). Le registre vit dans
 * `packages/contracts/src/schemas/table-scopes.ts` ; cette garde-ci vérifie
 * qu'il dit vrai, et surtout qu'il est COMPLET.
 *
 * Un registre incomplet est pire que pas de registre : il donne l'illusion
 * d'une couverture. C'est le défaut « un registre qui se déclare implémenté
 * sans l'être », et c'est exactement ce qui est arrivé ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE A TROUVÉ LE JOUR OÙ ELLE A ÉTÉ ÉCRITE — DEUX TABLES INVISIBLES
 * ─────────────────────────────────────────────────────────────────────────────
 * `shared-tables-declared.spec.ts` (GA-16) déclarait SEIZE tables sans
 * `workspace_id` et se croyait complète. Il y en avait DIX-HUIT.
 *
 * Les deux manquantes — `match_run_entries` et `shortlist_entries` — portent
 * des consultants proposés et des shortlists, c'est-à-dire ce qu'une ESN ne
 * montre pas à une autre. Elles étaient invisibles pour une raison mécanique :
 * GA-16 lit un FICHIER, y cherche `workspace_id`, et prend le PREMIER
 * `@Entity(...)` qu'elle y trouve. Or `match-run.entity.ts` porte TROIS
 * entités et `shortlist.entity.ts` en porte DEUX ; leur première sœur est
 * scopée, donc le fichier entier était réputé scopé et ses cadettes n'existaient
 * pour personne. Un troisième cas, `match_weight_versions`, échappait de la même
 * façon à l'ensemble « tables scopées » de GA-46 : une requête non bornée sur
 * elle serait passée.
 *
 * C'est la huitième garde borgne du dépôt, et la leçon est la même à chaque
 * fois : **ce qui n'est pas LU n'est pas gardé.** D'où le corpus choisi ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES MÉTADONNÉES TypeORM, ET PAS UN BALAYAGE DE FICHIERS
 * ─────────────────────────────────────────────────────────────────────────────
 * `ENTITIES` (dans `database.module.ts`) est la liste que TypeORM reçoit
 * vraiment au démarrage — et `entities-registration.spec.ts` garantit déjà
 * qu'aucune classe `@Entity()` du dépôt n'en manque. En lisant les métadonnées
 * plutôt que le texte, on obtient le nom de table et les colonnes de CHAQUE
 * entité, y compris celles qui partagent un fichier avec une sœur, et y compris
 * celles qui vivent à côté de leur module (`favorites/`, `watchlist-rules/`) —
 * les deux angles morts d'un `readdirSync`.
 *
 * ⚠️ CE QU'ELLE NE VOIT PAS, ÉCRIT : six tables existent en base sans entité
 * TypeORM. Pour celles-là, le corpus est le SQL des migrations, ce qui est plus
 * faible — une migration décrit ce qu'on a demandé, pas ce que la base contient.
 * Elles sont peu nombreuses et nommées ; le second `describe` s'en occupe et dit
 * sa limite.
 */

const MIGRATIONS = join(__dirname, '..', 'migrations')

/**
 * Les colonnes qui BORNENT une ligne, et elles seules.
 *
 * ⚠️ `owner_user_id`, `author_user_id`, `target_user_id`, `created_by` en sont
 * délibérément absentes : ce sont des colonnes d'AUTEUR. Les accepter comme
 * portée classerait `workspaces` « personnelle » et `impersonation_audit`
 * « d'un utilisateur » — deux erreurs, et surtout la porte par laquelle une
 * table non isolée entrerait au registre sans que personne l'écrive.
 */
const SCOPE_COLUMNS = ['workspace_id', 'user_id'] as const

type Table = { name: string; entity: string; columns: string[] }

/** Chaque entité RÉELLEMENT enregistrée, son nom de table et ses colonnes. */
function registeredTables(): Table[] {
  const storage = getMetadataArgsStorage()
  const out: Table[] = []
  for (const target of ENTITIES) {
    const table = storage.tables.find(entry => entry.target === target)
    if (!table?.name) continue
    // Les colonnes sont attachées à la classe QUI LES DÉCLARE : une entité qui
    // hérite verrait les siennes manquer si l'on ne remontait pas la chaîne.
    const columns: string[] = []
    for (const column of storage.columns) {
      let current: unknown = target
      while (typeof current === 'function') {
        if (column.target === current) {
          columns.push(column.options.name ?? column.propertyName)
          break
        }
        current = Object.getPrototypeOf(current)
      }
    }
    out.push({ name: table.name, entity: (target as { name: string }).name, columns })
  }
  return out
}

/** La portée qu'une COLONNE suffit à établir — donc qu'on n'écrit pas à la main. */
function derivedScope(table: Table): (typeof SCOPE_COLUMNS)[number] | null {
  return SCOPE_COLUMNS.find(column => table.columns.includes(column)) ?? null
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * Le SQL des migrations, `up()` seulement, commentaires RETIRÉS.
 *
 * ⚠️ Retirer les commentaires n'est pas cosmétique : un docblock de migration
 * écrit « (drop-then-add du CHECK, CREATE TABLE IF NOT EXISTS)`. RLS
 * inchangée. » — et le lire comme du SQL fait naître une table nommée `if`.
 * Mesuré : c'est le seul faux positif du balayage, et il disparaît ici.
 */
function migrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .sort()
    .map(name => withoutComments(readFileSync(join(MIGRATIONS, name), 'utf8')).split('public async down')[0] ?? '')
    .join('\n')
}

function createdTables(sql: string): Set<string> {
  const out = new Set<string>()
  for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    out.add((match[1] ?? '').toLowerCase())
  }
  return out
}

/** Ce qu'une migration a retiré ou renommé : plus rien à classer. */
function goneTables(sql: string): Set<string> {
  const out = new Set<string>()
  for (const match of sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    out.add((match[1] ?? '').toLowerCase())
  }
  for (const match of sql.matchAll(/ALTER\s+TABLE\s+"?([a-z_][a-z0-9_]*)"?\s+RENAME\s+TO/gi)) {
    out.add((match[1] ?? '').toLowerCase())
  }
  return out
}

function categoryOf(scope: TableScope): string {
  return scope.category
}

describe('GA-65 — le registre des tables `scoped` / `shared` est complet et vrai', () => {
  it('LIT quelque chose — les entités enregistrées et leurs colonnes', () => {
    // Une garde qui lit le vide est verte pour toujours. GA-16 comptait ses
    // FICHIERS et non ses entités RECONNUES : elle a passé deux jours au vert
    // sur 12 % de son corpus. On compte donc ici ce qui SORT du tuyau.
    const tables = registeredTables()
    expect(tables.length).toBeGreaterThan(120)
    expect(new Set(tables.map(table => table.name)).size).toBe(tables.length)
    expect(tables.filter(table => table.columns.length > 0).length).toBe(tables.length)
    // La déduction fonctionne : la grande majorité des tables porte sa portée.
    expect(tables.filter(table => derivedScope(table)).length).toBeGreaterThan(100)
    expect(Object.keys(TABLE_SCOPES).length).toBeGreaterThan(10)
  })

  it('toute entité enregistrée est CLASSÉE — déduite d’une colonne, ou déclarée', () => {
    const unclassified = registeredTables()
      .filter(table => !derivedScope(table) && !(table.name in TABLE_SCOPES))
      .map(table => `${table.name} (${table.entity}) — ni \`workspace_id\`, ni \`user_id\`, ni entrée au registre`)
    expect(unclassified).toEqual([])
  })

  it('aucune table déclarée `shared` ne porte en fait une colonne de portée', () => {
    // Le sens de la garde : une table qui PORTE `workspace_id` appartient à un
    // espace, quoi que le registre en dise. Déclarer `shared` une table scopée
    // est précisément le trou d'isolation qu'on cherche à rendre impossible.
    const contradictions: string[] = []
    for (const table of registeredTables()) {
      const declared = TABLE_SCOPES[table.name]
      const column = derivedScope(table)
      if (!declared || !column) continue
      if (declared.category === 'shared') {
        contradictions.push(`${table.name} est déclarée \`shared\` mais porte \`${column}\``)
      }
      if (declared.category === 'scoped' && declared.by === 'parent') {
        contradictions.push(
          `${table.name} est déclarée isolée par \`${declared.parent}\` alors qu’elle porte \`${column}\``,
        )
      }
    }
    expect(contradictions).toEqual([])
  })

  it('la jointure qui isole une table dérivée EXISTE — parent et colonne', () => {
    const tables = registeredTables()
    const byName = new Map(tables.map(table => [table.name, table]))
    const broken: string[] = []
    for (const [name, scope] of Object.entries(TABLE_SCOPES)) {
      if (scope.category !== 'scoped' || scope.by !== 'parent') continue
      const child = byName.get(name)
      const parent = byName.get(scope.parent)
      if (!child) continue // table sans entité : le second `describe` s'en charge
      if (!parent) {
        broken.push(`${name} : le parent \`${scope.parent}\` n’est pas une table du dépôt`)
        continue
      }
      if (!child.columns.includes(scope.column)) {
        broken.push(`${name} : la colonne de jointure \`${scope.column}\` n’existe pas sur la table`)
      }
      // Le parent doit lui-même être borné, sinon la chaîne ne mène nulle part.
      if (!derivedScope(parent) && TABLE_SCOPES[parent.name]?.category !== 'scoped') {
        broken.push(`${name} : son parent \`${scope.parent}\` n’est pas scopé — la jointure n’isole rien`)
      }
    }
    expect(broken).toEqual([])
  })

  it('le registre ne garde aucune entrée périmée', () => {
    const live = new Set(registeredTables().map(table => table.name))
    const sql = migrationSql()
    const known = new Set([...live, ...createdTables(sql)])
    const stale = Object.keys(TABLE_SCOPES).filter(name => !known.has(name))
    expect(stale).toEqual([])
  })

  it('chaque classement porte sa raison, et une table « à classer » porte sa QUESTION', () => {
    const mute: string[] = []
    for (const [name, scope] of Object.entries(TABLE_SCOPES)) {
      const text = scope.category === 'to-classify' ? scope.question : scope.reason
      if (text.trim().length <= 80) mute.push(`${name} (${categoryOf(scope)})`)
    }
    expect(mute).toEqual([])
  })

  it('sait dire NON — les trois fautes que le registre doit refuser', () => {
    // Rejouée sur des tables fabriquées : casser une vraie entrée pour le
    // prouver ferait courir le risque qu'on oublie de la remettre.
    const scopee: Table = { name: 'faux_comptes', entity: 'X', columns: ['id', 'workspace_id'] }
    const personnelle: Table = { name: 'faux_reglages', entity: 'Y', columns: ['id', 'user_id'] }
    const orpheline: Table = { name: 'faux_orphelin', entity: 'Z', columns: ['id', 'owner_user_id'] }

    // 1. une colonne de portée classe la table sans qu'on l'écrive ;
    expect(derivedScope(scopee)).toBe('workspace_id')
    expect(derivedScope(personnelle)).toBe('user_id')
    // 2. une colonne d'AUTEUR ne classe rien — la table devra être déclarée ;
    expect(derivedScope(orpheline)).toBeNull()
    // 3. et une table qui n'est ni déduite ni déclarée est refusée.
    expect(orpheline.name in TABLE_SCOPES).toBe(false)
  })
})

describe('GA-65 — les tables SANS entité TypeORM sont classées aussi', () => {
  /**
   * ⚠️ La limite, écrite : le corpus est ici le SQL des MIGRATIONS, pas la base.
   * Une migration dit ce qu'on a demandé ; seule la base dit ce qu'elle contient.
   * On l'accepte pour ces six tables-là parce qu'aucune entité ne les décrit —
   * et c'est mieux que de les laisser hors de tout inventaire.
   */
  it('LIT quelque chose — des migrations qui créent des tables', () => {
    const sql = migrationSql()
    expect(sql.length).toBeGreaterThan(10000)
    expect(createdTables(sql).size).toBeGreaterThan(100)
    // Le retrait des commentaires est ce qui empêche la table fantôme `if`.
    expect(createdTables(sql).has('if')).toBe(false)
    expect(createdTables(withoutComments(''))).toEqual(new Set())
  })

  it('toute table créée sans entité est déclarée, ou nommée comme retirée', () => {
    const sql = migrationSql()
    const live = new Set(registeredTables().map(table => table.name))
    const gone = goneTables(sql)
    const orphans = [...createdTables(sql)]
      .filter(name => !live.has(name))
      .filter(name => !(name in TABLE_SCOPES))
      .filter(name => !(name in RETIRED_TABLES))
      // Une table créée puis retirée par une autre migration n'a rien à classer.
      .filter(name => !gone.has(name))
      .sort()
    expect(orphans).toEqual([])
  })

  it('une table déclarée retirée l’est vraiment, et une entrée retirée n’est pas classée deux fois', () => {
    const sql = migrationSql()
    const gone = goneTables(sql)
    expect(Object.keys(RETIRED_TABLES).filter(name => !gone.has(name))).toEqual([])
    expect(Object.keys(RETIRED_TABLES).filter(name => name in TABLE_SCOPES)).toEqual([])
    expect(Object.values(RETIRED_TABLES).filter(reason => reason.trim().length <= 80)).toEqual([])
  })
})
