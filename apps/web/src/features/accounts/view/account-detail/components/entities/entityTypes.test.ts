import { describe, expect, it } from 'vitest'

import frAccountOrg from '@/i18n/locales/fr/accountOrg.json'
import enAccountOrg from '@/i18n/locales/en/accountOrg.json'

import { TYPE_STYLES, deriveScopeKind, normaliseTypeKey } from './entityTypes'

// Mesuré en recette le 14/09/2026 sur la PRODUCTION, section « Périmètres » :
// deux entités de `E B TRANS ASSISTANCE` dont le type moteur est `site`
// s'affichaient « Autre », alors que `accountOrg:entityType.site` existe et dit
// « Site ». Même mécanisme pour les deux entités `département` d'AIRBUS :
// `normaliseTypeKey` pliait la CASSE (`BU` → `bu`) mais pas les DIACRITIQUES,
// donc `département` ne retrouvait jamais `departement`. C'est la forme web du
// défaut déjà connu côté SQL (`ILIKE` est insensible à la casse, pas aux
// accents) : un libellé écrit, traduit, et jamais atteignable.
const FR_LABELS = frAccountOrg.entityType as Record<string, string>
const EN_LABELS = enAccountOrg.entityType as Record<string, string>

describe('normaliseTypeKey', () => {
  it('lit un corpus de libellés non vide', () => {
    // Une garde doit LIRE quelque chose : sans cette assertion, les deux tests
    // suivants resteraient verts sur un catalogue vidé par accident.
    expect(Object.keys(FR_LABELS).length).toBeGreaterThan(10)
    expect(Object.keys(EN_LABELS)).toEqual(Object.keys(FR_LABELS))
  })

  // Les libellés qui ne sont PAS des niveaux : ils nomment une VARIANTE d'un
  // niveau, atteinte par un drapeau et non par `normaliseTypeKey`. Chacun est
  // nommé ici avec l'endroit qui compose sa clé — sans cette liste, la garde
  // refuserait un libellé pourtant affiché ; avec une liste muette, elle
  // laisserait passer un libellé orphelin.
  const VARIANTES_ATTEINTES_PAR_DRAPEAU: Record<string, string> = {
    // #4327 — `unconfirmed && type === 'filiale'` dans
    // `tabs/organigramme/OrgNodeTypeBadge.tsx` (`${typeKey}.filialeUnconfirmed`)
    // et `components/EntitiesGraphCard.tsx` ('entityType.filialeUnconfirmed').
    filialeUnconfirmed: 'filiale non confirmée — drapeau `unconfirmed`, pas un niveau',
  }

  it('rend atteignable CHAQUE libellé de niveau écrit dans les deux langues', () => {
    const inatteignables = Object.keys(FR_LABELS).filter(
      key => key !== 'unknown' && !(key in VARIANTES_ATTEINTES_PAR_DRAPEAU) && normaliseTypeKey(key) !== key,
    )
    expect(inatteignables).toEqual([])
  })

  it('les variantes exemptées existent VRAIMENT dans les deux langues', () => {
    // Le témoin de l'exemption : si un de ces libellés disparaissait de l'i18n,
    // la liste ci-dessus mentirait en silence. La garde doit savoir dire NON.
    for (const key of Object.keys(VARIANTES_ATTEINTES_PAR_DRAPEAU)) {
      expect(FR_LABELS[key], `FR ${key}`).toBeTruthy()
      expect(EN_LABELS[key], `EN ${key}`).toBeTruthy()
    }
  })

  it('retrouve le niveau malgré la casse, les espaces et les accents', () => {
    expect(normaliseTypeKey('BU')).toBe('bu')
    expect(normaliseTypeKey('GIE')).toBe('gie')
    expect(normaliseTypeKey('département')).toBe('departement')
    expect(normaliseTypeKey('Département')).toBe('departement')
    expect(normaliseTypeKey('site')).toBe('site')
    expect(normaliseTypeKey('Siège régional')).toBe('siege_regional')
    expect(normaliseTypeKey('business unit')).toBe('bu')
    expect(normaliseTypeKey('business-unit')).toBe('bu')
  })

  it('traduit les synonymes anglais du moteur', () => {
    expect(normaliseTypeKey('holding')).toBe('groupe')
    expect(normaliseTypeKey('subsidiary')).toBe('filiale')
    expect(normaliseTypeKey('business_unit')).toBe('bu')
    expect(normaliseTypeKey('department')).toBe('departement')
  })

  it("n'attrape PAS ce qu'elle ne vise pas : un niveau vraiment inconnu reste inconnu", () => {
    // Le témoin de la troisième preuve : élargir la normalisation ne doit pas
    // transformer n'importe quelle chaîne en niveau nommé.
    expect(normaliseTypeKey('licorne')).toBe('unknown')
    expect(normaliseTypeKey('')).toBe('unknown')
    expect(normaliseTypeKey(null)).toBe('unknown')
    expect(normaliseTypeKey(undefined)).toBe('unknown')
  })

  it('donne un style à chaque niveau nommé', () => {
    for (const key of Object.keys(FR_LABELS)) {
      expect(TYPE_STYLES[normaliseTypeKey(key)]).toBeDefined()
    }
  })
})

describe('deriveScopeKind — #2966 (#2119.36-38)', () => {
  it('un site est une implantation, jamais un périmètre commercial', () => {
    expect(deriveScopeKind('site')).toBe('implantation')
  })

  it('un département ou une équipe sont l’échelon équipe', () => {
    expect(deriveScopeKind('departement')).toBe('equipe')
    expect(deriveScopeKind('equipe')).toBe('equipe')
    expect(deriveScopeKind('Département')).toBe('equipe')
  })

  it('tout le reste est un périmètre commercial', () => {
    for (const type of ['groupe', 'filiale', 'bu', 'direction', 'marque', 'filiale_strategique', 'programme']) {
      expect(deriveScopeKind(type)).toBe('commercial')
    }
  })

  it('un type inconnu ou absent reste un périmètre commercial, jamais une exception', () => {
    expect(deriveScopeKind(null)).toBe('commercial')
    expect(deriveScopeKind(undefined)).toBe('commercial')
    expect(deriveScopeKind('licorne')).toBe('commercial')
  })
})
