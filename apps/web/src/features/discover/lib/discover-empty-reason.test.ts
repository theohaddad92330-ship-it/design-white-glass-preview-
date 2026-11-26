import { describe, expect, it } from 'vitest'
import { discoverEmptyReason, emptyListReason } from './discover-empty-reason'

/**
 * #2550.1 / #3878.1 — « aucun résultat » doit distinguer ses causes :
 * secteur non exprimé, incohérence réellement détectée, ou repli honnête.
 * « Source en panne » et « filtre trop strict » (quand les résultats
 * EXISTENT) sont décidés AILLEURS — voir le commentaire d'en-tête du module.
 */
describe('discoverEmptyReason', () => {
  it('nomme le secteur quand le registre n’a pas su l’exprimer', () => {
    expect(discoverEmptyReason({ unappliedFields: new Set(['sector']), hasInconsistentFilters: false })).toBe(
      'sectorUnsupported',
    )
    expect(discoverEmptyReason({ unappliedFields: new Set(['nafCode']), hasInconsistentFilters: false })).toBe(
      'sectorUnsupported',
    )
  })

  it('nomme une incohérence réellement détectée, jamais déduite d’un comptage', () => {
    expect(discoverEmptyReason({ unappliedFields: new Set(), hasInconsistentFilters: true })).toBe(
      'inconsistentFilters',
    )
  })

  it('retombe sur « aucune correspondance » sans incohérence détectée, secteur exprimé', () => {
    expect(discoverEmptyReason({ unappliedFields: new Set(), hasInconsistentFilters: false })).toBe('noMatch')
  })

  it('le secteur non exprimé prime sur une incohérence détectée', () => {
    expect(discoverEmptyReason({ unappliedFields: new Set(['sector']), hasInconsistentFilters: true })).toBe(
      'sectorUnsupported',
    )
  })

  it('ne rend jamais « filtersNarrow » — ce diagnostic est décidé ailleurs (#3878.1)', () => {
    // #3878.1 — RÉFUTÉ en recette : cette fonction choisissait `filtersNarrow`
    // dès que `activeFilterCount > 1`, sans preuve que ces filtres expliquent
    // le zéro observé. Elle ne reçoit plus ce paramètre et ne peut donc plus
    // le rendre : seul `Discover.tsx` le pose, à l'endroit où les résultats
    // EXISTENT et où les affinages d'écran les masquent tous (un FAIT, pas une
    // déduction).
    expect(discoverEmptyReason({ unappliedFields: new Set(), hasInconsistentFilters: false })).not.toBe('filtersNarrow')
  })
})

describe('#3941.5 (R41) — « Augmentation de capital » seul coché', () => {
  it('SAIT DIRE NON puis OUI : zéro compte avec le signal = une phrase dédiée, jamais le message générique', () => {
    const base = { unappliedFields: new Set<string>(), hasInconsistentFilters: false }
    expect(discoverEmptyReason({ ...base, capitalOnly: false })).toBe('noMatch')
    expect(discoverEmptyReason({ ...base, capitalOnly: true })).toBe('noCapitalIncrease')
  })
})

describe('#4317.2 — une compétence posée : le zéro dit sa cause', () => {
  it('SAIT DIRE NON puis OUI : sans compétence, message générique ; avec, la cause compétence', () => {
    const base = { unappliedFields: new Set<string>(), hasInconsistentFilters: false }
    expect(discoverEmptyReason({ ...base, hasSkills: false })).toBe('noMatch')
    expect(discoverEmptyReason({ ...base, hasSkills: true })).toBe('skillsNoMatch')
  })

  it('un secteur non appliqué reste prioritaire sur la cause compétence', () => {
    expect(
      discoverEmptyReason({ unappliedFields: new Set(['sector']), hasInconsistentFilters: false, hasSkills: true }),
    ).toBe('sectorUnsupported')
  })
})

// #4627 — « Trop de filtres empilés » accusait l'utilisateur avec UN SEUL filtre (la ville) : tous les comptes
// trouvés étaient écartés par la qualification, aucun filtre d'écran n'y était pour rien.
describe('emptyListReason — #4627', () => {
  it('des comptes trouvés mais tous écartés ou masqués : on le dit, on n’accuse aucun filtre', () => {
    expect(emptyListReason({ crossed: 12, kept: 0 })).toBe('allSetAside')
  })

  it('des comptes retenus que les affinages d’écran masquent tous : les filtres, c’est vrai', () => {
    expect(emptyListReason({ crossed: 12, kept: 5 })).toBe('filtersNarrow')
  })

  it('le croisement du rail a lui-même tout retiré : ce sont bien des filtres', () => {
    expect(emptyListReason({ crossed: 0, kept: 0 })).toBe('filtersNarrow')
  })
})
