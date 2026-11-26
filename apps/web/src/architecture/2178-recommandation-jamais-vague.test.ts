/**
 * #2178.36 — INTERDIRE LES RECOMMANDATIONS VAGUES, SANS NOMMER LA VARIABLE.
 *
 * L'issue #2178 demande un system prompt qui refuse « Élargir la recherche »
 * ou « Chercher d'autres profils » sans nommer CE qui doit changer. Balayage
 * du 25/09/2026 (registre) : aucun LLM ne génère ce texte. `nextBestMoveOptions`
 * (`apps/api/.../matching/next-best-move.ts`, #2331) est une fonction PURE,
 * déterministe, qui choisit dans une liste FERMÉE de DIX arbitrages
 * (`NEXT_BEST_MOVE_OPTIONS`, packages/contracts) — un texte vague y est donc
 * structurellement impossible : il n'y a pas de génération libre à brider, il
 * y a dix libellés fixes, traduits une fois, jamais réécrits à la volée.
 *
 * Cette garde tient donc DEUX choses à la place d'un system prompt :
 *  1. le calcul reste SANS appel à un modèle — le jour où quelqu'un y branche
 *     un LLM (pour personnaliser un libellé, par exemple), c'est CE fichier
 *     qui doit changer, pas glisser un appel non gardé ;
 *  2. aucun des dix libellés, dans aucune langue, ne reprend l'une des
 *     formulations que l'issue nomme explicitement comme vagues.
 *
 * Une garde protège une règle, elle ne l'invente pas — voir le docblock de
 * `une-absence-ne-fait-pas-une-ligne.test.ts` pour le même principe appliqué
 * ailleurs dans ce dossier.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NEXT_BEST_MOVE_OPTIONS } from '@bellum/contracts'
import { resources } from '@/i18n/resources'

/** `resources` est typé large (`unknown` en feuille, TS7056) — cette garde
 *  creuse plus profond que le reste du dépôt : une forme locale, jamais
 *  `any` (CLAUDE.md § Code rules). */
interface NextBestMoveNamespace {
  matching: { nextBestMove: { options: Record<string, string> } }
}
const fr = resources.fr as unknown as NextBestMoveNamespace
const en = resources.en as unknown as NextBestMoveNamespace

const NEXT_BEST_MOVE_MODULE = join(
  __dirname,
  '..',
  '..',
  '..',
  'api',
  'src',
  'modules',
  'consultants',
  'matching',
  'next-best-move.ts',
)

/**
 * Les deux formulations que l'issue nomme, mot pour mot, comme l'exemple de
 * ce qu'il ne faut JAMAIS afficher — en français (le texte source de l'issue)
 * et leur équivalent anglais, pour que la garde lise les DEUX catalogues.
 */
const VAGUE_PHRASES = [
  'Élargir la recherche',
  'Chercher d’autres profils',
  'Widen the search',
  'Look for other profiles',
]

describe('#2178.36 — une recommandation ne reste jamais vague', () => {
  it('la garde lit bien un module et un catalogue non vides — sinon elle passerait au vert sur du rien', () => {
    expect(existsSync(NEXT_BEST_MOVE_MODULE), `module introuvable : ${NEXT_BEST_MOVE_MODULE}`).toBe(true)
    expect(NEXT_BEST_MOVE_OPTIONS.length).toBeGreaterThan(0)
    expect(Object.keys(fr.matching.nextBestMove.options).length).toBe(NEXT_BEST_MOVE_OPTIONS.length)
  })

  it.each(NEXT_BEST_MOVE_OPTIONS)('l’arbitrage « %s » porte un libellé FR et EN non vide', option => {
    const frLabel = fr.matching.nextBestMove.options[option]
    const enLabel = en.matching.nextBestMove.options[option]
    expect(frLabel, `fr/matching.json ne nomme pas « ${option} »`).toBeTruthy()
    expect(enLabel, `en/matching.json ne nomme pas « ${option} »`).toBeTruthy()
  })

  it('aucun libellé ne reprend une formulation vague nommée par l’issue #2178', () => {
    const allLabels = [
      ...Object.values(fr.matching.nextBestMove.options),
      ...Object.values(en.matching.nextBestMove.options),
    ]
    const offenders = allLabels.filter(label => VAGUE_PHRASES.includes(label))
    expect(offenders.join('\n')).toBe('')
  })

  it('le calcul reste une fonction PURE — aucun appel à un modèle, ici, n’a besoin d’être bridé', () => {
    const source = readFileSync(NEXT_BEST_MOVE_MODULE, 'utf8')
    // Recherche insensible à la casse : un futur `Anthropic(...)`, un import
    // `@anthropic-ai/sdk`, ou un `callClaude(...)` ferait tomber ce test — le
    // jour où ce module génère du texte libre, c'est LUI qui doit porter un
    // system prompt, et cette garde le dit avant que quelqu'un ne l'ajoute
    // sans y penser.
    expect(/anthropic|claude|generatetext|llm/i.test(source)).toBe(false)
  })
})
