import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-26 — UN RÉGLAGE D'ESPACE VIT À UN SEUL ENDROIT.
 *
 * #2035.10 / #2035.11 — fusionné le 21/09/2026, deux implémentations
 * concurrentes. Deux vagues d'intégration lancées en parallèle le 21/09 ont
 * construit les MÊMES deux réglages d'espace, chacune sans voir l'autre : la
 * vague 2 a livré `workspace_reverse_market_settings` /
 * `workspace_commercial_load_settings` (parties EN PRODUCTION à 11 h 18), la
 * vague 3 les mêmes sujets sous `..._capacity_settings`. Un intégrateur les a
 * renommées pour qu'elles COEXISTENT — ce qui a rendu `tsc` vert, et laissé
 * `max_open_needs` défini DES DEUX CÔTÉS.
 *
 * ── CE QUE CETTE GARDE MESURE, ET POURQUOI CELA ────────────────────────────
 * Un réglage d'espace se reconnaît à sa table : `workspace_<sujet>_settings`,
 * une ligne par espace. La garde lit les ENTITÉS (la seule description du
 * schéma que le code porte), en extrait le nom de chaque COLONNE, et refuse
 * qu'une même colonne de réglage soit déclarée sur DEUX tables de réglage.
 * C'est exactement le défaut qu'on vient de payer : deux tables, un seul
 * réglage, et rien qui dise laquelle fait foi.
 *
 * Les colonnes STRUCTURELLES (`workspace_id`, `created_at`, `updated_at`, `id`)
 * sont exclues : elles décrivent la forme d'une table de réglage, pas un
 * réglage. Leur répétition est la convention, pas un doublon.
 *
 * ── UNE GARDE DOIT SAVOIR DIRE NON, ET PROUVER QU'ELLE LIT ─────────────────
 * Le corpus est vérifié avant la règle : une garde qui ne trouverait plus
 * aucune entité de réglage passerait au vert en ne mesurant rien. Elle exige
 * donc d'avoir lu au moins deux tables de réglage et au moins deux colonnes
 * de réglage — sinon elle échoue en disant qu'elle est aveugle.
 */

const ENTITIES = join(__dirname, '..', 'database', 'entities')

/** La forme d'une table de réglage d'espace, pas un réglage. */
const STRUCTURAL_COLUMNS = new Set(['id', 'workspace_id', 'created_at', 'updated_at'])

type SettingsTable = { table: string; file: string; columns: string[] }

/**
 * Les colonnes d'une entité TypeORM : `@Column('type', …)` / `@PrimaryColumn`
 * suivis du nom de la propriété. Les entités de ce dépôt nomment leurs
 * propriétés comme la colonne (`max_open_needs`), ce que la garde vérifie
 * indirectement en exigeant un corpus non vide.
 */
function columnsOf(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const columns: string[] = []
  const decorator = /@(?:Primary)?Column\([^)]*\)\s*(?:\/\*[\s\S]*?\*\/\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*[?!]?\s*:/g
  for (const match of withoutComments.matchAll(decorator)) {
    columns.push(match[1] as string)
  }
  return columns
}

function settingsTables(): SettingsTable[] {
  const out: SettingsTable[] = []
  for (const file of readdirSync(ENTITIES)) {
    if (!file.endsWith('.entity.ts')) continue
    const source = readFileSync(join(ENTITIES, file), 'utf8')
    const table = /@Entity\(\{\s*name:\s*'([a-z0-9_]+)'/.exec(source)?.[1]
    if (!table) continue
    if (!table.startsWith('workspace_') || !table.endsWith('_settings')) continue
    out.push({ table, file, columns: columnsOf(source).filter(column => !STRUCTURAL_COLUMNS.has(column)) })
  }
  return out
}

describe('GA-26 — un réglage d’espace ne se définit pas à deux endroits', () => {
  const tables = settingsTables()

  it('la garde lit vraiment des tables de réglage — sinon elle est aveugle, pas verte', () => {
    // Sans ce préalable, supprimer toutes les entités de réglage rendrait la
    // règle ci-dessous verte en ne mesurant rien du tout.
    expect(tables.length).toBeGreaterThanOrEqual(2)
    expect(tables.flatMap(entry => entry.columns).length).toBeGreaterThanOrEqual(2)
  })

  it('aucune colonne de réglage n’est déclarée sur deux tables `workspace_*_settings`', () => {
    const homes = new Map<string, string[]>()
    for (const entry of tables) {
      for (const column of entry.columns) {
        homes.set(column, [...(homes.get(column) ?? []), entry.table])
      }
    }

    const duplicated = [...homes.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([column, owners]) => `${column} → ${owners.join(' + ')}`)

    // Si ce test tombe : le même réglage existe sur deux tables. Ce n'est pas
    // un conflit de noms à contourner par un renommage — c'est une SECONDE
    // implémentation du même réglage. Fusionne-la dans celle qui porte déjà
    // des données, et supprime l'autre (GA-26).
    expect(duplicated).toEqual([])
  })

  it('aucune table de réglage ne double le SUJET d’une autre', () => {
    // `workspace_reverse_market_settings` et
    // `workspace_reverse_market_capacity_settings` répondent au même sujet :
    // le préfixe de l'une est le préfixe de l'autre. Un sujet = une table.
    const subjects = tables.map(entry => entry.table.replace(/^workspace_|_settings$/g, ''))
    const nested = subjects
      .flatMap(subject =>
        subjects
          .filter(other => other !== subject && other.startsWith(`${subject}_`))
          .map(other => `${subject} ⊂ ${other}`),
      )
      .sort()

    expect(nested).toEqual([])
  })
})
