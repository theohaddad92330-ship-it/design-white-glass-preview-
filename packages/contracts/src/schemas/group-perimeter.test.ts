import { describe, expect, it } from 'vitest'
import { analysisScopeSelectionSchema } from './analysis.js'
import {
  GROUP_PERIMETER_MAX_ENTITIES,
  contactSearchEntities,
  groupPerimeterSchema,
  toggleContactEntity,
  type GroupPerimeter,
} from './group-perimeter.js'

const perimeter: GroupPerimeter = {
  rootSiren: '306138900',
  headSiren: '306138900',
  truncated: false,
  entities: [
    {
      siren: '306138900',
      name: 'DECATHLON SE',
      role: 'groupe',
      headcountLabel: null,
      city: 'Villeneuve-d’Ascq',
      region: 'Hauts-de-France',
      isActive: true,
    },
    {
      siren: '500569405',
      name: 'DECATHLON FRANCE',
      role: 'filiale',
      headcountLabel: '10 000 salariés et plus',
      city: 'Villeneuve-d’Ascq',
      region: 'Hauts-de-France',
      isActive: true,
    },
  ],
}

/**
 * Lot 757 — CONTACTS 3/6. Arbitrage Louis 31/10 : taper « Decathlon » ouvre un sélecteur groupe + filiales,
 * le commercial coche, les contacts sont cherchés sur le groupe ET les filiales cochées.
 */
describe('périmètre groupe → collecte de contacts', () => {
  it('accepte un périmètre lu au registre, avec une absence qui reste null (jamais « 0 »)', () => {
    expect(groupPerimeterSchema.parse(perimeter).entities).toHaveLength(2)
  })

  it('refuse un SIREN qui n’a pas neuf chiffres — on ne devine pas une entité', () => {
    const broken = { ...perimeter, entities: [{ ...perimeter.entities[0], siren: 'DECATHLON' }] }
    expect(groupPerimeterSchema.safeParse(broken).success).toBe(false)
  })

  it('plafonne à 16 entités (décision du 10/10 : seuil 16 filiales)', () => {
    expect(GROUP_PERIMETER_MAX_ENTITIES).toBe(16)
    const many = Array.from({ length: 17 }, (_, i) => ({ siren: String(100000000 + i), name: `F${i}` }))
    expect(analysisScopeSelectionSchema.safeParse({ contact_entities: many }).success).toBe(false)
    expect(analysisScopeSelectionSchema.safeParse({ contact_entities: many.slice(0, 16) }).success).toBe(true)
  })

  it('cherche toujours sur l’entité analysée, PUIS sur les entités cochées, sans doublon', () => {
    const selection = {
      contact_entities: [
        { siren: '500569405', name: 'DECATHLON FRANCE' },
        { siren: '306138900', name: 'DECATHLON SE' },
        { siren: '500569405', name: 'DECATHLON FRANCE' },
      ],
    }
    expect(contactSearchEntities(selection, { siren: '306138900', name: 'DECATHLON SE' })).toEqual([
      { siren: '306138900', name: 'DECATHLON SE' },
      { siren: '500569405', name: 'DECATHLON FRANCE' },
    ])
  })

  it('sans case cochée, la collecte est celle d’avant : la seule entité analysée', () => {
    expect(contactSearchEntities({}, { siren: '306138900', name: 'DECATHLON SE' })).toEqual([
      { siren: '306138900', name: 'DECATHLON SE' },
    ])
    expect(contactSearchEntities(undefined, null)).toEqual([])
  })

  it('cocher puis décocher rend la sélection d’avant (et vide ⇒ clé retirée)', () => {
    const entity = perimeter.entities[1]!
    const on = toggleContactEntity({}, entity)
    expect(on.contact_entities).toEqual([{ siren: '500569405', name: 'DECATHLON FRANCE' }])
    const off = toggleContactEntity(on, entity)
    expect(off).not.toHaveProperty('contact_entities')
  })
})
