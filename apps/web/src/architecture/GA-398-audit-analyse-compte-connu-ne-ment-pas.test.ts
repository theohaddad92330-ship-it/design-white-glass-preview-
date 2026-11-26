import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KNOWN_ACCOUNT_ANALYSIS_AUDIT, KNOWN_ACCOUNT_ANALYSIS_POINTS } from '@bellum/contracts'

/**
 * GA-398 — #2929 (#2292) : L'AUDIT « ANALYSE COMPTE CONNU » NE MENT PAS.
 *
 * `known-account-analysis-audit.ts` répond aux neuf points de LAU-FINAL-033
 * qui restent sans appelant réel après trois lots de nuit (préflight de
 * cadrage, cinq modes neufs, comparateur multi-scope) : plutôt qu'un enum
 * étendu sans appelant (l'anti-motif du dépôt), l'audit NOMME le plus proche
 * voisin réel de chacun et pourquoi ce n'est pas encore le point lui-même.
 *
 * Même contrat que GA-393/GA-395/GA-397 : toute preuve citée — `present` ou
 * `absent` — DOIT pointer un fichier qui EXISTE (un voisin cité mais
 * introuvable serait pire qu'aucune preuve : il ferait croire à une vérif
 * faite qui ne l'était pas).
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

describe('GA-398 — audit « analyse compte connu » (#2929)', () => {
  it('la garde LIT quelque chose : les neuf points sont tous audités', () => {
    expect(KNOWN_ACCOUNT_ANALYSIS_POINTS.length).toBe(9)
    expect(Object.keys(KNOWN_ACCOUNT_ANALYSIS_AUDIT)).toHaveLength(9)
  })

  it('toute preuve citée (voisin le plus proche) pointe un fichier qui EXISTE', () => {
    const dangling: string[] = []
    for (const point of KNOWN_ACCOUNT_ANALYSIS_POINTS) {
      const evidence = KNOWN_ACCOUNT_ANALYSIS_AUDIT[point].nearestNeighborEvidence
      if (!evidence) continue
      const path = evidence.split(':')[0]
      if (!existsSync(join(REPO_ROOT, path))) dangling.push(`${point} → ${path}`)
    }
    expect(dangling).toEqual([])
  })

  it('aucun point n’est silencieusement forcé à `present`', () => {
    for (const point of KNOWN_ACCOUNT_ANALYSIS_POINTS) {
      expect(['present', 'absent', 'unverified']).toContain(KNOWN_ACCOUNT_ANALYSIS_AUDIT[point].status)
    }
  })

  it('sait dire NON — sur une preuve qui pointe un fichier absent', () => {
    const brokenPath = 'packages/contracts/src/schemas/ce-fichier-nexiste-pas.ts'
    expect(existsSync(join(REPO_ROOT, brokenPath))).toBe(false)
  })
})
