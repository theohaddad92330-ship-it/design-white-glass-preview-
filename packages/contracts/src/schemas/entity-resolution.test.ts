import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_ENTITY_KIND_TO_ENTITY_KIND,
  ENTITY_KINDS,
  ENTITY_RESOLUTION_SOURCES,
  ENTITY_RESOLUTION_STATES,
  entityResolutionSchema,
  isEntityResolutionAnchored,
  ORG_ENTITY_TYPE_TO_ENTITY_KIND,
  readEntityResolution,
} from './entity-resolution.js'
import { ACCOUNT_ENTITY_KINDS } from './account-entity.js'
import { orgEntityTypeSchema } from './org-graph.js'

/**
 * #2284 — Entity Resolver P0 (tranche 1).
 *
 * Trois choses gardées :
 *  1. la TAXONOMIE (16 types, 7 états, 12 sources) — le vocabulaire de l'issue ;
 *  2. l'UNIFICATION (GA-26) — chaque vocabulaire d'entité déjà en place
 *     (org-graph, account-entity, `entity_type.py`) se projette sur la
 *     taxonomie, aucun ne reste une vérité parallèle ;
 *  3. la PARITÉ avec le modèle pydantic `apps/ia/app/services/entity_resolution.py`,
 *     qui écrit `raw_analysis.entity_resolution`.
 */

const _here = dirname(fileURLToPath(import.meta.url))

function monorepoFile(relative: string): string {
  let current = _here
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(current, relative)
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  throw new Error(`Fichier introuvable en remontant depuis ${_here} : ${relative}`)
}

const RESOLVER_PY = readFileSync(monorepoFile('apps/ia/app/services/entity_resolution.py'), 'utf8')

/** Le tuple Python `NOM: tuple[str, ...] = ("a", "b")`, sur UNE ligne, hors commentaire. */
function pythonTuple(source: string, name: string): string[] {
  const line = source
    .split('\n')
    .filter(l => !l.trimStart().startsWith('#'))
    .find(l => l.startsWith(`${name}:`) || l.startsWith(`${name} =`))
  if (!line) throw new Error(`Tuple Python introuvable : ${name}`)
  return [...line.matchAll(/"([^"]+)"/g)].map(m => m[1] as string)
}

/** Le dict Python `NOM: dict[str, str | None] = {"a": "b", "c": None}` sur une ligne. */
function pythonDict(source: string, name: string): Record<string, string | null> {
  const line = source
    .split('\n')
    .filter(l => !l.trimStart().startsWith('#'))
    .find(l => l.startsWith(`${name}:`) || l.startsWith(`${name} =`))
  if (!line) throw new Error(`Dict Python introuvable : ${name}`)
  const out: Record<string, string | null> = {}
  for (const m of line.matchAll(/"([^"]+)":\s*(?:"([^"]+)"|None)/g)) out[m[1] as string] = m[2] ?? null
  return out
}

const RESOLVED = {
  state: 'resolved',
  kind: 'parent_company',
  canonical_id: 'FR-SIREN-552081317',
  commercial_name: 'EDF',
  legal_name: 'ELECTRICITE DE FRANCE',
  country: 'FR',
  identifiers: { siren: '552081317' },
  domain: 'edf.fr',
  naf_code: '35.11Z',
  naf_label: "Production d'électricité",
  location: 'Paris',
  parent_names: [],
  children_count: 12,
  sources: ['normalized_name', 'legal_identifier', 'registry_country', 'public_company_profile'],
  confidence: 100,
  reasons: [],
  question: null,
  resolved_at: '2026-09-24T10:00:00Z',
}

describe('corpus lu', () => {
  it('lit le module Python du résolveur', () => {
    expect(RESOLVER_PY).toContain('ENTITY_KINDS')
    expect(pythonTuple(RESOLVER_PY, 'ENTITY_KINDS').length).toBeGreaterThan(0)
  })
})

describe('taxonomie (#2284.2-17, .29-35, .18-27, #2265.2/.11)', () => {
  it('16 types, 7 états, 12 sources, sans doublon', () => {
    expect(ENTITY_KINDS).toHaveLength(16)
    expect(new Set(ENTITY_KINDS).size).toBe(16)
    expect(ENTITY_RESOLUTION_STATES).toHaveLength(7)
    expect(ENTITY_RESOLUTION_SOURCES).toHaveLength(12)
    expect(new Set(ENTITY_RESOLUTION_SOURCES).size).toBe(12)
  })

  it('distingue maison mère et groupe, holding et véhicule juridique', () => {
    expect(ENTITY_KINDS).toContain('group')
    expect(ENTITY_KINDS).toContain('parent_company')
    expect(ENTITY_KINDS).toContain('holding')
    expect(ENTITY_KINDS).toContain('legal_vehicle')
  })
})

describe('parité TS ↔ Python', () => {
  it.each([
    ['ENTITY_KINDS', ENTITY_KINDS],
    ['ENTITY_RESOLUTION_STATES', ENTITY_RESOLUTION_STATES],
    ['ENTITY_RESOLUTION_SOURCES', ENTITY_RESOLUTION_SOURCES],
  ] as const)('%s identique des deux côtés', (name, values) => {
    expect(pythonTuple(RESOLVER_PY, name)).toEqual([...values])
  })

  it('les types de `entity_type.py` se projettent sur la taxonomie (ou sur rien, dit)', () => {
    const table = pythonDict(RESOLVER_PY, 'LEGAL_GRAPH_TYPE_TO_KIND')
    expect(Object.keys(table).length).toBeGreaterThanOrEqual(8)
    for (const kind of Object.values(table)) {
      if (kind !== null) expect(ENTITY_KINDS).toContain(kind)
    }
  })
})

describe('unification des vocabulaires (GA-26)', () => {
  it('chaque type d’org-graph a sa place dans la taxonomie', () => {
    for (const t of orgEntityTypeSchema.options) {
      expect(ENTITY_KINDS).toContain(ORG_ENTITY_TYPE_TO_ENTITY_KIND[t])
    }
  })

  it('chaque kind d’account-entity se projette — `unknown` ne devient rien', () => {
    for (const k of ACCOUNT_ENTITY_KINDS) {
      const kind = ACCOUNT_ENTITY_KIND_TO_ENTITY_KIND[k]
      if (k === 'unknown') expect(kind).toBeNull()
      else expect(ENTITY_KINDS).toContain(kind)
    }
  })
})

describe('invariants du contrat', () => {
  it('accepte un verdict résolu complet', () => {
    expect(entityResolutionSchema.safeParse(RESOLVED).success).toBe(true)
  })

  it('#2284.28 — le nom seul ne résout jamais une entité', () => {
    const parsed = entityResolutionSchema.safeParse({ ...RESOLVED, sources: ['normalized_name'] })
    expect(parsed.success).toBe(false)
  })

  it('#2284.65 — ambigu sans question nommée (≥ 2 candidats) est refusé', () => {
    const noQuestion = { ...RESOLVED, state: 'ambiguous', kind: null, canonical_id: null, confidence: null }
    expect(entityResolutionSchema.safeParse(noQuestion).success).toBe(false)
    const withQuestion = {
      ...noQuestion,
      question: {
        candidates: [
          { name: 'THALES', siren: '552059024' },
          { name: 'THALES', siren: '000000001' },
        ],
      },
    }
    expect(entityResolutionSchema.safeParse(withQuestion).success).toBe(true)
  })

  it('« non mesuré » ≠ 0 : une confiance absente est null, jamais 0', () => {
    expect(entityResolutionSchema.safeParse({ ...RESOLVED, confidence: 0 }).success).toBe(false)
    expect(entityResolutionSchema.safeParse({ ...RESOLVED, confidence: null }).success).toBe(true)
  })

  it('un identifiant canonique n’existe que sur une entité ancrée', () => {
    const unresolved = { ...RESOLVED, state: 'unresolved', kind: null, sources: ['normalized_name'] }
    expect(entityResolutionSchema.safeParse(unresolved).success).toBe(false)
    expect(entityResolutionSchema.safeParse({ ...unresolved, canonical_id: null }).success).toBe(true)
  })
})

describe('readEntityResolution', () => {
  it('rend le verdict lisible, null sur un dossier antérieur ou illisible', () => {
    expect(readEntityResolution({ entity_resolution: RESOLVED })?.state).toBe('resolved')
    expect(readEntityResolution({})).toBeNull()
    expect(readEntityResolution(null)).toBeNull()
    expect(readEntityResolution({ entity_resolution: { state: 'nope' } })).toBeNull()
  })
})

describe('isEntityResolutionAnchored (#2307.2, épopée #2789)', () => {
  it('ancre resolved/manual_override/inactive', () => {
    expect(isEntityResolutionAnchored('resolved')).toBe(true)
    expect(isEntityResolutionAnchored('manual_override')).toBe(true)
    expect(isEntityResolutionAnchored('inactive')).toBe(true)
  })

  it('ne ancre pas ambiguous/unresolved/historical/out_of_scope', () => {
    expect(isEntityResolutionAnchored('ambiguous')).toBe(false)
    expect(isEntityResolutionAnchored('unresolved')).toBe(false)
    expect(isEntityResolutionAnchored('historical')).toBe(false)
    expect(isEntityResolutionAnchored('out_of_scope')).toBe(false)
  })
})
