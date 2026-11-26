import { describe, expect, it } from 'vitest'
import enExpenses from '@/i18n/locales/en/expenses.json'
import frExpenses from '@/i18n/locales/fr/expenses.json'

/**
 * LA PARITÉ FR/EN du namespace `expenses`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE ALORS QUE `i18n/parity.test.ts` EXISTE DÉJÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * `parity.test.ts` itère `NAMESPACES` (`i18n/config.ts`). Ce lot n'a pas pu
 * toucher `config.ts` — il est partagé entre plusieurs lots en parallèle — donc
 * le namespace `expenses` s'enregistre à l'exécution depuis la fonctionnalité
 * (`../i18n.ts`), et la garde générale NE LE VOIT PAS.
 *
 * Une garde qui ne voit pas ce qu'elle est censée protéger est une garde
 * borgne. Celle-ci refait donc la même vérification sur les deux fichiers, en
 * les nommant. Le jour où l'intégrateur branche le namespace dans `config.ts`,
 * `parity.test.ts` le couvre et ce fichier devient redondant — le garder ne
 * coûte rien.
 */

type Tree = Record<string, unknown>

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') {
      for (const [innerKey, innerValue] of flatten(value as Tree, path)) flat.set(innerKey, innerValue)
    } else {
      flat.set(path, String(value))
    }
  }
  return flat
}

/** `{{count}}`, `{{date}}`… — ce qui doit survivre à la traduction. */
function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1] as string).sort()
}

describe('le namespace `expenses` est complet des deux côtés', () => {
  const fr = flatten(frExpenses as Tree)
  const en = flatten(enExpenses as Tree)

  it('LIT quelque chose — un catalogue vide passerait tous les tests suivants', () => {
    // La leçon des six gardes borgnes : une garde doit prouver que son corpus
    // n'est pas vide avant de prouver quoi que ce soit d'autre.
    expect(fr.size).toBeGreaterThan(80)
    expect(fr.has('page.title')).toBe(true)
    expect(fr.has('policy.unknown')).toBe(true)
  })

  it('porte exactement les mêmes clés en FR et en EN', () => {
    expect([...en.keys()].sort()).toEqual([...fr.keys()].sort())
  })

  it('n’a aucune valeur vide — une clé traduite par du vide est pire qu’absente', () => {
    for (const [key, value] of fr) expect(value.trim(), `fr:${key}`).not.toBe('')
    for (const [key, value] of en) expect(value.trim(), `en:${key}`).not.toBe('')
  })

  it('garde les mêmes interpolations des deux côtés', () => {
    // Un `{{count}}` perdu en traduction rend « ligne n'a pas pu être
    // comparée » sans le nombre — la phrase reste grammaticale, et fausse.
    for (const [key, value] of fr) {
      expect(placeholdersOf(en.get(key) as string), key).toEqual(placeholdersOf(value))
    }
  })

  it('la garde sait dire NON — une clé inventée n’est nulle part', () => {
    expect(fr.has('page.cette-cle-nexiste-pas')).toBe(false)
  })
})
