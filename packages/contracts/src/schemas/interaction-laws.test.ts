import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INTERACTION_RULES,
  INTERACTION_RULE_FAMILIES,
  interactionRuleSchema,
  unheldInteractionRules,
} from './interaction-laws.js'

/**
 * GA-41 — les règles d'interaction ne se perdent pas dans un PDF.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois chapitres entiers du tome 7 — douze lois d'interaction, neuf conflits de
 * placement, neuf règles de rendu graphique — n'étaient nommés dans AUCUN des
 * trois trackers censés le clore. Ce ne sont pourtant pas des questions
 * ouvertes : elles sont TRANCHÉES. Les laisser dans un PDF garantissait qu'on
 * les redemanderait au premier écran concerné.
 *
 * Comme pour `flow-registry` et `doctrine-registry`, ces tests ne peuvent pas
 * vérifier qu'une règle est APPLIQUÉE — seule une relecture le peut. Ils
 * vérifient qu'elle ne peut pas devenir complaisante : chaque porteur existe sur
 * le disque, chaque règle non gardée nomme son écart, et un registre tout vert
 * fait échouer la CI.
 */

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

describe('registre des règles d’interaction — complétude', () => {
  it('porte les trente règles du tome, sans doublon', () => {
    // 12 lois (§28) + 9 conflits de placement (§7) + 9 règles de rendu (§25).
    expect(INTERACTION_RULES).toHaveLength(30)
    expect(new Set(INTERACTION_RULES.map(rule => rule.key)).size).toBe(30)
  })

  it('couvre les trois familles, avec le bon compte pour chacune', () => {
    const count = (family: (typeof INTERACTION_RULE_FAMILIES)[number]) =>
      INTERACTION_RULES.filter(rule => rule.family === family).length
    expect(count('law')).toBe(12)
    expect(count('placement')).toBe(9)
    expect(count('dataviz')).toBe(9)
  })

  it('chaque entrée respecte son contrat', () => {
    for (const rule of INTERACTION_RULES) {
      expect(interactionRuleSchema.safeParse(rule).success).toBe(true)
    }
  })
})

describe('registre des règles d’interaction — les porteurs existent', () => {
  it('chaque fichier cité est ouvrable depuis la racine', () => {
    // L'accident du 24/08 : un contrat citait une garde qui n'avait jamais été
    // écrite. Une règle qui déclare un porteur absent fait croire qu'elle est
    // tenue, ce qui est pire que de la déclarer ouverte.
    const missing = INTERACTION_RULES.flatMap(rule => rule.holders).filter(path => !existsSync(join(REPO_ROOT, path)))
    expect([...new Set(missing)]).toEqual([])
  })

  it('la garde sait dire NON — un chemin inventé serait vu', () => {
    expect(existsSync(join(REPO_ROOT, 'packages/contracts/src/schemas/interaction-laws.ts'))).toBe(true)
    expect(existsSync(join(REPO_ROOT, 'packages/contracts/src/schemas/regle-qui-nexiste-pas.ts'))).toBe(false)
  })

  it('une règle GARDÉE cite au moins un fichier', () => {
    const empty = INTERACTION_RULES.filter(rule => rule.state === 'guarded' && rule.holders.length === 0)
    expect(empty.map(rule => rule.key)).toEqual([])
  })

  it('une règle OUVERTE ne cite aucun porteur — sinon elle n’est pas ouverte', () => {
    const contradictory = INTERACTION_RULES.filter(rule => rule.state === 'open' && rule.holders.length > 0)
    expect(contradictory.map(rule => rule.key)).toEqual([])
  })
})

describe('registre des règles d’interaction — honnêteté', () => {
  it('toute règle qui n’est pas gardée NOMME son écart', () => {
    const unexplained = INTERACTION_RULES.filter(rule => rule.state !== 'guarded' && !rule.gap)
    expect(unexplained.map(rule => rule.key)).toEqual([])
  })

  it('reconnaît que la majorité n’est PAS gardée — un registre tout vert serait faux', () => {
    // Au 25/08 : sept règles gardées sur trente. Ce test tombera le jour où
    // quelqu'un déclarera tout tenu sans avoir écrit la garde.
    const guarded = INTERACTION_RULES.filter(rule => rule.state === 'guarded')
    expect(guarded.length).toBeLessThan(INTERACTION_RULES.length / 2)
    expect(unheldInteractionRules().length).toBeGreaterThan(0)
  })

  it('dit que « l’état est dans l’URL » n’est tenu par rien — la loi la plus rentable des douze', () => {
    const rule = INTERACTION_RULES.find(entry => entry.key === 'law_state_lives_in_the_url')
    expect(rule?.state).toBe('open')
    expect(rule?.gap).toContain('useState')
  })

  it('dit qu’une valeur inconnue n’est tenue nulle part DANS un graphique', () => {
    // La règle « non mesuré n'est pas zéro » est gardée dans le TEXTE
    // (GA-18/GA-19) et pas dans un graphe, où un point manquant devient un creux
    // qui se lit comme une chute.
    const rule = INTERACTION_RULES.find(entry => entry.key === 'viz_unknown_is_hatched')
    expect(rule?.state).toBe('open')
    expect(rule?.gap).toContain('chute')
  })
})
