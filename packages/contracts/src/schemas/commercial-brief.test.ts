import { describe, expect, it } from 'vitest'
import jsonSchema from '../../../shared/schemas/commercial-brief.schema.json' with { type: 'json' }
import bpce from '../commercial-brief/bpce.fixture.json' with { type: 'json' }
import { commercialBriefSchema, PRICE_CHANNELS } from './commercial-brief.js'

const clone = (): Record<string, unknown> => structuredClone(bpce) as Record<string, unknown>

describe('commercialBriefSchema — le contrat du brief commercial', () => {
  it('accepte le brief BPCE minimal', () => {
    expect(commercialBriefSchema.safeParse(bpce).success).toBe(true)
  })

  it('refuse un prix sans canal (aucun prix ne voyage sans sa source)', () => {
    const brief = clone()
    brief.prices = [{ label: 'Dev', amount_eur_per_day: 600 }]
    expect(commercialBriefSchema.safeParse(brief).success).toBe(false)
  })

  it('refuse un canal « mixte » : il n’existe pas', () => {
    const brief = clone()
    brief.prices = [{ label: 'Dev', amount_eur_per_day: 600, channel: 'mixed' }]
    expect(commercialBriefSchema.safeParse(brief).success).toBe(false)
    expect(PRICE_CHANNELS).not.toContain('mixed')
  })

  it('refuse plus de six KPI', () => {
    const brief = clone()
    brief.kpis = Array.from({ length: 7 }, (_, i) => ({ label: `K${i}`, value: i }))
    expect(commercialBriefSchema.safeParse(brief).success).toBe(false)
  })

  it('refuse un brief sans garde-fou', () => {
    const brief = clone()
    brief.guardrails = []
    expect(commercialBriefSchema.safeParse(brief).success).toBe(false)
  })

  it('refuse un siège sans ville', () => {
    const brief = clone()
    brief.headquarters = { label: 'Tours Duo', city: '   ' }
    expect(commercialBriefSchema.safeParse(brief).success).toBe(false)
  })

  it('refuse un périmètre autre que la France', () => {
    const brief = clone()
    brief.scope = 'world'
    expect(commercialBriefSchema.safeParse(brief).success).toBe(false)
  })

  // Démo clients 04/10/2026 (décision Louis D4) : ABB Suisse porte le périmètre « suisse » ; la France reste inchangée.
  it('accepte le périmètre « suisse » (ABB Suisse) et le périmètre « france »', () => {
    const brief = clone()
    brief.scope = 'suisse'
    expect(commercialBriefSchema.safeParse(brief).success).toBe(true)
    brief.scope = 'france'
    expect(commercialBriefSchema.safeParse(brief).success).toBe(true)
  })

  it('refuse tout autre périmètre (allemagne, vide)', () => {
    const brief = clone()
    for (const scope of ['allemagne', '', 'Suisse']) {
      brief.scope = scope
      expect(commercialBriefSchema.safeParse(brief).success).toBe(false)
    }
  })

  it('refuse un pays de site qui n’est pas un code ISO-2', () => {
    const brief = clone()
    brief.sites = [{ name: 'X', city: 'Lyon', country: 'France', kind: 'secondary' }]
    expect(commercialBriefSchema.safeParse(brief).success).toBe(false)
  })

  it('refuse une clé inconnue (contrat fermé)', () => {
    const brief = clone()
    brief.relationship_status = 'tentative'
    expect(commercialBriefSchema.safeParse(brief).success).toBe(false)
  })
})

// ── Parité zod ↔ JSON Schema (packages/shared/schemas/commercial-brief.schema.json)
// Même principe que shared-schema-parity.test.ts (#273) : le JSON est écrit à la
// main (descriptions FR), et ce test rend toute divergence impossible — clés,
// clés requises et énumérations, à TOUTE profondeur.

// Les internes de zod 4 : `schema._zod.def`, dont `type` nomme le genre de nœud.
type ZodDef = {
  type?: string
  innerType?: unknown
  in?: unknown
  element?: unknown
  entries?: Record<string, unknown>
  values?: unknown[]
  shape?: Record<string, unknown>
}
type JsonNode = {
  type?: string | string[]
  properties?: Record<string, JsonNode>
  required?: string[]
  items?: JsonNode
  enum?: unknown[]
  const?: unknown
  additionalProperties?: boolean | JsonNode
  anyOf?: JsonNode[]
}

const defOf = (s: unknown): ZodDef => ((s as { _zod?: { def?: ZodDef } })._zod?.def ?? {}) as ZodDef

const unwrap = (s: unknown): { node: unknown; optional: boolean } => {
  let node = s
  let optional = false
  for (let i = 0; i < 10; i += 1) {
    const def = defOf(node)
    if (def.type === 'optional' || def.type === 'nullable' || def.type === 'default') {
      if (def.type !== 'nullable') optional = true
      node = def.innerType
    } else if (def.type === 'pipe') {
      node = def.in
    } else break
  }
  return { node, optional }
}

const compare = (zod: unknown, json: JsonNode, path: string, errors: string[]): void => {
  const { node } = unwrap(zod)
  const def = defOf(node)
  switch (def.type) {
    case 'object': {
      const shape = def.shape ?? {}
      const zodKeys = Object.keys(shape).sort()
      const jsonKeys = Object.keys(json.properties ?? {}).sort()
      if (zodKeys.join() !== jsonKeys.join()) errors.push(`${path}: clés zod [${zodKeys}] ≠ JSON [${jsonKeys}]`)
      const zodRequired = zodKeys.filter(k => !unwrap(shape[k]).optional).sort()
      const jsonRequired = [...(json.required ?? [])].sort()
      if (zodRequired.join() !== jsonRequired.join())
        errors.push(`${path}: requis zod [${zodRequired}] ≠ JSON [${jsonRequired}]`)
      if (json.additionalProperties !== false) errors.push(`${path}: additionalProperties doit valoir false`)
      for (const k of zodKeys) {
        const child = json.properties?.[k]
        if (child) compare(shape[k], child, `${path}.${k}`, errors)
      }
      return
    }
    case 'array':
      if (!json.items) errors.push(`${path}: items absent côté JSON`)
      else compare(def.element, json.items, `${path}[]`, errors)
      return
    case 'enum': {
      const values = Object.values(def.entries ?? {})
        .map(String)
        .sort()
        .join()
      if (values !== [...(json.enum ?? [])].sort().join()) errors.push(`${path}: enum zod [${values}] ≠ JSON`)
      return
    }
    case 'literal':
      if (json.const !== def.values?.[0]) errors.push(`${path}: const zod ${String(def.values?.[0])} ≠ JSON`)
      return
    default:
      return
  }
}

describe('commercial-brief.schema.json — parité avec le zod', () => {
  it('déclare exactement les mêmes clés, requis et énumérations', () => {
    const errors: string[] = []
    compare(commercialBriefSchema, jsonSchema as JsonNode, '$', errors)
    expect(errors).toEqual([])
  })

  it('la parité sait dire NON (une clé retirée du JSON est vue)', () => {
    const tampered = structuredClone(jsonSchema) as JsonNode
    delete tampered.properties?.headquarters?.properties?.city
    const errors: string[] = []
    compare(commercialBriefSchema, tampered, '$', errors)
    expect(errors.some(e => e.startsWith('$.headquarters'))).toBe(true)
  })

  it('la parité voit un canal de prix ajouté d’un seul côté', () => {
    const tampered = structuredClone(jsonSchema) as JsonNode
    tampered.properties?.prices?.items?.properties?.channel?.enum?.push('mixed')
    const errors: string[] = []
    compare(commercialBriefSchema, tampered, '$', errors)
    expect(errors.some(e => e.startsWith('$.prices[].channel'))).toBe(true)
  })
})
