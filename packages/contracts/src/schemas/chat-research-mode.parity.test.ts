import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { CHAT_MODE_POLICY_FACTS, CHAT_RESEARCH_MODES } from './chat-research-mode.js'

/**
 * #2450.2 — parité TS ↔ Python de la politique par mode. La garde LIT
 * `chat_model_routing.py` et refuse une extraction vide.
 */
const here = dirname(fileURLToPath(import.meta.url))
const PY = join(here, '..', '..', '..', '..', 'apps', 'ia', 'app', 'services', 'chat_model_routing.py')

describe('parité de la politique par mode TS ↔ Python (#2450.2)', () => {
  expect(existsSync(PY), `module Python absent : ${PY}`).toBe(true)
  const source = readFileSync(PY, 'utf8')
  const rows = [
    ...source.matchAll(
      /^ {4}"(\w+)": ChatModePolicy\(tier="(\w+)", excludes_web_search=(True|False), proposes_upgrade=(True|False)\),$/gm,
    ),
  ]

  it('lit vraiment trois politiques (auto n’en a pas : rien n’est forcé)', () => {
    expect(rows.map(row => row[1])).toEqual(['rapide', 'verifie', 'approfondi'])
  })

  it.each(['rapide', 'verifie', 'approfondi'] as const)('%s : mêmes faits des deux côtés', mode => {
    const row = rows.find(r => r[1] === mode)!
    const facts = CHAT_MODE_POLICY_FACTS[mode]
    expect(facts.tier).toBe(row[2])
    expect(facts.publicSearch).toBe(row[3] === 'True' ? 'excluded' : 'allowed')
    expect(facts.proposesUpgrade).toBe(row[4] === 'True')
  })

  it('auto ne force rien ; chaque mode a une politique', () => {
    expect(CHAT_MODE_POLICY_FACTS.auto).toEqual({ tier: 'auto', publicSearch: 'auto', proposesUpgrade: false })
    expect(Object.keys(CHAT_MODE_POLICY_FACTS)).toEqual([...CHAT_RESEARCH_MODES])
  })
})
