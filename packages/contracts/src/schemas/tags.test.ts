import { describe, expect, it } from 'vitest'
import { TAG_MAX_LENGTH, TAGS_MAX_COUNT, normalizeTag, normalizeTags, pickRepresentativeTags, tagKey } from './tags.js'

/**
 * #2159.26 — les étiquettes des contacts et des comptes (décision Louis
 * 19/09/2026, « Casse d'origine »). Une étiquette garde la graphie de sa
 * PREMIÈRE saisie en base — « SAP » reste « SAP » — mais « SAP », « sap » et
 * « Sap » restent la MÊME étiquette pour le dédoublonnage et le filtre :
 * sinon cliquer l'une cacherait les deux autres.
 */
describe('normalizeTag (#2159.26)', () => {
  it('rogne les espaces et les ramène à un seul, SANS toucher à la casse', () => {
    expect(normalizeTag('  Grand   Compte ')).toBe('Grand Compte')
    expect(normalizeTag('SAP')).toBe('SAP')
    expect(normalizeTag('Décideur')).toBe('Décideur')
  })

  it('rend `null` pour une étiquette vide — jamais une chaîne vide en base', () => {
    expect(normalizeTag('   ')).toBeNull()
    expect(normalizeTag('')).toBeNull()
  })

  it('coupe une étiquette trop longue plutôt que de la refuser en silence', () => {
    expect(normalizeTag('x'.repeat(TAG_MAX_LENGTH + 10))).toHaveLength(TAG_MAX_LENGTH)
  })
})

// #2159.26 — graphie de la première saisie (décision Louis 19/09) : la clé de
// comparaison, séparée de la graphie affichée. Aucun second normaliseur
// ailleurs ne doit refaire ce `.toLowerCase()`.
describe('tagKey (#2159.26)', () => {
  it('ramène une graphie à sa clé de comparaison, en minuscules', () => {
    expect(tagKey('SAP')).toBe('sap')
    expect(tagKey('Sap')).toBe('sap')
    expect(tagKey('sap')).toBe('sap')
  })
})

describe('normalizeTags (#2159.26)', () => {
  it('découpe une cellule de fichier sur , ; et |, en gardant la graphie de chaque jeton', () => {
    expect(normalizeTags('SAP; Grand compte, décideur | cloud')).toEqual(['SAP', 'Grand compte', 'décideur', 'cloud'])
  })

  it('dédoublonne SANS tenir compte de la casse, en gardant la PREMIÈRE graphie rencontrée', () => {
    expect(normalizeTags(['SAP', 'sap ', 'Cloud', ' SAP'])).toEqual(['SAP', 'Cloud'])
  })

  it('« SAP; sap » sur une même fiche ne donne qu’une étiquette, la première graphie « SAP »', () => {
    expect(normalizeTags('SAP; sap')).toEqual(['SAP'])
  })

  it('ignore ce qui n’est ni une chaîne ni un tableau de chaînes', () => {
    expect(normalizeTags(null)).toEqual([])
    expect(normalizeTags(undefined)).toEqual([])
    expect(normalizeTags(42)).toEqual([])
    expect(normalizeTags(['ok', 3, null])).toEqual(['ok'])
  })

  it(`plafonne à ${TAGS_MAX_COUNT} étiquettes — la contrainte SQL refuserait au-delà`, () => {
    const many = Array.from({ length: TAGS_MAX_COUNT + 5 }, (_, i) => `t${i}`)
    expect(normalizeTags(many)).toHaveLength(TAGS_MAX_COUNT)
  })
})

/**
 * #2159.26 — le filtre « Étiquette » des listes (décision Louis 19/09).
 * Regroupe des occurrences (une par fiche, dans l'ordre de rencontre — donc
 * de création) par clé insensible à la casse, et rend UNE graphie par clé :
 * la plus fréquente, à égalité la première rencontrée.
 */
describe('pickRepresentativeTags (#2159.26)', () => {
  it('une seule graphie par clé — la plus fréquente', () => {
    // « SAP » posé sur 2 fiches, « sap » sur 1 seule.
    expect(pickRepresentativeTags(['SAP', 'sap', 'SAP'])).toEqual(['SAP'])
  })

  it('à égalité de fréquence, la PREMIÈRE graphie rencontrée gagne', () => {
    expect(pickRepresentativeTags(['sap', 'SAP'])).toEqual(['sap'])
    expect(pickRepresentativeTags(['SAP', 'sap'])).toEqual(['SAP'])
  })

  it('une option par clé retient bien les DEUX fiches (le compte est sur count, pas sur la sortie)', () => {
    // Le point du test n'est pas le compte rendu (une seule graphie), mais
    // que la fonction ne perd aucune clé même quand plusieurs graphies
    // cohabitent : « sap »/« SAP » restent UNE clé, « cloud » une autre.
    expect(pickRepresentativeTags(['SAP', 'cloud', 'sap'])).toEqual(['cloud', 'SAP'])
  })

  it('trie le résultat alphabétiquement', () => {
    expect(pickRepresentativeTags(['SAP', 'Décideur', 'cloud'])).toEqual(['cloud', 'Décideur', 'SAP'])
  })

  it('rend [] sur une liste vide', () => {
    expect(pickRepresentativeTags([])).toEqual([])
  })
})
