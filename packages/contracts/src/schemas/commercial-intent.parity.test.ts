import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  COMMERCIAL_ACTION_LEVELS,
  COMMERCIAL_AMBIGUITY_LEVELS,
  COMMERCIAL_DECISIONS,
  COMMERCIAL_EVIDENCE_REQUIREMENTS,
  COMMERCIAL_INTENT_FIELDS,
  COMMERCIAL_KNOWLEDGE_SCOPES,
  COMMERCIAL_RISK_LEVELS,
} from './commercial-intent.js'

/**
 * #3175.2 — parité TS ↔ Python de l'objet `CommercialIntent`. Chaque extraction
 * est vérifiée non vide : une regex périmée rendrait la parité verte À VIDE.
 */
const here = dirname(fileURLToPath(import.meta.url))
const PY = join(here, '..', '..', '..', '..', 'apps', 'ia', 'app', 'services', 'compilers', 'commercial_intent.py')

function pythonTuple(source: string, name: string): string[] {
  const block = new RegExp(`^${name}(?:\\s*:[^=]+)?\\s*=\\s*\\(([^)]*)\\)`, 'm').exec(source)
  expect(block, `tuple Python introuvable : ${name}`).not.toBeNull()
  return [...block![1]!.matchAll(/"([^"]*)"/g)].map(match => match[1]!)
}

describe('parité de CommercialIntent TS ↔ Python (#3175.2)', () => {
  expect(existsSync(PY), `module Python absent : ${PY}`).toBe(true)
  const source = readFileSync(PY, 'utf8')

  it('lit vraiment le module Python', () => {
    expect(source.length).toBeGreaterThan(2000)
    expect(source).toContain('def build_commercial_intent')
  })

  it.each([
    ['COMMERCIAL_INTENT_FIELDS', COMMERCIAL_INTENT_FIELDS],
    ['COMMERCIAL_DECISIONS', COMMERCIAL_DECISIONS],
    ['COMMERCIAL_ACTION_LEVELS', COMMERCIAL_ACTION_LEVELS],
    ['COMMERCIAL_EVIDENCE_REQUIREMENTS', COMMERCIAL_EVIDENCE_REQUIREMENTS],
    ['COMMERCIAL_AMBIGUITY_LEVELS', COMMERCIAL_AMBIGUITY_LEVELS],
    ['COMMERCIAL_RISK_LEVELS', COMMERCIAL_RISK_LEVELS],
    ['COMMERCIAL_KNOWLEDGE_SCOPES', COMMERCIAL_KNOWLEDGE_SCOPES],
  ])('%s est identique des deux côtés, dans le même ordre', (name, expected) => {
    const fromPython = pythonTuple(source, name)
    expect(fromPython.length).toBeGreaterThan(0)
    expect(fromPython).toEqual([...expected])
  })

  it('le treizième champ du ticket est présent, treize en tout', () => {
    expect(COMMERCIAL_INTENT_FIELDS).toHaveLength(13)
  })
})
