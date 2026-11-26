import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARCHITECTURE_DOCTRINE_AUDIT, ARCHITECTURE_DOCTRINE_POINTS } from '@bellum/contracts'

/**
 * GA-397 — #2924 (#2143) : L'AUDIT DE DOCTRINE D'ARCHITECTURE NE MENT PAS.
 *
 * `architecture-doctrine-audit.ts` (#2924) répond, point par point, à sept
 * exigences de l'épopée qui ne sont ni un registre par route ni un arbitrage
 * déjà tranché — l'orientation par défaut, le rôle de Laura vs Analyser, ce
 * qu'une page dérivée ne recrée pas. Même contrat que GA-393/GA-395 : une
 * preuve `present` DOIT pointer un fichier qui EXISTE dans ce dépôt.
 *
 * Elle ne vérifie PAS que chaque point est TENU — trois sont `absent` de
 * façon mesurée (pas de parcours forcé prouvé, pas de surface « Journaux
 * techniques », pas de contexte complet porté par Laura) et un est
 * `unverified` (compréhension utilisateur, hors de portée du code) : les
 * NOMMER honnêtement est le livrable, pas les forcer à `present`.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

describe('GA-397 — audit de doctrine d’architecture (#2924)', () => {
  it('la garde LIT quelque chose : les neuf points sont tous audités', () => {
    expect(ARCHITECTURE_DOCTRINE_POINTS.length).toBe(9)
    expect(Object.keys(ARCHITECTURE_DOCTRINE_AUDIT)).toHaveLength(9)
  })

  it('un `present` pointe un fichier qui EXISTE dans le dépôt', () => {
    const dangling: string[] = []
    for (const point of ARCHITECTURE_DOCTRINE_POINTS) {
      const entry = ARCHITECTURE_DOCTRINE_AUDIT[point]
      if (entry.status !== 'present' || !entry.evidence) continue
      const path = entry.evidence.split(':')[0]
      if (!existsSync(join(REPO_ROOT, path))) dangling.push(`${point} → ${path}`)
    }
    expect(dangling).toEqual([])
  })

  it('un point non tenu est NOMMÉ (`absent` ou `unverified`), jamais forcé à `present`', () => {
    for (const point of ARCHITECTURE_DOCTRINE_POINTS) {
      expect(['present', 'absent', 'unverified']).toContain(ARCHITECTURE_DOCTRINE_AUDIT[point].status)
    }
    // Témoin honnête : au moins un point reste `absent` — cette garde ne
    // deviendrait pas rouge si quelqu'un forçait tout à `present` en douce ;
    // seule GA-397 elle-même (relue par un humain) protège cette honnêteté.
    const absentCount = ARCHITECTURE_DOCTRINE_POINTS.filter(
      point => ARCHITECTURE_DOCTRINE_AUDIT[point].status === 'absent',
    ).length
    expect(absentCount).toBeGreaterThan(0)
  })

  it('sait dire NON — sur une preuve qui pointe un fichier absent', () => {
    const brokenPath = 'apps/web/src/features/launcher/ce-fichier-nexiste-pas.tsx'
    expect(existsSync(join(REPO_ROOT, brokenPath))).toBe(false)
  })
})
