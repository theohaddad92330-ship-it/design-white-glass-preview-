import { describe, expect, it } from 'vitest'
import {
  CUSTOM_FIELDS_MAX_PER_ENTITY,
  createCustomFieldSchema,
  createSavedViewSchema,
  customFieldKey,
  DUPLICATE_AUTO_MERGE_MIN_CONFIDENCE,
  DUPLICATE_DECISIONS,
  autoMergeSurvivor,
  decideDuplicateSchema,
  duplicatePairKey,
  isAutoMergeable,
  validateCustomValue,
} from './governance.js'

describe('createSavedViewSchema', () => {
  it('refuse une vue SANS critère — c’est la liste complète, elle existe déjà', () => {
    expect(() => createSavedViewSchema.parse({ scope: 'accounts', name: 'Tout', filters: {} })).toThrow()
  })

  it('est PERSONNELLE par défaut', () => {
    // Partager la vue de quelqu'un sans qu'il l'ait demandé encombre l'écran de
    // tout le monde.
    const parsed = createSavedViewSchema.parse({ scope: 'accounts', name: 'Mes comptes', filters: { owner: 'me' } })
    expect(parsed.shared).toBe(false)
  })

  it('refuse un nom vide', () => {
    expect(() => createSavedViewSchema.parse({ scope: 'accounts', name: '   ', filters: { a: 1 } })).toThrow()
  })
})

describe('customFieldKey', () => {
  it('produit une clé ASCII stable', () => {
    // Elle voyage dans des exports CSV et des en-têtes : un accent y devient un
    // caractère de remplacement chez la moitié des tableurs.
    expect(customFieldKey('Référence marché')).toBe('reference_marche')
    expect(customFieldKey('Coût / jour')).toBe('cout_jour')
  })

  it('ne laisse ni tiret de tête ni de queue', () => {
    expect(customFieldKey('  — Budget —  ')).toBe('budget')
  })

  it('borne la longueur', () => {
    expect(customFieldKey('a'.repeat(80)).length).toBeLessThanOrEqual(40)
  })
})

describe('createCustomFieldSchema', () => {
  it('refuse une liste de choix SANS choix — elle ne se remplit jamais', () => {
    expect(() => createCustomFieldSchema.parse({ entityType: 'account', label: 'Segment', type: 'select' })).toThrow()
  })

  it('accepte un texte simple', () => {
    const parsed = createCustomFieldSchema.parse({ entityType: 'account', label: 'Référence marché' })
    expect(parsed.type).toBe('text')
    expect(parsed.options).toEqual([])
  })

  it('borne le nombre de champs par objet — dix, et c’est une décision', () => {
    expect(CUSTOM_FIELDS_MAX_PER_ENTITY).toBe(10)
  })
})

describe('validateCustomValue', () => {
  const text = { type: 'text' as const, options: [], label: 'Note' }
  const number = { type: 'number' as const, options: [], label: 'Budget' }
  const date = { type: 'date' as const, options: [], label: 'Échéance' }
  const select = { type: 'select' as const, options: ['A', 'B'], label: 'Segment' }

  it('accepte une valeur VIDE — effacer un champ est un geste légitime', () => {
    // Le refuser rendrait un champ impossible à corriger une fois rempli par
    // erreur.
    expect(validateCustomValue(text, '')).toBeNull()
    expect(validateCustomValue(number, null)).toBeNull()
    expect(validateCustomValue(select, undefined)).toBeNull()
  })

  it('NOMME le champ en refusant', () => {
    // « Valeur invalide » sur un formulaire à dix champs oblige à chercher lequel.
    expect(validateCustomValue(number, 'beaucoup')).toContain('Budget')
    expect(validateCustomValue(select, 'C')).toContain('Segment')
  })

  it('refuse une date qui n’en est pas une', () => {
    expect(validateCustomValue(date, '2026-02-31')).not.toBeNull()
    expect(validateCustomValue(date, '31/12/2026')).not.toBeNull()
    expect(validateCustomValue(date, '2026-12-31')).toBeNull()
  })

  it('refuse un nombre non fini', () => {
    expect(validateCustomValue(number, Number.NaN)).not.toBeNull()
    expect(validateCustomValue(number, 1200)).toBeNull()
  })

  it('n’accepte QUE les choix déclarés', () => {
    expect(validateCustomValue(select, 'A')).toBeNull()
    expect(validateCustomValue(select, 'a')).not.toBeNull()
  })

  it('borne la longueur d’un texte', () => {
    expect(validateCustomValue(text, 'x'.repeat(2001))).not.toBeNull()
  })
})

describe('duplicatePairKey', () => {
  it('est INDÉPENDANTE de l’ordre', () => {
    // Sans ça, (A, B) et (B, A) seraient deux paires : écarter l'une laisserait
    // l'autre revenir, et la liste ne se viderait jamais.
    expect(duplicatePairKey('a', 'b')).toBe(duplicatePairKey('b', 'a'))
  })

  it('sépare deux paires différentes', () => {
    expect(duplicatePairKey('a', 'b')).not.toBe(duplicatePairKey('a', 'c'))
  })
})

describe('decideDuplicateSchema', () => {
  it('n’accepte que « fusionné » ou « écarté »', () => {
    expect(decideDuplicateSchema.parse({ decision: 'merged' }).decision).toBe('merged')
    expect(() => decideDuplicateSchema.parse({ decision: 'pending' })).toThrow()
  })

  it('refuse un champ inconnu — un geste humain ne commande pas une fusion Bellum', () => {
    expect(() => decideDuplicateSchema.parse({ decision: 'merged', keepId: 'a' })).toThrow()
  })

  it('#4016 L6 — un humain ne déclare jamais « fusionné automatiquement » : seul le balayeur l’écrit', () => {
    expect(() => decideDuplicateSchema.parse({ decision: 'auto_merged' })).toThrow()
  })
})

/**
 * #4016 L6 — ⚠️⚠️ RENVERSEMENT DATÉ de c37 (Louis 11/10/2026) : la fusion
 * AUTOMATIQUE des doublons à confiance ≥ 0,99, côté Bellum seulement,
 * réversible. La date de naissance reste hors des clés (c58/c37, légal).
 */
describe('#4016 L6 — fusion automatique des doublons', () => {
  it('le seuil est 0,99 — pas un cran en dessous', () => {
    expect(DUPLICATE_AUTO_MERGE_MIN_CONFIDENCE).toBe(0.99)
    expect(isAutoMergeable(0.99)).toBe(true)
    expect(isAutoMergeable(1)).toBe(true)
  })

  it('SAIT DIRE NON — la paire « même adresse » (0,95) reste une PROPOSITION', () => {
    expect(isAutoMergeable(0.95)).toBe(false)
    expect(isAutoMergeable(0.989)).toBe(false)
  })

  it('« fusionné automatiquement » s’ajoute EN FIN de la taxonomie (GA-08)', () => {
    expect(DUPLICATE_DECISIONS).toEqual(['pending', 'merged', 'dismissed', 'auto_merged'])
  })

  it('la fiche la plus ANCIENNE survit — l’autre la rejoint', () => {
    const older = { id: 'b', createdAt: '2026-01-01T00:00:00Z' }
    const newer = { id: 'a', createdAt: '2026-06-01T00:00:00Z' }
    expect(autoMergeSurvivor(newer, older)).toEqual({ keptId: 'b', absorbedId: 'a' })
    expect(autoMergeSurvivor(older, newer)).toEqual({ keptId: 'b', absorbedId: 'a' })
  })

  it('à date égale, l’identifiant tranche — le même choix à chaque passage', () => {
    const at = '2026-01-01T00:00:00Z'
    expect(autoMergeSurvivor({ id: 'z', createdAt: at }, { id: 'c', createdAt: at })).toEqual({
      keptId: 'c',
      absorbedId: 'z',
    })
  })
})
