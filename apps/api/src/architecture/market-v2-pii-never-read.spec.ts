import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { loadMarketV2Schema, piiColumnsOf } from '../scripts/market-v2/market-v2-import'

/**
 * Lot 783 (#5205) — aucun lecteur ne projette une colonne pii du pack marché v2.1 vers une réponse ou un prompt.
 *
 * Décisions de Louis (03/11/2026) : les identités sont importées BRUTES, mais RIEN d'identifiant ne sort vers l'écran
 * ni vers le modèle (décision 02/11 maintenue). L'importeur sépare PHYSIQUEMENT les cellules pii (dictionnaire
 * `pii=1` + `PII_FLAG_CORRECTIONS`) dans le coffre `market_v2_row_identities` ; `market_v2_rows.data` n'en porte
 * aucune. La garde tient les deux portes, sur tout le code serveur (API TypeScript ET service IA Python) :
 *
 *  1. le coffre n'est NOMMÉ que par sa migration et par le store d'import — un lecteur qui le nomme est refusé ;
 *  2. un fichier qui lit `market_v2_rows` n'extrait du `data` aucune clé qui n'est QUE pii dans le schéma
 *     (`data->>'email_norm'`, `data -> 'phone'`, `data ? 'email'`…) — même vide aujourd'hui, une telle lecture
 *     est l'intention de projeter une identité.
 *
 * Elle ne vise pas : un nom de colonne pii dans un autre contexte (une autre table), ni une clé qui est pii dans une
 * table et non dans une autre (`account_name`) — elle n'attrape pas ce qu'elle ne vise pas.
 */

const API_SRC = join(__dirname, '..')
const IA_APP = join(__dirname, '..', '..', '..', 'ia', 'app')
const VAULT = 'market_v2_row_identities'

/** Les seuls fichiers qui ont le droit de nommer le coffre. */
const VAULT_WRITERS = new Set(['migrations/1796900104000-MarketV2Rows.ts', 'scripts/market-v2/market-v2-store.ts'])

function sourceFiles(dir: string, ext: RegExp): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__pycache__' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full, ext))
    else if (ext.test(entry) && !/\.spec\.ts$|(^|\/)test_[^/]*\.py$|_test\.py$/.test(entry)) out.push(full)
  }
  return out
}

function stripComments(source: string, python: boolean): string {
  if (python) return source.replace(/^\s*#.*$/gm, '')
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Les noms qui ne sont QUE pii : pii dans chaque table du schéma où ils apparaissent. */
function piiOnlyKeys(): Set<string> {
  const pii = new Set<string>()
  const clear = new Set<string>()
  for (const table of loadMarketV2Schema().tables) {
    const tablePii = new Set(piiColumnsOf(table))
    for (const column of table.header) (tablePii.has(column) ? pii : clear).add(column)
  }
  return new Set([...pii].filter(column => !clear.has(column)))
}

const PII_ONLY = piiOnlyKeys()
const KEY_EXTRACTION = /(?:->>?|#>>?|\?)\s*'\{?([A-Za-z0-9_]+)/g

/** Les fautes d'un fichier : `[]` s'il est sain. */
function violations(file: string, source: string, python: boolean): string[] {
  const code = stripComments(source, python)
  const out: string[] = []
  if (code.includes(VAULT) && !VAULT_WRITERS.has(file)) out.push(`${file} — nomme le coffre ${VAULT}`)
  if (code.includes('market_v2_rows')) {
    for (const match of code.matchAll(KEY_EXTRACTION)) {
      const key = match[1] as string
      if (PII_ONLY.has(key)) out.push(`${file} — extrait la clé pii « ${key} » de market_v2_rows`)
    }
  }
  return out
}

function corpus(): { file: string; source: string; python: boolean }[] {
  return [
    ...sourceFiles(API_SRC, /\.ts$/).map(full => ({ file: relative(API_SRC, full), python: false, full })),
    ...sourceFiles(IA_APP, /\.py$/).map(full => ({ file: `ia/${relative(IA_APP, full)}`, python: true, full })),
  ].map(({ file, python, full }) => ({ file, python, source: readFileSync(full, 'utf8') }))
}

describe('lot 783 — aucune colonne pii du pack v2.1 ne sort vers une réponse ou un prompt', () => {
  const files = corpus()

  it('LIT quelque chose — le code API et IA, des clés pii, et le store qui nomme réellement le coffre', () => {
    expect(files.filter(f => !f.python).length).toBeGreaterThan(500)
    expect(files.filter(f => f.python).length).toBeGreaterThan(20)
    expect(PII_ONLY.size).toBeGreaterThan(100)
    expect(PII_ONLY.has('email_norm')).toBe(true)
    const store = files.find(f => f.file === 'scripts/market-v2/market-v2-store.ts')
    expect(stripComments(store?.source ?? '', false)).toContain(VAULT)
  })

  it('aucun lecteur ne nomme le coffre, aucun n’extrait une clé pii de market_v2_rows', () => {
    expect(files.flatMap(f => violations(f.file, f.source, f.python))).toEqual([])
  })

  it('sait dire NON — un service qui lit le coffre, une projection `data->>email_norm`, un module IA', () => {
    const service = `
      const rows = await this.dataSource.query('SELECT data FROM market_v2_row_identities WHERE source_table = $1', [t])
    `
    expect(violations('modules/x/x.service.ts', service, false)).toEqual([
      'modules/x/x.service.ts — nomme le coffre market_v2_row_identities',
    ])
    const projection = `
      return this.dataSource.query("SELECT data->>'account_id' AS a, data ->> 'email_norm' AS e FROM market_v2_rows")
    `
    expect(violations('modules/x/y.service.ts', projection, false)).toEqual([
      'modules/x/y.service.ts — extrait la clé pii « email_norm » de market_v2_rows',
    ])
    const python = `
rows = await conn.fetch("select data #>> '{phone_norm}' from market_v2_rows")
`
    expect(violations('ia/x.py', python, true)).toEqual([
      'ia/x.py — extrait la clé pii « phone_norm » de market_v2_rows',
    ])
  })

  it('n’attrape pas ce qu’elle ne vise pas — clé non pii, autre table, commentaire, écrivain autorisé', () => {
    expect(
      violations('a.ts', `query("SELECT data->>'account_name', data->>'domain_code' FROM market_v2_rows")`, false),
    ).toEqual([])
    expect(violations('b.ts', `query("SELECT payload->>'email_norm' FROM contacts")`, false)).toEqual([])
    expect(violations('c.ts', `/** le coffre ${VAULT} */\nconst x = 1`, false)).toEqual([])
    expect(violations('scripts/market-v2/market-v2-store.ts', `INSERT INTO ${VAULT}`, false)).toEqual([])
  })
})
