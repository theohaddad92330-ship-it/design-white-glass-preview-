import { describe, expect, it } from 'vitest'
import {
  PRIORITY_SECTORS_NUDGE_THRESHOLD,
  SECTEURS_NIVEAUX_ANSWER_FIELDS,
  SECTOR_ENGAGEMENT_LEVELS,
  prioritySectorCount,
  sectorEngagementLevels,
} from './answers-secteurs-niveaux.js'

const BANQUE = 'Banque de détail & Banque privée'
const AERO = 'Aéronautique & Défense'
const SANTE = 'Santé & Medtech'
const PUBLIC = 'Secteur public & Collectivités'
const LUXE = 'Luxe & Cosmétiques'

describe('#2041.1 — cinq niveaux par secteur', () => {
  it('en porte CINQ, nommés, sans doublon — un sixième s’ajoute EN FIN (GA-08)', () => {
    expect(SECTOR_ENGAGEMENT_LEVELS).toHaveLength(5)
    expect(new Set(SECTOR_ENGAGEMENT_LEVELS).size).toBe(5)
    expect([...SECTOR_ENGAGEMENT_LEVELS]).toEqual(['priority', 'reference', 'target', 'dormant', 'no_go'])
  })

  it('n’ajoute QU’UNE clé de réponse — `target_sectors` n’est pas touché (ajout seulement)', () => {
    expect(Object.keys(SECTEURS_NIVEAUX_ANSWER_FIELDS)).toEqual(['priority_sectors'])
  })

  it('classe chaque secteur dans EXACTEMENT un niveau', () => {
    const levels = sectorEngagementLevels({
      target_sectors: [BANQUE, AERO, SANTE],
      reference_sectors: [AERO, LUXE],
      priority_sectors: [BANQUE],
      no_go_sectors: [PUBLIC],
    })
    expect(levels).toEqual([
      { sector: BANQUE, level: 'priority' },
      { sector: AERO, level: 'reference' },
      { sector: SANTE, level: 'target' },
      { sector: LUXE, level: 'dormant' },
      { sector: PUBLIC, level: 'no_go' },
    ])
    // Un secteur, un niveau : la garde qui refuse qu'un secteur apparaisse deux
    // fois — c'est le défaut exact que « vingt cases prioritaires » produisait.
    const sectors = levels.map(entry => entry.sector)
    expect(new Set(sectors).size).toBe(sectors.length)
  })

  it('un refus explicite gagne sur tout le reste — c’est une décision, pas une gradation', () => {
    const levels = sectorEngagementLevels({
      target_sectors: [BANQUE],
      reference_sectors: [BANQUE],
      priority_sectors: [BANQUE],
      no_go_sectors: [BANQUE],
    })
    expect(levels).toEqual([{ sector: BANQUE, level: 'no_go' }])
  })

  it('« prouvé mais plus visé » est un niveau à part — il ne se confond pas avec « visé »', () => {
    // `dormant` : une référence RÉELLE sur un secteur que l'ESN ne vise plus.
    // La ranger dans `reference` ferait compter une preuve comme une cible.
    expect(sectorEngagementLevels({ target_sectors: [], reference_sectors: [LUXE] })).toEqual([
      { sector: LUXE, level: 'dormant' },
    ])
  })

  it('ne classe RIEN quand rien n’a été répondu — non mesuré n’est pas « aucun secteur »', () => {
    expect(sectorEngagementLevels({})).toEqual([])
    expect(sectorEngagementLevels({ target_sectors: [], priority_sectors: [] })).toEqual([])
  })
})

describe('#2041.1 — la relance au-delà du seuil', () => {
  it('pose le seuil à UN seul endroit, et il vaut deux', () => {
    expect(PRIORITY_SECTORS_NUDGE_THRESHOLD).toBe(2)
  })

  it('compte les secteurs RÉELLEMENT prioritaires, jamais les secteurs visés', () => {
    // La distinction est tout le point : vingt secteurs visés ne font pas vingt
    // priorités, et c'est ce que le questionnaire d'avant ne savait pas dire.
    expect(prioritySectorCount({ target_sectors: [BANQUE, AERO, SANTE, LUXE] })).toBe(0)
    expect(prioritySectorCount({ priority_sectors: [BANQUE, AERO, SANTE] })).toBe(3)
  })

  it('ne compte pas deux fois le même secteur coché deux fois', () => {
    expect(prioritySectorCount({ priority_sectors: [BANQUE, BANQUE] })).toBe(1)
  })

  it('ne compte PAS un secteur prioritaire que l’ESN a aussi refusé', () => {
    // Sinon la relance s'appuierait sur un secteur que le classement range
    // lui-même en `no_go` : deux vérités sur la même ligne.
    expect(prioritySectorCount({ priority_sectors: [BANQUE, AERO], no_go_sectors: [AERO] })).toBe(1)
  })
})
