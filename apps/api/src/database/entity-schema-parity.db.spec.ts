/**
 * Toute colonne déclarée par une entité existe-t-elle vraiment dans la base ?
 *
 * `entities-registration.spec.ts` (#881) répond à la question voisine : une
 * classe `@Entity()` est-elle déclarée à TypeORM ? Celle-ci descend d'un cran —
 * la classe est connue, mais elle promet une COLONNE que la table n'a pas.
 *
 * Le défaut est silencieux d'un côté et brutal de l'autre. Une lecture qui
 * énumère ses champs (`select: [...]`) passe sans rien remarquer ; la première
 * ÉCRITURE tombe en `column "x" of relation "y" does not exist`, c'est-à-dire
 * un 500. `rag_documents.metadata` était déclarée sans migration correspondante
 * depuis l'origine du dépôt : personne ne l'écrivait, donc personne ne le
 * savait. Le jour où le seed de la démonstration l'a écrite, CHAQUE ouverture
 * du lien public est tombée en 500 — sur le lien qu'un commercial colle dans un
 * message à un prospect.
 *
 * Aucun test ne pouvait le voir : `getRepositoryToken` est REMPLACÉ dans les
 * specs, donc rien ne touche jamais le vrai schéma. Seule une base réelle
 * tranche, et `information_schema` la dit sans ambiguïté.
 *
 * OPT-IN, comme les autres preuves adossées à une base (voir
 * `migrations/__tests__/1786970000000-RagWorkspaceScope.db.spec.ts`, dont ce
 * fichier reprend l'interrupteur et la doctrine) :
 *
 *   set -a; . tools/dev.secret.sh; set +a
 *   PG_TEST_URL="postgresql://postgres:$POSTGRES_PASSWORD@localhost:5440/postgres" \
 *     npx jest src/database/entity-schema-parity.db
 *
 * L'interrupteur est lu SYNCHRONEMENT, avant que `describe` n'ait choisi entre
 * `it` et `it.skip`. Quand il est posé, une base injoignable fait ÉCHOUER le
 * run : une preuve opt-in qui se saute en silence est pire que pas de preuve.
 * Sans interrupteur, la CI reste verte sans base.
 *
 * Mesuré au 04/08/2026 : 83 entités, 0 table absente, 1 colonne fantôme — celle
 * qui a causé la panne. Le balayage ne produit aucun faux positif, ce qui est
 * précisément ce qu'une analyse statique des migrations ne savait pas faire
 * (les colonnes ajoutées en boucle ou par lot lui échappent, et une garde qui
 * crie faux finit désactivée).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Client } from 'pg'

const CONN =
  process.env.PG_TEST_URL ??
  `postgresql://${process.env.POSTGRES_USER ?? 'postgres'}:${process.env.POSTGRES_PASSWORD ?? 'postgres'}` +
    `@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5440'}/${process.env.POSTGRES_DB ?? 'postgres'}`

/** Lu avant que `describe` ne choisisse `it` vs `it.skip` — voir l'en-tête. */
const DB_TEST_ENABLED = Boolean(process.env.PG_TEST_URL ?? process.env.RAG_DB_TEST)

const SRC_DIR = join(__dirname, '..')

type DeclaredEntity = { table: string; columns: string[]; file: string }

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') sourceFiles(full, out)
    } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Le nom de la table, puis les colonnes déclarées.
 *
 * On lit le nom EXPLICITE quand le décorateur en porte un (`@Column({ name:
 * 'x' })`) et le nom de la propriété sinon — c'est la règle de TypeORM, et s'en
 * écarter ferait accuser des colonnes correctes.
 */
function declaredEntities(): DeclaredEntity[] {
  const found: DeclaredEntity[] = []
  for (const file of sourceFiles(SRC_DIR)) {
    const source = readFileSync(file, 'utf8')
    const table = /@Entity\(\s*(?:\{\s*name:\s*'([^']+)'|'([^']+)')/.exec(source)
    if (!table) continue
    const columns: string[] = []
    const decorator =
      /@(Column|PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn)\(([\s\S]{0,300}?)\)\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_]\w*)\s*[?!]?\s*:/g
    let match: RegExpExecArray | null
    while ((match = decorator.exec(source))) {
      const explicit = /name:\s*'([^']+)'/.exec(match[2])
      columns.push(explicit ? explicit[1] : match[3])
    }
    found.push({ table: table[1] ?? table[2], columns, file: relative(SRC_DIR, file) })
  }
  return found
}

let db: Client | undefined

afterAll(async () => {
  if (db) await db.end().catch(() => undefined)
})

const maybe = (): jest.It => (DB_TEST_ENABLED ? it : it.skip)

describe('entités ↔ schéma réel', () => {
  let liveColumns: Map<string, Set<string>> = new Map()

  beforeAll(async () => {
    if (!DB_TEST_ENABLED) return
    // Échouer bruyamment, jamais sauter : l'interrupteur est posé, donc une base
    // absente est une erreur du run, pas une raison de faire semblant.
    const client = new Client({ connectionString: CONN, connectionTimeoutMillis: 5000 })
    await client.connect()
    db = client
    const { rows } = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    )
    liveColumns = new Map()
    for (const row of rows) {
      const columns = liveColumns.get(row.table_name) ?? new Set<string>()
      columns.add(row.column_name)
      liveColumns.set(row.table_name, columns)
    }
  })

  maybe()('aucune entité ne déclare une colonne que la table n’a pas', () => {
    const phantom: string[] = []
    for (const entity of declaredEntities()) {
      const columns = liveColumns.get(entity.table)
      // Table absente : c'est l'affaire du test suivant, pas de celui-ci.
      if (!columns) continue
      const missing = entity.columns.filter(column => !columns.has(column))
      if (missing.length) {
        phantom.push(`${entity.table} → ${missing.join(', ')}  (${entity.file})`)
      }
    }
    expect(phantom).toEqual([])
  })

  maybe()('toute table déclarée par une entité existe', () => {
    const absent = declaredEntities()
      .filter(entity => !liveColumns.has(entity.table))
      .map(entity => `${entity.table}  (${entity.file})`)
    expect(absent).toEqual([])
  })

  maybe()('le balayage voit bien des entités — sinon il ne prouverait rien', () => {
    // Une extraction cassée rendrait `[]`, et les deux tests ci-dessus
    // passeraient en ne regardant rien.
    expect(declaredEntities().length).toBeGreaterThan(50)
  })
})
