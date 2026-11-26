import { describe, expect, it } from 'vitest'
import {
  EMPTY_STRUCTURED_LEXICON,
  LEXICON_CONCEPTS,
  LEXICON_CONCEPT_EVIDENCE,
  LEXICON_DEFAULTS,
  LEXICON_LOCALES,
  LEXICON_OUT_OF_SCOPE,
  isEmptyStructuredLexicon,
  lexiconOverridesFingerprint,
  lexiconViolations,
  normaliseLexiconTerm,
  resolveLexicon,
  structuredLexiconSchema,
  type StructuredLexicon,
} from './workspace-lexicon.js'

describe('le lexique par espace — un espace SANS lexique lit le produit', () => {
  it('rend exactement les mots par défaut, langue par langue', () => {
    for (const locale of LEXICON_LOCALES) {
      const resolved = resolveLexicon(EMPTY_STRUCTURED_LEXICON, locale)
      for (const concept of LEXICON_CONCEPTS) {
        expect(resolved[concept]).toEqual(LEXICON_DEFAULTS[concept][locale])
      }
    }
  })

  it('reconnaît qu’il n’y a rien à appliquer — c’est ce qui rend le no-op possible', () => {
    expect(isEmptyStructuredLexicon(EMPTY_STRUCTURED_LEXICON)).toBe(true)
    expect(
      isEmptyStructuredLexicon({ overrides: [{ concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' }] }),
    ).toBe(false)
  })

  it('une valeur stockée illisible dégrade vers « aucune surcharge », jamais vers une exception', () => {
    // Un portefeuille illisible ferait tomber toutes les analyses de l'espace.
    expect(structuredLexiconSchema.parse({ overrides: 'n’importe quoi' })).toEqual(EMPTY_STRUCTURED_LEXICON)
    expect(structuredLexiconSchema.parse({})).toEqual(EMPTY_STRUCTURED_LEXICON)
  })
})

describe('#2862 (#2437.8) — version et date de dernière modification', () => {
  it('un lexique jamais modifié ne porte AUCUNE version — non mesuré n’est jamais 0', () => {
    expect(EMPTY_STRUCTURED_LEXICON.version).toBeNull()
    expect(EMPTY_STRUCTURED_LEXICON.updatedAt).toBeNull()
    expect(EMPTY_STRUCTURED_LEXICON.updatedBy).toBeNull()
  })

  it('un `updatedBy` illisible ou absent dégrade vers `null`, jamais vers une exception', () => {
    expect(structuredLexiconSchema.parse({ updatedBy: 'pas-un-uuid' }).updatedBy).toBeNull()
    expect(structuredLexiconSchema.parse({}).updatedBy).toBeNull()
  })

  it('une version stockée illisible ou négative dégrade vers `null`, jamais vers une exception', () => {
    expect(structuredLexiconSchema.parse({ version: -1 }).version).toBeNull()
    expect(structuredLexiconSchema.parse({ version: 'trois' }).version).toBeNull()
  })
})

describe('la surcharge', () => {
  const FR_NEED: StructuredLexicon = {
    overrides: [{ concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' }],
  }

  it('remplace le concept surchargé, et lui seul', () => {
    const resolved = resolveLexicon(FR_NEED, 'fr')
    expect(resolved.need).toEqual({ one: 'Poste', other: 'Postes' })
    expect(resolved.project).toEqual(LEXICON_DEFAULTS.project.fr)
    expect(resolved.account).toEqual(LEXICON_DEFAULTS.account.fr)
  })

  it('ne traverse JAMAIS les langues — un mot français ne se traduit pas tout seul', () => {
    // Deviner « Poste » → « Position » écrirait un mot que personne n'a choisi.
    expect(resolveLexicon(FR_NEED, 'en')).toEqual(
      Object.fromEntries(LEXICON_CONCEPTS.map(concept => [concept, LEXICON_DEFAULTS[concept].en])),
    )
  })
})

describe('normaliseLexiconTerm', () => {
  it('rend la même clé pour la casse, les accents et les espaces', () => {
    expect(normaliseLexiconTerm('Régie')).toBe(normaliseLexiconTerm('  REGIE '))
    expect(normaliseLexiconTerm('Talent  pool')).toBe('talent pool')
  })
})

describe('un terme INTERDIT empêche quelque chose — sinon c’est une case décorative', () => {
  it('refuse de PRÉFÉRER un mot qu’on s’interdit', () => {
    const violations = lexiconViolations(
      { overrides: [{ concept: 'mission', locale: 'fr', one: 'Régie', other: 'Régies' }] },
      ['régie'],
    )
    expect(violations.map(v => v.code)).toContain('preferred_is_forbidden')
    expect(violations.find(v => v.code === 'preferred_is_forbidden')?.term).toBe('Régie')
  })

  it('accent et casse ne servent PAS de porte dérobée', () => {
    const violations = lexiconViolations(
      { overrides: [{ concept: 'mission', locale: 'fr', one: 'REGIE', other: 'Regies' }] },
      ['Régie'],
    )
    expect(violations.some(v => v.code === 'preferred_is_forbidden')).toBe(true)
  })

  it('interdire un mot PAR DÉFAUT du produit oblige à dire ce qu’on met à la place', () => {
    // C'est le refus qui fait mordre l'interdit sur les LIBELLÉS : sans terme
    // préféré, « Vivier » resterait dans la navigation et l'interdit n'aurait
    // rien empêché.
    const violations = lexiconViolations(EMPTY_STRUCTURED_LEXICON, ['Vivier'])
    const violation = violations.find(v => v.code === 'forbidden_without_replacement')
    expect(violation).toBeDefined()
    expect(violation?.concept).toBe('talent_pool')
    expect(violation?.locale).toBe('fr')
  })

  it('… et se tait dès que le remplaçant est posé', () => {
    const violations = lexiconViolations(
      { overrides: [{ concept: 'talent_pool', locale: 'fr', one: 'Banc', other: 'Bancs' }] },
      ['Vivier'],
    )
    expect(violations.filter(v => v.code === 'forbidden_without_replacement')).toEqual([])
  })

  it('un interdit qui ne touche AUCUN mot du produit ne bloque rien', () => {
    // « ESN » n'est le nom par défaut d'aucun des huit concepts : il ne teinte
    // que les textes générés, ce qui était déjà le cas avant ce lot.
    expect(lexiconViolations(EMPTY_STRUCTURED_LEXICON, ['ESN', 'cabinet'])).toEqual([])
  })

  it('aucun interdit ⇒ aucun refus, quel que soit le lexique', () => {
    const rich: StructuredLexicon = {
      overrides: LEXICON_CONCEPTS.map(concept => ({ concept, locale: 'fr' as const, one: 'X', other: 'Xs' })),
    }
    expect(lexiconViolations(rich, [])).toEqual([])
  })
})

describe('le catalogue se tient debout', () => {
  it('chaque concept a un défaut dans les deux langues, non vide', () => {
    for (const concept of LEXICON_CONCEPTS) {
      for (const locale of LEXICON_LOCALES) {
        expect(LEXICON_DEFAULTS[concept][locale].one.length).toBeGreaterThan(0)
        expect(LEXICON_DEFAULTS[concept][locale].other.length).toBeGreaterThan(0)
      }
    }
  })

  it('chaque concept dit POURQUOI il est surchargeable — sinon c’est une opinion', () => {
    for (const concept of LEXICON_CONCEPTS) {
      expect(LEXICON_CONCEPT_EVIDENCE[concept].length).toBeGreaterThan(40)
    }
  })

  it('le hors-périmètre est NOMMÉ — un lexique partiel doit dire ce qu’il ne fait pas', () => {
    expect(LEXICON_OUT_OF_SCOPE.length).toBeGreaterThanOrEqual(5)
    expect(LEXICON_OUT_OF_SCOPE).toContain('sentences')
  })
})

describe('lexiconOverridesFingerprint (#2862) — indépendante de l’ordre', () => {
  it('deux listes de MÊME contenu, ordonnées différemment, ont la MÊME empreinte', () => {
    const a: StructuredLexicon['overrides'] = [
      { concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' },
      { concept: 'mission', locale: 'fr', one: 'Régie', other: 'Régies' },
    ]
    const b: StructuredLexicon['overrides'] = [
      a[1] as StructuredLexicon['overrides'][number],
      a[0] as StructuredLexicon['overrides'][number],
    ]
    expect(lexiconOverridesFingerprint(a)).toBe(lexiconOverridesFingerprint(b))
  })

  it('un contenu différent rend une empreinte différente', () => {
    const a: StructuredLexicon['overrides'] = [{ concept: 'need', locale: 'fr', one: 'Poste', other: 'Postes' }]
    const b: StructuredLexicon['overrides'] = [{ concept: 'need', locale: 'fr', one: 'Affaire', other: 'Affaires' }]
    expect(lexiconOverridesFingerprint(a)).not.toBe(lexiconOverridesFingerprint(b))
  })
})
