import type { UniversalImportVerifiedRow } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { confirmedCounts, isImportable, pageBounds } from './verification'

const row = (line: number, verdict: UniversalImportVerifiedRow['verdict']): UniversalImportVerifiedRow => ({
  line,
  verdict,
  label: `P${line}`,
  reason: null,
  existingId: null,
})

describe('verification — Théo B c4.R3/R5', () => {
  it('seules les créations et complétions s’importent ; le reste est écarté d’office, nommé', () => {
    expect(isImportable(row(2, 'create'))).toBe(true)
    expect(isImportable(row(3, 'complete'))).toBe(true)
    for (const verdict of ['duplicate', 'invalid', 'to_reconcile'] as const)
      expect(isImportable(row(4, verdict))).toBe(false)
  })

  it('la confirmation compte ce qui part VRAIMENT : une ligne décochée n’est comptée nulle part', () => {
    const rows = [row(2, 'create'), row(3, 'create'), row(4, 'complete'), row(5, 'invalid')]
    expect(confirmedCounts(rows, new Set([3]), { toCreate: 2, toComplete: 1 })).toEqual({ create: 1, complete: 1 })
  })

  it('au-delà du détail borné, les compteurs du fichier entier restent la vérité', () => {
    // 2 lignes détaillées sur 500 créations : on n'en retire que ce qui est écarté DANS le détail.
    const rows = [row(2, 'create'), row(3, 'create')]
    expect(confirmedCounts(rows, new Set([2]), { toCreate: 500, toComplete: 0 })).toEqual({ create: 499, complete: 0 })
  })

  it('la pagination dit « de a à b sur n » sans déborder', () => {
    expect(pageBounds(0, 25, 60)).toEqual({ from: 1, to: 25, pages: 3 })
    expect(pageBounds(2, 25, 60)).toEqual({ from: 51, to: 60, pages: 3 })
    expect(pageBounds(0, 25, 0)).toEqual({ from: 0, to: 0, pages: 1 })
  })
})
