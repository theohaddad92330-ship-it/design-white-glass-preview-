import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SHARED_PUBLIC_FACT_KEY_PATTERN,
  SHARED_PUBLIC_FACT_NATURES,
  SHARED_PUBLIC_FACT_PRIVATE_FAMILIES,
  SHARED_PUBLIC_FACT_WORKSPACE_MARKERS,
  SHARED_PUBLIC_FACTS_STORE,
  TABLE_SCOPES,
} from '@bellum/contracts'

/**
 * GA-414 (#3989, suite de #3971 point d) — LA BASE COMMUNE DES FAITS PUBLICS NE
 * LIT NI N'ÉCRIT RIEN D'UN ESPACE.
 *
 * Les faits société PUBLICS (registre, annonces légales, marchés publics, offres
 * d'emploi, presse) sont partagés entre espaces par le service IA
 * (`public_facts.py` → `source_cache.py`, famille `public_facts`). Les espaces
 * sont des concurrents (doctrine GA-43) : la base commune ne doit lire ni écrire
 * aucune colonne de portée (`workspace_id`, `user_id`…) ni aucune table d'espace.
 *
 * La garde LIT le code Python qui porte la base commune : elle en extrait le SQL,
 * les tables qu'il nomme, et la signature de la porte d'écriture ; puis elle
 * exige l'égalité des listes Python avec le contrat TS (`shared-public-facts.ts`),
 * que la migration redit en SQL. Elle sait dire NON (copies altérées ci-dessous)
 * et prouve qu'elle lit (au moins une requête de lecture et une d'écriture).
 *
 * Elle ne vise PAS la base commune des PERSONNES (`shared_company_people`) : son
 * versement lit les fiches d'un espace par construction (pour les anonymiser),
 * et GA-43 (`community-aggregation-kinds.spec.ts`) tient ses colonnes.
 * Louis 15/10/2026 : la base commune GARDE toutes les personnes de cette table
 * (c94) — la consigne « jamais une donnée d'espace (contacts…) » ne vaut que pour
 * la famille `public_facts` du cache partagé, jamais pour elle.
 */

const ROOT = join(__dirname, '../../../..')
const PUBLIC_FACTS_PY = join(ROOT, 'apps/ia/app/services/public_facts.py')
const SOURCE_CACHE_PY = join(ROOT, 'apps/ia/app/services/source_cache.py')

/** Les littéraux de chaîne d'un fichier Python, commentaires pleins retirés. */
function pythonLiterals(source: string): string[] {
  const code = source.replace(/^\s*#.*$/gm, '')
  const literals = code.match(/"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g) ?? []
  return literals.map(l => l.replace(/^("""|"|')|("""|"|')$/g, ''))
}

/** Le SQL d'un fichier : les littéraux qui portent un mot-clé SQL en capitales. */
function sqlFragments(source: string): string[] {
  return pythonLiterals(source).filter(l =>
    /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|CREATE INDEX|ALTER TABLE|WHERE|VALUES)\b/.test(l),
  )
}

function tablesNamed(sql: string[]): Set<string> {
  const out = new Set<string>()
  for (const fragment of sql) {
    for (const m of fragment.matchAll(
      /\b(?:FROM|INTO|UPDATE|JOIN|TABLE(?: IF NOT EXISTS)?|ON)\s+([a-z_][a-z0-9_]*)/g,
    )) {
      out.add(m[1] as string)
    }
  }
  return out
}

const WORKSPACE_COLUMN = new RegExp(
  `\\b(${[...SHARED_PUBLIC_FACT_WORKSPACE_MARKERS, 'workspace', 'owner_id'].join('|')})\\b`,
)

/** Ce que la garde reproche à un couple (public_facts.py, source_cache.py). */
function violations(publicFacts: string, sourceCache: string): string[] {
  const out: string[] = []
  const sql = [...sqlFragments(publicFacts), ...sqlFragments(sourceCache)]
  for (const table of tablesNamed(sql)) {
    if (table !== SHARED_PUBLIC_FACTS_STORE.table) out.push(`table hors base commune : ${table}`)
  }
  for (const fragment of sql) {
    const hit = WORKSPACE_COLUMN.exec(fragment)
    if (hit) out.push(`colonne d'espace dans le SQL : ${hit[1]}`)
  }
  const gate = /async def cached_fact\(([\s\S]*?)\)\s*->/.exec(publicFacts)
  if (!gate) out.push('porte cached_fact introuvable')
  else if (/\b(workspace|user|account|owner)\w*\s*:/.test(gate[1] as string)) {
    out.push('la porte cached_fact prend un espace, un utilisateur ou un compte')
  }
  return out
}

/** Les éléments d'un `frozenset({...})` ou des clés d'un `dict` Python nommé. */
function pythonSet(source: string, name: string): Set<string> {
  const m = new RegExp(`^${name}\\b[^=]*=\\s*(?:frozenset\\(\\s*)?\\{([\\s\\S]*?)\\}`, 'm').exec(source)
  if (!m) throw new Error(`${name} introuvable`)
  return new Set([...(m[1] as string).matchAll(/"([A-Za-z_]+)"/g)].map(x => x[1] as string))
}

describe('GA-414 — la base commune des faits publics ne lit ni n’écrit rien d’un espace (#3989)', () => {
  const publicFacts = readFileSync(PUBLIC_FACTS_PY, 'utf8')
  const sourceCache = readFileSync(SOURCE_CACHE_PY, 'utf8')

  it('LIT : le SQL de la base commune est extrait — lecture ET écriture', () => {
    const sql = sqlFragments(sourceCache)
    expect(sql.some(s => /SELECT payload/.test(s))).toBe(true)
    expect(sql.some(s => /INSERT INTO source_cache/.test(s))).toBe(true)
    expect(tablesNamed(sql)).toEqual(new Set([SHARED_PUBLIC_FACTS_STORE.table]))
  })

  it('aucune table d’espace, aucune colonne d’espace, aucune porte qui prend un espace', () => {
    expect(violations(publicFacts, sourceCache)).toEqual([])
  })

  it('la seule table qu’elle touche est déclarée PARTAGÉE au registre des portées', () => {
    expect(TABLE_SCOPES[SHARED_PUBLIC_FACTS_STORE.table]?.category).toBe('shared')
  })

  it('sait dire NON — une table d’espace lue, une colonne d’espace écrite, une porte qui prend un espace', () => {
    const readsContacts = `${sourceCache}\n_LEAK_SQL = "SELECT full_name FROM contacts WHERE siren = %s"\n`
    expect(violations(publicFacts, readsContacts)).toContain('table hors base commune : contacts')

    const writesWorkspace = sourceCache.replace(
      'INSERT INTO source_cache (company_key,',
      'INSERT INTO source_cache (workspace_id, company_key,',
    )
    expect(writesWorkspace).not.toBe(sourceCache)
    expect(violations(publicFacts, writesWorkspace)).toContain("colonne d'espace dans le SQL : workspace_id")

    // La mutation vise la porte ELLE-MÊME : d'autres fonctions du module (`share_fact`) portent
    // aussi un `variant: str,` sur sa propre ligne, et une mutation posée chez elles ne prouve rien.
    const gateTakesUser = publicFacts.replace(
      /(async def cached_fact\([\s\S]*?\n {4}variant: str,\n)/,
      '$1    user_id: str,\n',
    )
    expect(gateTakesUser).not.toBe(publicFacts)
    expect(violations(gateTakesUser, sourceCache)).toContain(
      'la porte cached_fact prend un espace, un utilisateur ou un compte',
    )
  })

  it('le code IA dit la même chose que le contrat TS (natures, familles privées, marqueurs, jeton de clé)', () => {
    expect(pythonSet(publicFacts, 'FRESHNESS_S')).toEqual(new Set(SHARED_PUBLIC_FACT_NATURES))
    expect(pythonSet(publicFacts, 'PRIVATE_NATURES')).toEqual(new Set(SHARED_PUBLIC_FACT_PRIVATE_FAMILIES))
    expect(pythonSet(publicFacts, 'WORKSPACE_MARKERS')).toEqual(new Set(SHARED_PUBLIC_FACT_WORKSPACE_MARKERS))
    const variant = /^VARIANT = re\.compile\(r"\^(.+)\$"\)/m.exec(publicFacts)?.[1]
    expect(variant).toBeDefined()
    expect(SHARED_PUBLIC_FACT_KEY_PATTERN.endsWith(`[|]${variant}$`)).toBe(true)
  })

  it('la lecture du miroir sait dire NON — un marqueur oublié côté Python', () => {
    const drifted = publicFacts.replace('"workspaceId", ', '')
    expect(drifted).not.toBe(publicFacts)
    expect(pythonSet(drifted, 'WORKSPACE_MARKERS')).not.toEqual(new Set(SHARED_PUBLIC_FACT_WORKSPACE_MARKERS))
  })
})
