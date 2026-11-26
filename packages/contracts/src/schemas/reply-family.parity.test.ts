import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { REPLY_BLOCK_TYPES } from './reply-blocks.js'
import { REPLY_FAMILY_CARDS, REPLY_FAMILY_KEYS } from './reply-family.js'

/**
 * #3758 — parité du routeur de rendu (TS ↔ Python). La garde LIT le fichier
 * Python : une extraction vide ferait passer la parité À VIDE, donc chaque
 * lecture est vérifiée non vide avant de servir.
 */
const python = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../../apps/ia/app/services/reply_family.py'),
  'utf8',
)

function pythonFamilies(): Array<{ key: string; cards: string[] }> {
  const start = python.indexOf('REPLY_FAMILIES: tuple[ReplyFamily, ...] = (')
  const end = python.indexOf('REPLY_FAMILY_KEYS', start)
  const body = python.slice(start, end)
  const out: Array<{ key: string; cards: string[] }> = []
  for (const match of body.matchAll(/ReplyFamily\(\s*"(\w+)",\s*\(([^)]*)\)/g)) {
    out.push({
      key: match[1] as string,
      cards: [...(match[2] as string).matchAll(/"(\w+)"/g)].map(m => m[1] as string),
    })
  }
  return out
}

describe('#3758 — les familles de réponse tiennent dans les deux langages', () => {
  const families = pythonFamilies()

  it('la garde lit quelque chose', () => {
    expect(families.length).toBeGreaterThan(0)
  })

  it('mêmes familles, dans le même ordre', () => {
    expect(families.map(f => f.key)).toEqual([...REPLY_FAMILY_KEYS])
  })

  it('même table famille → cartes', () => {
    for (const family of families) {
      expect(family.cards, family.key).toEqual([...REPLY_FAMILY_CARDS[family.key as keyof typeof REPLY_FAMILY_CARDS]])
    }
  })

  it('chaque carte d’une famille est un type de carte réel', () => {
    for (const cards of Object.values(REPLY_FAMILY_CARDS)) {
      for (const card of cards) expect(REPLY_BLOCK_TYPES).toContain(card)
    }
  })
})
