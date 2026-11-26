import { describe, expect, it } from 'vitest'
import jsonSchema from '../../../shared/schemas/market-brief.schema.json' with { type: 'json' }
import { marketBriefSchema } from './market-brief.js'

// ── Parité zod ↔ JSON Schema (packages/shared/schemas/market-brief.schema.json)
// Même principe que commercial-brief.test.ts : le JSON est écrit à la main et ce
// test rend toute divergence impossible — clés, clés requises et énumérations,
// à TOUTE profondeur (le `$ref` des cellules de prix est résolu).

// Les internes de zod 4 : `schema._zod.def`, dont `type` nomme le genre de nœud.
type ZodDef = {
  type?: string
  innerType?: unknown
  in?: unknown
  element?: unknown
  entries?: Record<string, unknown>
  shape?: Record<string, unknown>
}
type JsonNode = {
  properties?: Record<string, JsonNode>
  required?: string[]
  items?: JsonNode
  enum?: unknown[]
  additionalProperties?: boolean | JsonNode
  $ref?: string
}

const defOf = (s: unknown): ZodDef => ((s as { _zod?: { def?: ZodDef } })._zod?.def ?? {}) as ZodDef

const unwrap = (s: unknown): { node: unknown; optional: boolean } => {
  let node = s
  let optional = false
  for (let i = 0; i < 10; i += 1) {
    const def = defOf(node)
    if (def.type === 'optional' || def.type === 'default') {
      optional = true
      node = def.innerType
    } else if (def.type === 'pipe') node = def.in
    else break
  }
  return { node, optional }
}

const resolve = (json: JsonNode): JsonNode => {
  const name = json.$ref?.replace('#/definitions/', '')
  const target = name ? (jsonSchema.definitions as Record<string, JsonNode>)[name] : undefined
  return target ?? json
}

const compare = (zod: unknown, rawJson: JsonNode, path: string, errors: string[]): void => {
  const json = resolve(rawJson)
  const def = defOf(unwrap(zod).node)
  if (def.type === 'object') {
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
  } else if (def.type === 'array') {
    if (!json.items) errors.push(`${path}: items absent côté JSON`)
    else compare(def.element, json.items, `${path}[]`, errors)
  } else if (def.type === 'enum') {
    const values = Object.values(def.entries ?? {})
      .map(String)
      .sort()
      .join()
    if (values !== [...(json.enum ?? [])].sort().join()) errors.push(`${path}: enum zod [${values}] ≠ JSON`)
  }
}

describe('market-brief.schema.json — parité avec le zod', () => {
  it('déclare exactement les mêmes clés, requis et énumérations', () => {
    const errors: string[] = []
    compare(marketBriefSchema, jsonSchema as JsonNode, '$', errors)
    expect(errors).toEqual([])
  })

  it('la parité sait dire NON (une clé retirée du JSON est vue, une source ajoutée aussi)', () => {
    const tampered = structuredClone(jsonSchema) as JsonNode
    delete tampered.properties?.zone?.properties?.cantons
    tampered.properties?.price_grid?.properties?.source_kind?.enum?.push('invented')
    const errors: string[] = []
    compare(marketBriefSchema, tampered, '$', errors)
    expect(errors.some(e => e.startsWith('$.zone'))).toBe(true)
    expect(errors.some(e => e.startsWith('$.price_grid.source_kind'))).toBe(true)
  })
})
