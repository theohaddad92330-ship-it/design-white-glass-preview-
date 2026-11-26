import { describe, expect, it } from 'vitest'
import {
  TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS,
  TECHNO_PREVALENCE_REFUSALS,
  TECHNO_PREVALENCE_TIERS,
  technoPrevalenceScale,
  technoPrevalenceScaleRead,
  technoPrevalenceTier,
  technoPrevalenceOf,
} from './market-techno-prevalence.js'

/**
 * Un corpus synthétique dont la distribution est CONNUE : `count` technologies
 * observées sur `companies` entreprises chacune. Les libellés sont fabriqués,
 * seule la distribution compte.
 */
function corpus(...groups: { companies: number; count: number }[]): Map<string, number> {
  const frequency = new Map<string, number>()
  let index = 0
  for (const group of groups) {
    for (let i = 0; i < group.count; i += 1) {
      frequency.set(`techno-${(index += 1)}`, group.companies)
    }
  }
  return frequency
}

/** Une distribution étalée, largement au-dessus du plancher d'échantillon. */
function spreadCorpus(): Map<string, number> {
  const frequency = new Map<string, number>()
  for (let i = 1; i <= TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS * 3; i += 1) {
    frequency.set(`techno-${i}`, i)
  }
  return frequency
}

describe('l’échelle de prévalence se CALCULE sur le corpus, elle ne se choisit pas', () => {
  it('les trois paliers sont nommés, du plus rare au plus répandu', () => {
    expect(TECHNO_PREVALENCE_TIERS).toEqual(['rare', 'specialisee', 'courante'])
  })

  it('les deux bornes sont les quantiles 1/3 et 2/3 de la distribution observée', () => {
    // 90 technologies, une entreprise de plus à chaque fois : les tiers tombent
    // mécaniquement sur 30,67 et 60,33 (quantile linéaire R-7).
    const scale = technoPrevalenceScale(spreadCorpus())
    expect(scale).not.toBeNull()
    expect(scale?.rareMax).toBeCloseTo(30.67, 1)
    expect(scale?.specialiseeMax).toBeCloseTo(60.33, 1)
    expect(scale?.distinctTechnos).toBe(90)
  })

  it('classe une technologie par rapport à ces bornes, jamais par rapport à un seuil écrit à la main', () => {
    const scale = technoPrevalenceScale(spreadCorpus())!
    expect(technoPrevalenceTier(5, scale)).toBe('rare')
    expect(technoPrevalenceTier(45, scale)).toBe('specialisee')
    expect(technoPrevalenceTier(88, scale)).toBe('courante')
  })

  it('la borne est INCLUSIVE en bas — une valeur exactement sur la borne reste dans le palier du bas', () => {
    const scale = technoPrevalenceScale(spreadCorpus())!
    expect(technoPrevalenceTier(scale.rareMax, scale)).toBe('rare')
    expect(technoPrevalenceTier(scale.specialiseeMax, scale)).toBe('specialisee')
  })

  it('une distribution en trois paliers égaux les retrouve tous les trois', () => {
    const scale = technoPrevalenceScale(
      corpus({ companies: 1, count: 30 }, { companies: 2, count: 30 }, { companies: 3, count: 30 }),
    )
    expect(scale).not.toBeNull()
    expect(technoPrevalenceTier(1, scale!)).toBe('rare')
    expect(technoPrevalenceTier(2, scale!)).toBe('specialisee')
    expect(technoPrevalenceTier(3, scale!)).toBe('courante')
  })
})

describe('une mesure impossible ne dit jamais « tout va bien »', () => {
  it('sous le plancher d’échantillon, AUCUNE échelle — un tiers sur dix technologies est un artefact', () => {
    const tooFew = corpus({ companies: 1, count: TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS - 1 })
    expect(technoPrevalenceScale(tooFew)).toBeNull()
  })

  it('un corpus vide n’a pas d’échelle', () => {
    expect(technoPrevalenceScale(new Map())).toBeNull()
  })

  it('des bornes EFFONDRÉES ne produisent aucune échelle — 80 % du corpus à la même valeur', () => {
    const skewed = corpus({ companies: 2, count: 80 }, { companies: 3, count: 10 }, { companies: 40, count: 10 })
    expect(technoPrevalenceScale(skewed)).toBeNull()
  })

  it('un palier MAJORITAIRE ne produit aucune échelle — la majorité d’un corpus n’est pas une rareté', () => {
    // Les bornes ne s'effondrent pas ici (1 puis 1,33), et c'est exactement le
    // piège : l'échelle NAÎTRAIT, et « rare » désignerait deux technologies sur
    // trois. Le nom du palier contredirait ce qu'il compte.
    const bottomHeavy = corpus({ companies: 1, count: 60 }, { companies: 2, count: 30 })
    expect(technoPrevalenceScale(bottomHeavy)).toBeNull()
  })

  it('un palier « courante » VIDE ne produit aucune échelle', () => {
    // Rien au-dessus de la borne haute : « courante » ne désignerait personne,
    // et les deux autres paliers mentiraient sur ce qu'ils excluent.
    const capped = corpus({ companies: 1, count: 45 }, { companies: 2, count: 45 })
    expect(technoPrevalenceScale(capped)).toBeNull()
  })

  it('ignore les fréquences illisibles plutôt que de les compter pour zéro', () => {
    const frequency = spreadCorpus()
    frequency.set('techno-illisible', Number.NaN)
    frequency.set('techno-negative', -4)
    expect(technoPrevalenceScale(frequency)?.distinctTechnos).toBe(90)
  })
})

describe('« inconnu » n’est jamais « rare »', () => {
  it('une technologie ABSENTE de la table des fréquences ne reçoit aucun palier', () => {
    const frequency = spreadCorpus()
    const scale = technoPrevalenceScale(frequency)!
    expect(technoPrevalenceOf('Cobol', frequency, scale)).toBeNull()
  })

  it('une technologie dont la fréquence est illisible ne reçoit aucun palier', () => {
    const frequency = spreadCorpus()
    const scale = technoPrevalenceScale(frequency)!
    frequency.set('cobol', Number.NaN)
    expect(technoPrevalenceOf('Cobol', frequency, scale)).toBeNull()
  })

  it('sans échelle, aucune technologie ne reçoit de palier — même mesurée', () => {
    const frequency = spreadCorpus()
    expect(technoPrevalenceOf('techno-1', frequency, null)).toBeNull()
  })

  it('rapproche en ignorant la casse et les espaces — le corpus est normalisé, la saisie non', () => {
    const frequency = spreadCorpus()
    frequency.set('spark', 4)
    const scale = technoPrevalenceScale(frequency)!
    expect(technoPrevalenceOf('  Spark ', frequency, scale)).toBe('rare')
  })

  it('une saisie vide ne reçoit aucun palier', () => {
    const frequency = spreadCorpus()
    const scale = technoPrevalenceScale(frequency)!
    expect(technoPrevalenceOf('   ', frequency, scale)).toBeNull()
  })
})

describe('le plancher d’échantillon est le SEUL nombre écrit à la main, et il vit ici', () => {
  it('il est déclaré, entier et strictement positif', () => {
    expect(Number.isInteger(TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS)).toBe(true)
    expect(TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS).toBeGreaterThan(0)
  })

  it('il laisse au moins dix technologies par palier — sous ça une borne bouge sur une seule ligne', () => {
    expect(TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS).toBeGreaterThanOrEqual(30)
  })
})

describe('un refus est une DÉCISION, pas une absence — chacun se NOMME', () => {
  it('les quatre refus sont déclarés', () => {
    expect(TECHNO_PREVALENCE_REFUSALS).toEqual(['tooFewTechnos', 'collapsedBounds', 'majorityTier', 'emptyTopTier'])
  })

  it('chacun des quatre est ATTEIGNABLE — un refus qu’aucun corpus ne déclenche ne prouve rien', () => {
    const reasons = [
      technoPrevalenceScaleRead(corpus({ companies: 1, count: 5 })),
      technoPrevalenceScaleRead(
        corpus({ companies: 2, count: 80 }, { companies: 3, count: 10 }, { companies: 40, count: 10 }),
      ),
      technoPrevalenceScaleRead(corpus({ companies: 1, count: 60 }, { companies: 2, count: 30 })),
      technoPrevalenceScaleRead(corpus({ companies: 1, count: 45 }, { companies: 2, count: 45 })),
    ].map(read => (read.kind === 'refused' ? read.reason : 'scale'))

    expect(reasons).toEqual(['tooFewTechnos', 'collapsedBounds', 'majorityTier', 'emptyTopTier'])
  })

  it('un refus dit COMBIEN de technologies il a lues — « zéro échelle » n’est pas « zéro donnée »', () => {
    const read = technoPrevalenceScaleRead(corpus({ companies: 1, count: 5 }))
    expect(read.kind).toBe('refused')
    if (read.kind !== 'refused') return
    expect(read.distinctTechnos).toBe(5)
  })

  it('l’échelle et le refus sont la MÊME décision — `technoPrevalenceScale` n’en refait pas une seconde', () => {
    const spread = spreadCorpus()
    const tooFew = corpus({ companies: 1, count: 5 })
    expect(technoPrevalenceScale(spread)).toEqual(
      technoPrevalenceScaleRead(spread).kind === 'scale'
        ? (technoPrevalenceScaleRead(spread) as { scale: unknown }).scale
        : null,
    )
    expect(technoPrevalenceScale(tooFew)).toBeNull()
    expect(technoPrevalenceScaleRead(tooFew).kind).toBe('refused')
  })
})
