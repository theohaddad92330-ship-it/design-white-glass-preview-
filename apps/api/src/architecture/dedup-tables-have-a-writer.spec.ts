import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-123 — une table qui EMPÊCHE un doublon doit avoir un ÉCRIVAIN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A PRODUIT CETTE GARDE (T-069, mesuré le 30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `sync_links` porte, dans sa migration ET dans le docblock de
 * `CrmImportService`, la phrase « c'est la seule chose qui empêche un second
 * import de créer une seconde fiche ». La table n'a jamais reçu une seule
 * ligne : les trois seuls accès du service étaient un `find`, un `query` de
 * lecture, et un `UPDATE` — et **un `UPDATE` sur une ligne jamais insérée est un
 * no-op silencieux**. Aucune erreur, aucun log, `affected: 0`.
 *
 * Ce que la table vide produisait réellement, mesuré avant la réparation :
 *  - l'index `byExternalId` était vide à chaque import, donc la branche `update`
 *    était INATTEIGNABLE — aucun champ de contact n'a jamais été écrit par un
 *    import ;
 *  - toute adresse déjà connue de l'espace repartait en
 *    `already_linked_elsewhere` (« conflit »), à chaque passage, indéfiniment.
 *
 * Et le test unitaire du service était VERT, parce qu'il pré-remplissait le
 * dépôt de liens à la main. C'est le motif « un test qui simule ce qui n'arrive
 * jamais » : il prouvait la lecture, jamais l'écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Pour chaque table déclarée ci-dessous comme clé de déduplication ou
 * d'idempotence :
 *  1. la table est bien CRÉÉE par une migration (sinon la promesse porte sur
 *    rien) ;
 *  2. chacun de ses écrivains déclarés existe sur le disque ;
 *  3. chaque écrivain contient une écriture qui NOMME la table — un `INSERT
 *    INTO <table>`, ou une insertion ORM sur son dépôt.
 *
 * ⚠️ CE QU'ELLE NE PEUT PAS SAVOIR. Elle lit du TEXTE, pas une base : « le
 * service contient un INSERT » n'est pas « une ligne existe en production ».
 * Elle ne sait pas non plus si la branche qui contient l'insertion est
 * atteignable — c'est précisément ce qui manquait ici, et c'est pourquoi le
 * lot a AUSSI livré un test de comportement à deux imports successifs
 * (`crm-import.service.spec.ts`, « un SECOND import ne recrée rien »). Cette
 * garde-ci attrape l'absence pure ; le test de comportement attrape le reste.
 */

const API_SRC = join(__dirname, '..')
const MIGRATIONS = join(API_SRC, 'migrations')

type DedupTable = {
  /** Le nom SQL de la table. */
  table: string
  /** La promesse portée par le code, telle qu'elle est écrite. */
  claim: string
  /** Les fichiers de PRODUCTION qui doivent l'écrire, relatifs à `apps/api/src`. */
  writers: string[]
}

/**
 * Les tables dont un docblock du dépôt affirme qu'elles empêchent un doublon.
 *
 * La liste grandit quand une nouvelle clé de rattachement apparaît. Elle ne
 * rétrécit pas : retirer une entrée sans retirer la promesse qui va avec est
 * exactement le geste que cette garde existe pour rendre visible.
 */
const DEDUP_TABLES: DedupTable[] = [
  {
    table: 'sync_links',
    claim: 'empêche un second import de créer une seconde fiche pour la même personne',
    writers: ['modules/crm/crm-import.service.ts'],
  },
]

/** Une écriture qui NOMME la table : SQL brut, ou insertion ORM sur son dépôt. */
function writesTo(source: string, table: string): boolean {
  const sql = new RegExp(`INSERT\\s+INTO\\s+${table}\\b`, 'i')
  if (sql.test(source)) return true
  // Forme ORM : `<repo>.insert(` / `.save(` où `<repo>` est le dépôt de la table.
  // On reste volontairement strict — un `.save(` anonyme ne prouve rien.
  const orm = new RegExp(`${table}[\\s\\S]{0,400}?\\.(insert|upsert)\\(`, 'i')
  return orm.test(source)
}

describe('GA-123 — une table de déduplication a un écrivain', () => {
  it('le corpus n’est pas vide et chaque écrivain déclaré existe', () => {
    // Une garde qui ne LIT rien passe toujours. On prouve d'abord qu'elle a
    // ouvert quelque chose, et que ce quelque chose a du contenu.
    expect(DEDUP_TABLES.length).toBeGreaterThan(0)

    for (const entry of DEDUP_TABLES) {
      expect(entry.writers.length).toBeGreaterThan(0)
      for (const writer of entry.writers) {
        const full = join(API_SRC, writer)
        expect(existsSync(full)).toBe(true)
        expect(readFileSync(full, 'utf8').length).toBeGreaterThan(500)
      }
    }
  })

  it('chaque table déclarée est réellement CRÉÉE par une migration', () => {
    const migrations = readdirSync(MIGRATIONS)
      .filter(file => file.endsWith('.ts'))
      .map(file => readFileSync(join(MIGRATIONS, file), 'utf8'))
    // Preuve de lecture : le dossier des migrations n'est pas vide.
    expect(migrations.length).toBeGreaterThan(10)

    for (const entry of DEDUP_TABLES) {
      const created = migrations.some(source =>
        new RegExp(`CREATE\\s+TABLE(\\s+IF\\s+NOT\\s+EXISTS)?\\s+${entry.table}\\b`, 'i').test(source),
      )
      expect({ table: entry.table, created }).toEqual({ table: entry.table, created: true })
    }
  })

  it('chaque table déclarée est ÉCRITE par au moins un de ses écrivains', () => {
    const offenders = DEDUP_TABLES.filter(entry =>
      entry.writers.every(writer => !writesTo(readFileSync(join(API_SRC, writer), 'utf8'), entry.table)),
    ).map(entry => `${entry.table} — ${entry.claim} — aucun écrivain parmi ${entry.writers.join(', ')}`)

    expect(offenders).toEqual([])
  })
})
