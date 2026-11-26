import { describe, expect, it } from 'vitest'
import { explainBriefingDomination } from './daily-briefing.js'
import type { BriefingAction, BriefingRankingAxisReading } from './daily-briefing.js'

/**
 * #2095.81 / #2993 — « CHAQUE PRIORITÉ EXPLIQUE POURQUOI ELLE PASSE AVANT LES
 * AUTRES ».
 *
 * MESURÉ le 24/09 : la carte nommait déjà SES PROPRES axes pesés
 * (`briefing.actions.domination.spec.ts` côté API), mais jamais en
 * comparaison à la carte précise qu'elle précède — jugé insuffisant. Ces tests
 * couvrent la fonction qui compare CHAQUE carte à la SUIVANTE dans le
 * classement déjà décidé, avec le MÊME comparateur que le tri réel
 * (`compareBriefingActions`) — jamais une seconde règle qui pourrait
 * contredire l'ordre affiché.
 */

type Card = Pick<BriefingAction, 'priority' | 'rankingAxes'> & Partial<Pick<BriefingAction, 'confidence'>>

function reading(axis: BriefingRankingAxisReading['axis'], evaluated = true): BriefingRankingAxisReading {
  return { axis, evaluated }
}

function card(partial: Partial<Card>): Card {
  return { priority: 1, rankingAxes: [], confidence: 'verified', ...partial }
}

describe('explainBriefingDomination', () => {
  it('la DERNIÈRE carte ne compare à rien — null, jamais un axe inventé', () => {
    const result = explainBriefingDomination([card({ priority: 1 })])
    expect(result).toEqual([null])
  })

  it('un rang de PRIORITÉ différent est LA raison, avant tout axe (#2095, règle première)', () => {
    const result = explainBriefingDomination([
      card({ priority: 1, rankingAxes: [] }),
      card({ priority: 2, rankingAxes: [reading('consequence')] }),
    ])
    expect(result[0]).toEqual({ kind: 'priority' })
  })

  it('à priorité égale, une confiance plus fiable est LA raison (#2095.72)', () => {
    const result = explainBriefingDomination([
      card({ priority: 1, confidence: 'verified' }),
      card({ priority: 1, confidence: 'inferred' }),
    ])
    expect(result[0]).toEqual({ kind: 'confidence' })
  })

  it('à priorité et confiance égales, nomme les axes qui départagent — jamais un poids chiffré', () => {
    const result = explainBriefingDomination([
      card({ priority: 1, rankingAxes: [reading('consequence'), reading('urgency')] }),
      card({ priority: 1, rankingAxes: [reading('urgency')] }),
    ])
    expect(result[0]).toEqual({ kind: 'axes', axes: ['consequence'] })
  })

  it('deux cartes VRAIMENT à égalité rendent null — jamais un ordre affirmé sans raison', () => {
    const result = explainBriefingDomination([
      card({ priority: 1, rankingAxes: [reading('consequence')] }),
      card({ priority: 1, rankingAxes: [reading('consequence')] }),
    ])
    expect(result[0]).toBeNull()
  })

  it('un axe NON évalué ne compte pour rien — seul `evaluated: true` pèse', () => {
    const result = explainBriefingDomination([
      card({ priority: 1, rankingAxes: [reading('consequence'), reading('urgency', false)] }),
      card({ priority: 1, rankingAxes: [reading('consequence')] }),
    ])
    expect(result[0]).toBeNull()
  })

  it('une confiance ABSENTE (`undefined`) vaut `verified` — jamais pénalisée sans raison (#2095.72)', () => {
    const result = explainBriefingDomination([
      card({ priority: 1, confidence: undefined }),
      card({ priority: 1, confidence: 'verified' }),
    ])
    expect(result[0]).toBeNull()
  })
})
