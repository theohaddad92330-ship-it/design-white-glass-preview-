import { describe, expect, it } from 'vitest'
import { DATA_CLASSIFICATION_LEVELS, PORTABLE_OBJECTS } from '@bellum/contracts'
import {
  categoryOfPayloadKey,
  classificationOfPayloadKey,
  groupByCategory,
  groupByPerimeter,
  perimeterOfPayloadKey,
  provenanceKeyOfPayloadKey,
  purposeKeyOfPayloadKey,
  retentionKeyOfPayloadKey,
} from './export-perimeter'

/**
 * #1520 — « tous les objets sont mélangés alors qu'ils n'ont pas le même
 * propriétaire ».
 *
 * ⚠️ CE QUE CES TESTS ONT MANQUÉ LA PREMIÈRE FOIS.
 * La version précédente dérivait le périmètre de `TABLE_SCOPES` et testait la
 * RÈGLE (« toutes les tables portées par l'utilisateur ⇒ personnel ») sur des
 * tables choisies dans ce registre. La règle était juste ; le corpus, non —
 * aucune table EXPORTABLE n'y figure. Les tests passaient, et l'écran affichait
 * un seul groupe.
 *
 * Le test qui manquait est le dernier : **les deux groupes existent
 * réellement**. Il est le seul à distinguer « rangé » de « rangé dans un seul
 * tas ».
 */
describe('perimeterOfPayloadKey — déclaré, pas deviné', () => {
  it('rend le périmètre que le catalogue DÉCLARE', () => {
    for (const object of PORTABLE_OBJECTS) {
      expect(perimeterOfPayloadKey(object.payloadKey)).toBe(object.perimeter)
    }
    expect(PORTABLE_OBJECTS.length).toBeGreaterThan(0)
  })

  it('une clé inconnue tombe du côté prudent', () => {
    // Sur un écran qui promet « tes données t'appartiennent », annoncer
    // « personnel » à tort est la seule erreur qui trompe vraiment quelqu'un.
    expect(perimeterOfPayloadKey('cle_inventee')).toBe('workspace')
  })
})

describe('groupByPerimeter — deux groupes, et aucun objet perdu', () => {
  it('LES DEUX groupes existent vraiment sur le catalogue réel', () => {
    // ⚠️ LE test qui manquait. Sans lui, « rangé par propriétaire » peut vouloir
    // dire « un seul intertitre au-dessus de tout », ce qui était le cas.
    const grouped = groupByPerimeter(PORTABLE_OBJECTS.map(object => ({ payloadKey: object.payloadKey })))

    expect(grouped.map(group => group.perimeter)).toEqual(['personal', 'workspace'])
    expect(grouped[0]?.objects.length).toBeGreaterThan(0)
    expect(grouped[1]?.objects.length).toBeGreaterThan(0)
  })

  it('conserve TOUS les objets, et n’en invente aucun', () => {
    const objects = PORTABLE_OBJECTS.map(object => ({ payloadKey: object.payloadKey }))
    const total = groupByPerimeter(objects).reduce((sum, group) => sum + group.objects.length, 0)

    expect(objects.length).toBeGreaterThan(0)
    expect(total).toBe(objects.length)
  })

  it('ne rend pas de groupe vide — un intertitre seul se lit comme une panne', () => {
    const grouped = groupByPerimeter([{ payloadKey: 'cle_inventee' }])
    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.perimeter).toBe('workspace')
  })
})

/**
 * #2439.7/.8/.17 — la première des cinq catégories manquantes du NO-GO,
 * dérivée du catalogue réel, jamais devinée.
 */
describe('categoryOfPayloadKey / groupByCategory — technique et fichiers, séparés du périmètre', () => {
  it("sépare l'objet classé `technique` (sessions) dans sa propre catégorie", () => {
    const technicalObjects = PORTABLE_OBJECTS.filter(object => object.classification === 'technique')
    expect(technicalObjects.length).toBeGreaterThan(0)
    for (const object of technicalObjects) {
      expect(categoryOfPayloadKey(object.payloadKey)).toBe('technical')
    }
  })

  it("sépare l'objet `ragDocuments` dans sa propre catégorie « fichiers » (#2893)", () => {
    expect(categoryOfPayloadKey('ragDocuments')).toBe('files')
  })

  it('ne change RIEN pour les autres objets — la catégorie reste leur périmètre déclaré', () => {
    for (const object of PORTABLE_OBJECTS) {
      if (object.classification === 'technique' || object.payloadKey === 'ragDocuments') continue
      expect(categoryOfPayloadKey(object.payloadKey)).toBe(object.perimeter)
    }
  })

  it('groupByCategory range en quatre groupes sur le catalogue réel, sans perdre un objet', () => {
    const objects = PORTABLE_OBJECTS.map(object => ({ payloadKey: object.payloadKey }))
    const grouped = groupByCategory(objects)

    expect(grouped.map(group => group.category)).toEqual(['personal', 'workspace', 'files', 'technical'])
    const total = grouped.reduce((sum, group) => sum + group.objects.length, 0)
    expect(total).toBe(objects.length)
  })

  it("ne rend pas la catégorie technique ou fichiers quand aucun objet n'en relève", () => {
    const grouped = groupByCategory([{ payloadKey: 'profile' }])
    expect(grouped.map(group => group.category)).toEqual(['personal'])
  })
})

/**
 * #2439.2 — chaque objet exportable affiche aussi son niveau de sensibilité,
 * retrouvé sur le même catalogue que le périmètre, jamais deviné.
 */
describe('classificationOfPayloadKey — déclaré, pas deviné', () => {
  it('rend le niveau que le catalogue DÉCLARE', () => {
    for (const object of PORTABLE_OBJECTS) {
      expect(classificationOfPayloadKey(object.payloadKey)).toBe(object.classification)
    }
    expect(PORTABLE_OBJECTS.length).toBeGreaterThan(0)
  })

  it('une clé inconnue tombe du côté prudent : traitée comme confidentielle', () => {
    expect(classificationOfPayloadKey('cle_inventee')).toBe('confidentiel')
  })

  it('ne rend jamais autre chose que les six niveaux déclarés', () => {
    for (const object of PORTABLE_OBJECTS) {
      expect(DATA_CLASSIFICATION_LEVELS).toContain(classificationOfPayloadKey(object.payloadKey))
    }
  })
})

/**
 * #2439.1 / #2439.3 — finalité, rétention et provenance, retrouvées sur le
 * même catalogue déclaré que le périmètre et la classification.
 */
describe('purposeKeyOfPayloadKey / retentionKeyOfPayloadKey / provenanceKeyOfPayloadKey — déclarées, pas devinées', () => {
  it('rendent la clé que le catalogue DÉCLARE pour chaque objet', () => {
    for (const object of PORTABLE_OBJECTS) {
      expect(purposeKeyOfPayloadKey(object.payloadKey)).toBe(object.purposeKey)
      expect(retentionKeyOfPayloadKey(object.payloadKey)).toBe(object.retentionKey)
      expect(provenanceKeyOfPayloadKey(object.payloadKey)).toBe(object.provenanceKey)
    }
  })

  it('une clé inconnue rend `null` — jamais une clé i18n inventée', () => {
    expect(purposeKeyOfPayloadKey('cle_inventee')).toBeNull()
    expect(retentionKeyOfPayloadKey('cle_inventee')).toBeNull()
    expect(provenanceKeyOfPayloadKey('cle_inventee')).toBeNull()
  })
})
