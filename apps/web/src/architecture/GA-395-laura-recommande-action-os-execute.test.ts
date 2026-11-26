import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTION_OS_VERB_AUDIT, ACTION_OS_VERBS } from '@bellum/contracts'

/**
 * GA-395 — #2317.10 : LAURA RECOMMANDE, L'ACTION OS EXÉCUTE — SIX VERBES
 * DISTINCTS, ET CHACUN POINTE UN GESTE RÉEL.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET D'OÙ ELLE VIENT
 * ─────────────────────────────────────────────────────────────────────────
 * #2317 (LAU-FINAL-058, repris #2923) sépare deux vocabulaires : Laura
 * explique / prépare / préremplit / lance une guided action ; l'Action OS
 * crée / assigne / planifie / écrit / envoie après validation / conserve la
 * preuve. Vérification du 25-26/09/2026 : les six gestes existaient déjà,
 * chacun dans son service, sans qu'aucun endroit ne les nomme comme LES SIX
 * VERBES de l'épopée — `action-os-verbs.ts` (#2923) livre cet audit ; cette
 * garde en tient la promesse dans LE TEMPS, comme GA-393 le fait pour le
 * contrat de page.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE VÉRIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle vérifie que les SIX verbes sont audités (aucun oublié), et que chaque
 * preuve `fichier:ligne` pointe un fichier qui EXISTE dans ce dépôt — un
 * fichier renommé ou supprimé fait rougir la CI plutôt que de continuer à
 * mentir en silence (même contrat que GA-393).
 *
 * Elle ne vérifie PAS que la ligne citée fait EXACTEMENT ce que son libellé
 * dit — lire une intention dans du code exécutable est un jugement produit,
 * hors de portée d'un grep ; c'est une revue humaine qui le confirme au
 * moment où l'audit est écrit, pas cette garde à chaque exécution.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

describe('GA-395 — Laura recommande, l’Action OS exécute (#2317.10)', () => {
  it('la garde LIT quelque chose : les six verbes sont tous audités', () => {
    expect(ACTION_OS_VERBS.length).toBe(6)
    expect(Object.keys(ACTION_OS_VERB_AUDIT).sort()).toEqual([...ACTION_OS_VERBS].sort())
  })

  it('chaque preuve pointe un fichier qui EXISTE dans le dépôt', () => {
    const dangling: string[] = []
    for (const verb of ACTION_OS_VERBS) {
      const path = ACTION_OS_VERB_AUDIT[verb].evidence.split(':')[0]
      if (!existsSync(join(REPO_ROOT, path))) dangling.push(`${verb} → ${path}`)
    }
    expect(dangling).toEqual([])
  })

  it('sait dire NON — sur une preuve qui pointe un fichier absent', () => {
    const brokenPath = 'apps/api/src/modules/actions/ce-fichier-nexiste-pas.ts'
    expect(existsSync(join(REPO_ROOT, brokenPath))).toBe(false)
  })
})
