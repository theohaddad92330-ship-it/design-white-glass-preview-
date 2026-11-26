import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { visibleMemoryItems } from './visible-memory-items'

/**
 * #3775 — DERNIER CRITÈRE (tronqué à « Le compteur » dans l'issue, reconstruit
 * au lot P04 09/10) : « Le compteur correspond exactement aux éléments
 * enregistrés du panneau qu'il ouvre ». La barre et le panneau recalculaient
 * chacun leur liste avec une COPIE du même filtre : le même nombre ne tenait
 * que tant que personne ne touchait l'une des deux. Une seule sélection, lue
 * par les deux ; la garde relit leur source.
 */
const SOURCES = ['src/features/chat/view/MemoryBar.tsx', 'src/features/memory/view/MemoireCard.tsx'] as const

describe('visibleMemoryItems — une seule sélection pour le compteur et le panneau (#3775)', () => {
  it('écarte un élément échu, garde les autres et ceux sans échéance', () => {
    const items = [
      { id: 'a', expiresAt: null },
      { id: 'b', expiresAt: '2999-01-01T00:00:00.000Z' },
      { id: 'c', expiresAt: '2020-01-01T00:00:00.000Z' },
    ]
    expect(visibleMemoryItems(items).map(item => item.id)).toEqual(['a', 'b'])
    expect(visibleMemoryItems(undefined)).toEqual([])
  })

  it.each(SOURCES)('%s lit la sélection partagée, sans filtre recopié', source => {
    const code = readFileSync(join(process.cwd(), source), 'utf8')
    expect(code).toContain('visibleMemoryItems(')
    expect(code).not.toMatch(/\.filter\([^)]*isMemoryItemExpired/)
  })

  it('sait dire NON : un filtre recopié dans un composant est attrapé', () => {
    const copied = 'const visible = (facts ?? []).filter(fact => !isMemoryItemExpired(fact.expiresAt))'
    expect(copied).toMatch(/\.filter\([^)]*isMemoryItemExpired/)
  })
})
