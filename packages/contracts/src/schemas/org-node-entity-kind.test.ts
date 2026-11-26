import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENTITY_KINDS, ORG_ENTITY_TYPE_TO_ENTITY_KIND, orgNodeRefinedKind } from './entity-resolution.js'
import { orgEntityTypeSchema, orgGraphSchema, type OrgEntityType } from './org-graph.js'

/* #2284.5-.9, .14, .15, .17 — la taxonomie posée sur les NŒUDS de
 * l'organigramme. Arbitrage GA-26 : le nœud porte déjà `type` (l'axe de
 * structure). `entityKind` n'est écrit QUE s'il dit autre chose que la
 * projection de `type` — une marque rangée en « filiale », une direction
 * métier rangée en « bu ». Répéter la projection est REFUSÉ par le contrat,
 * et l'écran n'affiche qu'UNE des deux informations, jamais les deux. */

const _here = dirname(fileURLToPath(import.meta.url))
function monorepoFile(relative: string): string {
  let current = _here
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(current, relative)
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  throw new Error(`Fichier introuvable en remontant depuis ${_here} : ${relative}`)
}

const ASSEMBLER_PY = readFileSync(monorepoFile('apps/ia/app/services/org_graph_assembler.py'), 'utf8')
const RESOLVER_PY = readFileSync(monorepoFile('apps/ia/app/services/entity_resolution.py'), 'utf8')

/** Un dict Python `{"a": "b", ...}` qui peut tenir sur plusieurs lignes. */
function pythonStrDict(source: string, name: string): Record<string, string> {
  const start = source.indexOf(`${name}: dict[str, str] = {`)
  if (start < 0) throw new Error(`Dict Python introuvable : ${name}`)
  const body = source.slice(start, source.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const line of body.split('\n')) {
    const code = line.split('#')[0] ?? ''
    for (const m of code.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) out[m[1] as string] = m[2] as string
  }
  return out
}

function graphWith(entity: Record<string, unknown>) {
  return orgGraphSchema.safeParse({
    graphVersion: 1,
    entities: [{ id: 'e-1', name: 'Boursorama', confidence: 80, ...entity }],
  })
}

describe('le contrat du nœud (#2284.6, GA-26)', () => {
  it('accepte un kind qui AFFINE le type : une marque rangée en filiale', () => {
    expect(graphWith({ type: 'filiale', entityKind: 'brand' }).success).toBe(true)
  })

  it('accepte un nœud sans kind — graphes stockés avant #2284', () => {
    expect(graphWith({ type: 'filiale' }).success).toBe(true)
  })

  it.each(orgEntityTypeSchema.options)('REFUSE un kind qui répète la projection du type « %s »', type => {
    const parsed = graphWith({ type, entityKind: ORG_ENTITY_TYPE_TO_ENTITY_KIND[type] })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map(i => i.message)).toContain('entity_kind_repeats_type')
  })

  it('un écarté porte ce qu’il est (#2284.14) — un homonyme n’est pas un spv', () => {
    const parsed = orgGraphSchema.safeParse({
      graphVersion: 1,
      rejectedItems: [{ sourceId: 'e-x', reason: 'homonyme', entityKind: 'homonym' }],
    })
    expect(parsed.success).toBe(true)
  })

  it('le miroir Python du type→kind est IDENTIQUE au contrat', () => {
    const line = RESOLVER_PY.split('\n').find(l => l.startsWith('ORG_ENTITY_TYPE_TO_KIND:'))
    expect(line, 'ORG_ENTITY_TYPE_TO_KIND introuvable').toBeDefined()
    const py: Record<string, string> = {}
    for (const m of (line ?? '').matchAll(/"([^"]+)":\s*"([^"]+)"/g)) py[m[1] as string] = m[2] as string
    expect(py).toEqual({ ...ORG_ENTITY_TYPE_TO_ENTITY_KIND })
  })

  it('refuse un kind hors taxonomie', () => {
    expect(graphWith({ type: 'filiale', entityKind: 'marque' }).success).toBe(false)
  })
})

describe('orgNodeRefinedKind — UNE seule information affichée', () => {
  it('rend le kind quand il affine le type', () => {
    expect(orgNodeRefinedKind({ type: 'filiale', entityKind: 'brand' })).toBe('brand')
  })

  it('rend null sans kind : l’écran garde le libellé du type', () => {
    expect(orgNodeRefinedKind({ type: 'bu' })).toBeNull()
  })

  it('rend null sur un kind redondant (blob antérieur) : jamais deux fois la même chose', () => {
    expect(orgNodeRefinedKind({ type: 'filiale', entityKind: 'subsidiary' })).toBeNull()
  })
})

describe('le producteur ia (org_graph_assembler.py) — parité', () => {
  const rawToContract = pythonStrDict(ASSEMBLER_PY, '_ENTITY_TYPE_TO_CONTRACT')
  const rawToKind = pythonStrDict(ASSEMBLER_PY, '_ENTITY_TYPE_TO_REFINED_KIND')

  it('lit bien les deux tables (corpus non vide)', () => {
    expect(Object.keys(rawToContract).length).toBeGreaterThanOrEqual(10)
    expect(Object.keys(rawToKind).length).toBeGreaterThanOrEqual(2)
  })

  it('chaque kind écrit par le producteur est dans la taxonomie ET dit autre chose que le type', () => {
    for (const [raw, kind] of Object.entries(rawToKind)) {
      expect(ENTITY_KINDS).toContain(kind)
      const contractType = rawToContract[raw] as OrgEntityType | undefined
      expect(contractType, `« ${raw} » doit avoir un type de contrat`).toBeDefined()
      expect(ORG_ENTITY_TYPE_TO_ENTITY_KIND[contractType as OrgEntityType]).not.toBe(kind)
    }
  })

  it('la marque et la direction métier ne se perdent plus dans « filiale » / « bu »', () => {
    expect(rawToKind['marque']).toBe('brand')
    expect(rawToKind['direction']).toBe('business_direction')
  })
})
