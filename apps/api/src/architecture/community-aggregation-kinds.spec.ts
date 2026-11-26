import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  SHARED_AGGREGATE_TABLES,
  SHARED_BASE_MIN_WORKSPACES,
  SHARED_COORDINATE_TABLES,
  SHARED_FACT_TABLES,
  SHARED_FACT_USER_FORBIDDEN_COLUMNS,
  SHARED_FORBIDDEN_COLUMNS,
  poolSharedCells,
  toSharedPersonFact,
} from '@bellum/contracts'

/**
 * GA-43 — un chiffre ne sort d'un espace qu'AGRÉGÉ, ANONYME, et porté par au
 * moins trois espaces.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ RENVERSEMENT ASSUMÉ ET DATÉ — Louis, 09/10/2026 (lot P05, #3246)
 * ─────────────────────────────────────────────────────────────────────────────
 * « je veux une base de donnée qui naît de toutes les infos en anonyme de tous
 *   nos users pour avoir plus de signaux de datas et tout, tout doit s'aider »
 *
 * Jusqu'au 09/10/2026, GA-43 gardait l'INVERSE : « le coût d'accès ne s'agrège
 * JAMAIS entre espaces — les espaces sont des ESN, donc des concurrents ; c'est
 * un échange d'informations tarifaires » (tome 8, D70 et §54), en refusant
 * toute lecture inter-espaces de `access_facts` qui mentionnait `cost`. Cette
 * règle est REMPLACÉE, pas effacée : son texte vit au registre de doctrine
 * (`c92_base_anonyme_commune.supersedes`) et dans `agent_docs/doctrine.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE TIENT DÉSORMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * La nouvelle règle n'est pas « tout se mélange » ; elle a trois garde-fous, et
 * la garde les relit dans le SCHÉMA et dans le CODE qui écrit :
 *  · aucune table commune ne porte une colonne de portée, d'identité ou de
 *    texte libre (`SHARED_FORBIDDEN_COLUMNS`) ;
 *  · chaque table commune porte un CHECK `contributing_workspaces >= 3` — un
 *    agrégat SOUS le seuil est refusé par la base elle-même ;
 *  · chaque colonne texte d'une table commune est un JETON fermé (`IN (…)` ou
 *    motif `~ '^[a-z]…'`) — un nom n'y entre pas ;
 *  · tout code qui écrit dans une table commune passe par `poolSharedCells`
 *    (le seuil, l'anonymat, le refus du texte libre).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ÉLARGISSEMENT DATÉ — Louis, 11/10/2026 (#3989, `c94_base_commune_capitalise_tout`)
 * ─────────────────────────────────────────────────────────────────────────────
 * « si c'est Bellum qui les a sorties, on se doit de les réutiliser, et si
 *   c'est nos utilisateurs, on garde tout mais juste on anonymise »
 *
 * Une seconde famille de tables communes s'ajoute aux agrégats : les FAITS
 * société (`SHARED_FACT_TABLES`). Ce que Bellum a collecté y entre nommé ; ce
 * qu'un utilisateur a apporté y entre ANONYMISÉ. La garde tient la nouvelle
 * frontière par trois lectures, et elle sait dire NON à chacune :
 *  · aucune table de faits ne porte une colonne de PORTÉE ni de coordonnée
 *    (jamais l'espace qui a collecté, jamais un e-mail ni un téléphone) ;
 *  · chaque table de faits porte un CHECK nommé qui refuse une ligne d'origine
 *    `user` portant un nom, un profil ou une empreinte — une donnée
 *    d'utilisateur NON anonymisée est refusée par PostgreSQL lui-même ;
 *  · tout code qui écrit dans une table de faits passe par
 *    `toSharedPersonFact` (la règle de la frontière, `shared-company-facts.ts`).
 *
 * Le cloisonnement des données NOMINATIVES d'un espace ne bouge pas : il est
 * tenu par GA-46 (`workspace-isolation.spec.ts`), la RLS et le test #3671.
 * Seule exception écrite : un fait public collecté par BELLUM (c94).
 *
 * ⚠️ La garde lit du SQL : les commentaires sont retirés AVANT, sans quoi ce
 * docblock — qui écrit `workspace_id` — se dénoncerait.
 */

const API_SRC = join(__dirname, '..')
const MIGRATIONS = join(API_SRC, 'migrations')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue
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

function migrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .sort()
    .map(name => stripComments(readFileSync(join(MIGRATIONS, name), 'utf8')).split('public async down')[0] ?? '')
    .join('\n')
}

/** Le corps du `CREATE TABLE <table> (…)`, jusqu'à la parenthèse fermante qui l'équilibre. */
function createBody(sql: string, table: string): string | null {
  const start = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${table}\\s*\\(`, 'i').exec(sql)
  if (!start) return null
  let depth = 1
  let index = start.index + start[0].length
  const from = index
  while (index < sql.length && depth > 0) {
    if (sql[index] === '(') depth += 1
    if (sql[index] === ')') depth -= 1
    index += 1
  }
  return sql.slice(from, index - 1)
}

/** Tout ce qu'une migration ajoute ensuite à la table (`ALTER TABLE <table> … ADD COLUMN`). */
function laterAdditions(sql: string, table: string): string {
  return [...sql.matchAll(new RegExp(`ALTER TABLE (?:IF EXISTS )?${table}\\b([^\`;]*)`, 'gi'))]
    .map(match => match[1] ?? '')
    .join('\n')
}

type Problem = string

/** La règle, appliquée à UN schéma — rejouable sur un schéma fabriqué. */
function schemaProblems(table: string, body: string, additions: string): Problem[] {
  const problems: Problem[] = []
  const all = `${body}\n${additions}`
  const columns = [
    ...all.matchAll(
      /(?:^|,|ADD COLUMN (?:IF NOT EXISTS )?)\s*([a-z_]+)\s+(text|integer|int|uuid|timestamptz|jsonb|numeric|boolean)\b/gim,
    ),
  ].map(match => ({ name: (match[1] ?? '').toLowerCase(), type: (match[2] ?? '').toLowerCase() }))
  for (const column of columns) {
    if ((SHARED_FORBIDDEN_COLUMNS as readonly string[]).includes(column.name)) {
      problems.push(
        `${table}.${column.name} — colonne interdite dans une table commune (portée, identité ou texte libre)`,
      )
    }
    if (column.type === 'jsonb') problems.push(`${table}.${column.name} — un jsonb est un texte libre déguisé`)
    if (column.type === 'text') {
      const closed = new RegExp(`CHECK\\s*\\(\\s*${column.name}\\s+(?:IN\\s*\\(|~\\s*'\\^\\[a-z\\])`, 'i').test(all)
      if (!closed)
        problems.push(`${table}.${column.name} — colonne texte sans vocabulaire fermé (IN ou motif de jeton)`)
    }
  }
  const threshold = new RegExp(
    `CONSTRAINT\\s+[a-z0-9_]+\\s+CHECK\\s*\\(\\s*contributing_workspaces\\s*>=\\s*${SHARED_BASE_MIN_WORKSPACES}\\s*\\)`,
    'i',
  )
  if (!threshold.test(body)) {
    problems.push(`${table} — aucun CHECK nommé contributing_workspaces >= ${SHARED_BASE_MIN_WORKSPACES}`)
  }
  return problems
}

/** Les fichiers de code qui ÉCRIVENT dans une table commune. */
function writers(): { file: string; source: string }[] {
  const found: { file: string; source: string }[] = []
  for (const file of sourceFiles(join(API_SRC, 'modules'))) {
    const source = stripComments(readFileSync(file, 'utf8'))
    if (SHARED_AGGREGATE_TABLES.some(table => new RegExp(`INSERT INTO ${table}\\b`, 'i').test(source))) {
      found.push({ file, source })
    }
  }
  return found
}

/**
 * L'écrivain appelle `poolSharedCells` lui-même, ou importe (un niveau, chemin
 * relatif) le module pur qui l'appelle — `shared-base-cells.ts` est ce module.
 */
function poolsThroughThreshold(file: string, source: string): boolean {
  if (/\bpoolSharedCells\s*\(/.test(source)) return true
  return [...source.matchAll(/from '(\.{1,2}\/[^']+)'/g)].some(match => {
    const target = join(dirname(file), `${match[1]}.ts`)
    return existsSync(target) && /\bpoolSharedCells\s*\(/.test(stripComments(readFileSync(target, 'utf8')))
  })
}

describe('GA-43 — un chiffre ne sort d’un espace qu’agrégé, anonyme, à trois espaces au moins', () => {
  const sql = migrationSql()

  it('LIT quelque chose — chaque table commune est créée par une migration', () => {
    expect(SHARED_AGGREGATE_TABLES.length).toBeGreaterThan(0)
    for (const table of SHARED_AGGREGATE_TABLES)
      expect({ table, created: createBody(sql, table) !== null }).toEqual({ table, created: true })
  })

  it('aucune table commune ne porte une portée, une identité ou un texte libre ; toutes portent le seuil', () => {
    const problems = SHARED_AGGREGATE_TABLES.flatMap(table =>
      schemaProblems(table, createBody(sql, table) ?? '', laterAdditions(sql, table)),
    )
    expect(problems).toEqual([])
  })

  it('tout code qui écrit dans une table commune passe par poolSharedCells', () => {
    expect(writers().length).toBeGreaterThan(0)
    const offenders = writers()
      .filter(({ file, source }) => !poolsThroughThreshold(file, source))
      .map(({ file }) => file.slice(file.indexOf('/modules')))
    expect(offenders).toEqual([])
  })

  it('sait dire NON — un écrivain qui insère sans passer par le seuil est refusé', () => {
    const file = join(API_SRC, 'modules', 'imaginaire', 'writer.ts')
    expect(poolsThroughThreshold(file, 'INSERT INTO shared_case_outcome_aggregates VALUES ($1)')).toBe(false)
    expect(poolsThroughThreshold(file, 'const cells = poolSharedCells(rows)')).toBe(true)
  })

  it('sait dire NON — un schéma qui porte workspace_id, un nom, ou pas de seuil, est refusé', () => {
    const saine = `
      scope text NOT NULL,
      value text NOT NULL,
      won integer NOT NULL,
      contributing_workspaces integer NOT NULL,
      CONSTRAINT t_scope_check CHECK (scope IN ('live', 'demo')),
      CONSTRAINT t_value_token_check CHECK (value ~ '^[a-z][a-z0-9_]{0,47}$'),
      CONSTRAINT t_k_check CHECK (contributing_workspaces >= 3)`
    expect(schemaProblems('t', saine, '')).toEqual([])

    const avecEspace = `workspace_id uuid NOT NULL,${saine}`
    expect(schemaProblems('t', avecEspace, '').join()).toMatch(/workspace_id/)

    const avecNom = `${saine},\n      company_name text NOT NULL`
    expect(schemaProblems('t', avecNom, '').join()).toMatch(/company_name/)

    const texteLibre = `${saine},\n      motif text NOT NULL`
    expect(schemaProblems('t', texteLibre, '').join()).toMatch(/motif — colonne texte sans vocabulaire fermé/)

    const sousLeSeuil = saine.replace('>= 3', '>= 2')
    expect(schemaProblems('t', sousLeSeuil, '').join()).toMatch(/aucun CHECK nommé contributing_workspaces/)

    const ajoutTardif = 'ADD COLUMN IF NOT EXISTS account_id uuid'
    expect(schemaProblems('t', saine, ajoutTardif).join()).toMatch(/account_id/)
  })

  it('sait dire NON — un agrégat sous le seuil ou portant un nom ne sort pas de poolSharedCells', () => {
    const deux = ['w1', 'w2'].map(workspaceId => ({ workspaceId, cell: { value: 'relance' }, counts: { won: 1 } }))
    expect(poolSharedCells(deux)).toEqual([])
    const nomme = ['w1', 'w2', 'w3'].map(workspaceId => ({
      workspaceId,
      cell: { value: 'Airbus' },
      counts: { won: 1 },
    }))
    expect(poolSharedCells(nomme)).toEqual([])
    const sain = ['w1', 'w2', 'w3'].map(workspaceId => ({
      workspaceId,
      cell: { value: 'relance' },
      counts: { won: 1 },
    }))
    expect(poolSharedCells(sain)).toHaveLength(1)
  })
})

/** Ce qu'une table de FAITS communs ne porte jamais : une portée, un objet d'espace, une coordonnée, un texte saisi. */
const SHARED_FACT_FORBIDDEN_COLUMNS = SHARED_FORBIDDEN_COLUMNS.filter(
  column => column !== 'name' && column !== 'full_name',
)

/** La règle des faits, appliquée à UN schéma — rejouable sur un schéma fabriqué. */
function factSchemaProblems(table: string, body: string, additions: string): Problem[] {
  const problems: Problem[] = []
  const all = `${body}\n${additions}`
  const columns = [
    ...all.matchAll(
      /(?:^|,|ADD COLUMN (?:IF NOT EXISTS )?)\s*([a-z_]+)\s+(text|integer|int|uuid|timestamptz|jsonb|numeric|boolean)\b/gim,
    ),
  ].map(match => (match[1] ?? '').toLowerCase())
  for (const column of columns) {
    if ((SHARED_FACT_FORBIDDEN_COLUMNS as readonly string[]).includes(column)) {
      problems.push(`${table}.${column} — colonne interdite dans une table de faits communs (portée ou coordonnée)`)
    }
  }
  const guard = /CONSTRAINT\s+[a-z0-9_]+\s+CHECK\s*\(\s*origin\s*=\s*'bellum'\s+OR\s*\(([^;]*?)\)\s*\)/i.exec(all)
  const clause = guard?.[1] ?? ''
  for (const column of SHARED_FACT_USER_FORBIDDEN_COLUMNS) {
    const held =
      new RegExp(`\\b${column}\\s+IS\\s+NULL\\b`, 'i').test(clause) ||
      new RegExp(`cardinality\\(\\s*${column}\\s*\\)\\s*=\\s*0`, 'i').test(clause)
    if (!held) problems.push(`${table} — aucun CHECK nommé ne refuse ${column} sur une ligne d'origine « user »`)
  }
  return problems
}

/** Les fichiers de code qui ÉCRIVENT dans une table de faits communs. */
function factWriters(): { file: string; source: string }[] {
  return sourceFiles(join(API_SRC, 'modules'))
    .map(file => ({ file, source: stripComments(readFileSync(file, 'utf8')) }))
    .filter(({ source }) => SHARED_FACT_TABLES.some(table => new RegExp(`INSERT INTO ${table}\\b`, 'i').test(source)))
}

/** L'écrivain anonymise lui-même, ou importe (un niveau, chemin relatif) le module pur qui le fait. */
function anonymizesThroughFrontier(file: string, source: string): boolean {
  if (/\btoSharedPersonFact\s*\(/.test(source)) return true
  return [...source.matchAll(/from '(\.{1,2}\/[^']+)'/g)].some(match => {
    const target = join(dirname(file), `${match[1]}.ts`)
    return existsSync(target) && /\btoSharedPersonFact\s*\(/.test(stripComments(readFileSync(target, 'utf8')))
  })
}

describe('GA-43 (élargi 11/10/2026, c94) — un fait d’utilisateur n’entre dans la base commune qu’anonymisé', () => {
  const sql = migrationSql()

  it('LIT quelque chose — chaque table de faits communs est créée par une migration', () => {
    expect(SHARED_FACT_TABLES.length).toBeGreaterThan(0)
    for (const table of SHARED_FACT_TABLES)
      expect({ table, created: createBody(sql, table) !== null }).toEqual({ table, created: true })
  })

  it('aucune table de faits ne porte de portée ni de coordonnée ; toutes refusent un fait « user » nominatif', () => {
    const problems = SHARED_FACT_TABLES.flatMap(table =>
      factSchemaProblems(table, createBody(sql, table) ?? '', laterAdditions(sql, table)),
    )
    expect(problems).toEqual([])
  })

  it('tout code qui écrit dans une table de faits passe par toSharedPersonFact', () => {
    expect(factWriters().length).toBeGreaterThan(0)
    const offenders = factWriters()
      .filter(({ file, source }) => !anonymizesThroughFrontier(file, source))
      .map(({ file }) => file.slice(file.indexOf('/modules')))
    expect(offenders).toEqual([])
  })

  it('sait dire NON — un schéma qui laisse entrer un nom d’utilisateur, ou qui nomme l’espace, est refusé', () => {
    const saine = `
      origin text NOT NULL,
      full_name text NULL,
      title text NULL,
      linkedin_url text NULL,
      person_fingerprints text[] NOT NULL DEFAULT '{}',
      CONSTRAINT t_user_anonymized_check CHECK (origin = 'bellum' OR (full_name IS NULL AND linkedin_url IS NULL AND cardinality(person_fingerprints) = 0))`
    expect(factSchemaProblems('t', saine, '')).toEqual([])

    const sansGarde = saine.replace(/,\s*CONSTRAINT t_user_anonymized_check[^\n]*/, '')
    expect(factSchemaProblems('t', sansGarde, '').join()).toMatch(/full_name sur une ligne d'origine « user »/)

    const garde = "CHECK (origin = 'bellum' OR (full_name IS NULL AND linkedin_url IS NULL"
    const nomSeul = saine.replace(`${garde} AND cardinality(person_fingerprints) = 0))`, `${garde}))`)
    expect(factSchemaProblems('t', nomSeul, '').join()).toMatch(/person_fingerprints/)

    expect(factSchemaProblems('t', `workspace_id uuid NOT NULL,${saine}`, '').join()).toMatch(/workspace_id/)
    expect(factSchemaProblems('t', saine, 'ADD COLUMN IF NOT EXISTS email text').join()).toMatch(/email/)
  })

  it('sait dire NON — un écrivain qui insère sans passer par la frontière est refusé', () => {
    const file = join(API_SRC, 'modules', 'imaginaire', 'writer.ts')
    expect(anonymizesThroughFrontier(file, 'INSERT INTO shared_company_people VALUES ($1)')).toBe(false)
    expect(anonymizesThroughFrontier(file, 'const fact = toSharedPersonFact(row)')).toBe(true)
  })

  it('sait dire NON — un contact importé par un utilisateur ne sort jamais avec son nom', () => {
    const fact = toSharedPersonFact({ source: 'import', fullName: 'Marc Lefèvre', title: 'DSI', linkedinUrl: 'x' })
    expect(fact).toEqual({ origin: 'user', fullName: null, title: 'DSI', linkedinUrl: null })
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ EXCEPTION NOMMÉE ET DATÉE — « cache d'enrichissement commun », Louis 15/10/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * « pour le cache je veux pas que ce soit sur le user mais sur tout le monde, il
 *   ne doit pas y avoir de GA-43 dans ce cas » (crédits TheirStack épuisés en
 *   5 jours : une même question ne se paie pas deux fois en 30 jours).
 *
 * Le cache des coordonnées ACHETÉES (Hunter, Lusha, Kaspr, FullEnrich,
 * Dropcontact) est donc COMMUN à tous les espaces : sa clé est la personne
 * seule. Ce n'est PAS une table commune (le seuil de trois espaces et
 * l'anonymat de la base commune ne le concernent pas) : il ne sert que l'APPEL
 * FOURNISSEUR, jamais la fiche d'un espace. Ce que la garde tient encore :
 *  · seul `person-contact-cache.ts` peut ranger une clé `pcache:` — toute autre
 *    clé de cache partagée entre espaces reste refusée tant qu'elle n'est pas
 *    déclarée ici avec sa décision ;
 *  · la dérivation de clé du cache commun ne contient AUCUN identifiant d'espace ;
 *  · l'effacement RGPD (c67) purge ce cache (couvert par person-erasure.service.spec.ts).
 */
const SHARED_PROVIDER_CACHES: readonly { file: string; prefix: string; decision: string }[] = [
  {
    file: 'modules/contacts/person-contact-cache.ts',
    prefix: 'pcache:',
    decision: "cache d'enrichissement commun, Louis 15/10/2026",
  },
]

/** Les fichiers (hors specs) qui nomment un préfixe de cache partagé `pcache:` sans l'avoir déclaré. */
function undeclaredSharedCaches(files: { file: string; source: string }[]): string[] {
  return files
    .filter(
      ({ file, source }) => /['"`]pcache:/.test(source) && !SHARED_PROVIDER_CACHES.some(c => file.endsWith(c.file)),
    )
    .map(({ file }) => file)
}

describe('GA-43 (exception 15/10/2026) — cache d’enrichissement commun : permis, nommé, et rien d’autre', () => {
  const all = sourceFiles(join(API_SRC, 'modules')).map(file => ({
    file,
    source: stripComments(readFileSync(file, 'utf8')),
  }))

  it('LIT quelque chose — le cache commun déclaré existe et range bien des clés pcache:', () => {
    for (const cache of SHARED_PROVIDER_CACHES) {
      const found = all.find(({ file }) => file.endsWith(cache.file))
      expect({ file: cache.file, found: Boolean(found), prefix: found?.source.includes(cache.prefix) }).toEqual({
        file: cache.file,
        found: true,
        prefix: true,
      })
    }
  })

  it('aucun autre fichier ne range de clé de cache partagée sans l’avoir déclarée', () => {
    expect(undeclaredSharedCaches(all)).toEqual([])
  })

  it('la clé du cache commun ne porte aucun identifiant d’espace', () => {
    const source = all.find(({ file }) => file.endsWith('modules/contacts/person-contact-cache.ts'))?.source ?? ''
    const keyOf = /function keyOf\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(source)
    expect(keyOf).not.toBeNull()
    expect(`${keyOf?.[0] ?? ''}`).not.toMatch(/workspace|tenant|userId|user_id/i)
    expect(source).toContain("'pcache:contact:v2'")
  })

  it('sait dire NON — une clé de cache partagée non déclarée est refusée', () => {
    const intrus = [{ file: join(API_SRC, 'modules', 'imaginaire', 'cache.ts'), source: "const k = 'pcache:notes:v1'" }]
    expect(undeclaredSharedCaches(intrus)).toHaveLength(1)
    const declare = [
      {
        file: join(API_SRC, 'modules', 'contacts', 'person-contact-cache.ts'),
        source: "const k = 'pcache:contact:v2'",
      },
    ]
    expect(undeclaredSharedCaches(declare)).toEqual([])
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ÉLARGISSEMENT NOMMÉ ET DATÉ — « coordonnée pro réutilisée », Louis 15/10/2026 (#3989.7)
 * ─────────────────────────────────────────────────────────────────────────────
 * « une coordonnée pro (e-mail, téléphone) déjà trouvée dans un autre espace est
 *   réutilisée dans un nouvel espace — la donnée seule, comme intrant commun. On
 *   ne montre jamais quel espace l'a trouvée, ni notes, ni statut commercial, ni coût. »
 *
 * Les tables de FAITS (ci-dessus) gardent leur interdit de coordonnée : la
 * coordonnée vit À PART (`SHARED_COORDINATE_TABLES`), et la garde tient :
 *  · aucune colonne de portée, de note, de statut, de COÛT ni de fournisseur
 *    (le coût d'accès à une personne ne s'agrège toujours pas) ;
 *  · chaque ligne pend à un fait NOMMÉ par une FK `ON DELETE CASCADE` — l'effacement
 *    RGPD (c67) qui supprime le fait emporte ses coordonnées, l'empreinte bloque le retour ;
 *  · seul un écrivain qui passe par `toSharedCoordinates` y insère.
 */
const COORDINATE_FORBIDDEN =
  /\b(workspace_id|user_id|account_id|scope|note[s]?|status|cost|credits?|price|provider|source)\b\s+(text|integer|int|uuid|numeric|jsonb|boolean)/i

function coordinateSchemaProblems(table: string, body: string, additions: string): string[] {
  const problems: string[] = []
  const all = `${body}\n${additions}`
  const forbidden = COORDINATE_FORBIDDEN.exec(all)
  if (forbidden) problems.push(`${table}.${forbidden[1]} — colonne interdite (espace, note, statut, coût, fournisseur)`)
  if (!/REFERENCES\s+shared_company_people\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i.test(all))
    problems.push(`${table} — aucune FK en cascade vers shared_company_people : l'effacement RGPD ne l'emporterait pas`)
  return problems
}

describe('GA-43 (élargi 15/10/2026, #3989.7) — une coordonnée pro se réutilise, la donnée seule', () => {
  const sql = migrationSql()

  it('LIT quelque chose — la table des coordonnées partagées est créée par une migration', () => {
    for (const table of SHARED_COORDINATE_TABLES)
      expect({ table, created: createBody(sql, table) !== null }).toEqual({ table, created: true })
  })

  it('ni espace, ni note, ni statut, ni coût ; effacée avec la personne', () => {
    const problems = SHARED_COORDINATE_TABLES.flatMap(table =>
      coordinateSchemaProblems(table, createBody(sql, table) ?? '', laterAdditions(sql, table)),
    )
    expect(problems).toEqual([])
  })

  it('tout code qui y écrit passe par toSharedCoordinates', () => {
    const writers = sourceFiles(join(API_SRC, 'modules'))
      .map(file => ({ file, source: stripComments(readFileSync(file, 'utf8')) }))
      .filter(({ source }) => SHARED_COORDINATE_TABLES.some(t => new RegExp(`INSERT INTO ${t}\\b`, 'i').test(source)))
    expect(writers.length).toBeGreaterThan(0)
    expect(writers.filter(({ source }) => !/\btoSharedCoordinates\s*\(/.test(source)).map(w => w.file)).toEqual([])
  })

  it('sait dire NON — une colonne de coût ou d’espace, ou une coordonnée qui survivrait à l’effacement', () => {
    const saine =
      'fact_id uuid PRIMARY KEY, email text NULL, CONSTRAINT f FOREIGN KEY (fact_id) REFERENCES shared_company_people (id) ON DELETE CASCADE'
    expect(coordinateSchemaProblems('t', saine, '')).toEqual([])
    expect(coordinateSchemaProblems('t', `${saine}, cost_cents integer`, 'ADD COLUMN credits integer').join()).toMatch(
      /credits/,
    )
    expect(coordinateSchemaProblems('t', `workspace_id uuid NOT NULL, ${saine}`, '').join()).toMatch(/workspace_id/)
    expect(coordinateSchemaProblems('t', saine.replace(' ON DELETE CASCADE', ''), '').join()).toMatch(/cascade/)
  })
})
