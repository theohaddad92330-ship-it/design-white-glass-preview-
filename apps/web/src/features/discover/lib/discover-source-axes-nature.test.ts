import { supplierNamesIn } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { resources } from '@/i18n/resources'

/**
 * #4068 / #4067 (décision Louis 12/10) — la ligne « Pourquoi » de Découvrir dit la NATURE du
 * fait (« Observé sur le marché », « Affaires »), jamais le système qui le porte
 * (« Mémoire marché », DataForge, un fournisseur).
 */
const SYSTEM_NAMES = /m[ée]moire march[ée]|market memory|dataforge|r[ée]f[ée]rentiel|reference/i

function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (node && typeof node === 'object') return Object.values(node).flatMap(leaves)
  return []
}

describe('discover.sourceAxes — la nature du fait, jamais le nom du système', () => {
  for (const lang of ['fr', 'en'] as const) {
    it(`${lang} — aucun libellé ne nomme un système ou un fournisseur`, () => {
      const root = (resources as unknown as Record<string, Record<string, Record<string, unknown>>>)[lang]?.discover
      const texts = leaves(root?.sourceAxes)
      expect(texts.length).toBeGreaterThan(10)
      for (const text of texts) {
        expect(text, text).not.toMatch(SYSTEM_NAMES)
        expect(supplierNamesIn(text), text).toEqual([])
      }
    })
  }
})
