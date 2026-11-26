import { NAMESPACES } from '@/i18n/config'
import { resources } from '@/i18n/resources'

/**
 * FR/EN parity guard: every namespace must expose the exact same key tree in
 * both languages (0 missing key on either side), with matching {{placeholders}}
 * and no empty values. This is the automated version of the manual parity
 * sweep done for the initial i18n PR.
 */

type Tree = Record<string, unknown>

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out.set(path, value)
    } else if (value && typeof value === 'object') {
      for (const [subPath, subValue] of flatten(value as Tree, path)) {
        out.set(subPath, subValue)
      }
    }
  }
  return out
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]).sort()
}

describe('i18n FR/EN parity', () => {
  it.each([...NAMESPACES])('namespace "%s" has the same keys in fr and en', ns => {
    const fr = flatten(resources.fr[ns] as Tree)
    const en = flatten(resources.en[ns] as Tree)
    const missingInEn = [...fr.keys()].filter(k => !en.has(k))
    const missingInFr = [...en.keys()].filter(k => !fr.has(k))
    expect(missingInEn, `keys missing in en/${ns}.json`).toEqual([])
    expect(missingInFr, `keys missing in fr/${ns}.json`).toEqual([])
  })

  it.each([...NAMESPACES])('namespace "%s" has no empty translation', ns => {
    for (const lang of ['fr', 'en'] as const) {
      const flat = flatten(resources[lang][ns] as Tree)
      const empty = [...flat.entries()].filter(([, v]) => v.trim() === '').map(([k]) => k)
      expect(empty, `empty values in ${lang}/${ns}.json`).toEqual([])
    }
  })

  it.each([...NAMESPACES])('namespace "%s" keeps {{placeholders}} in sync between fr and en', ns => {
    const fr = flatten(resources.fr[ns] as Tree)
    const en = flatten(resources.en[ns] as Tree)
    const mismatches: string[] = []
    for (const [key, frValue] of fr) {
      const enValue = en.get(key)
      if (enValue === undefined) continue // covered by the key-parity test
      if (placeholders(frValue).join(',') !== placeholders(enValue).join(',')) {
        mismatches.push(`${key}: fr [${placeholders(frValue).join(', ')}] vs en [${placeholders(enValue).join(', ')}]`)
      }
    }
    expect(mismatches, `placeholder mismatches in ${ns}`).toEqual([])
  })
})
