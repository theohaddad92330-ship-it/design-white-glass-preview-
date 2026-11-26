import { describe, expect, it } from 'vitest'
import { countOpenOpportunities, shouldRelaunchBrief } from './accountRelaunchBrief'

/**
 * Manque B du 30/08 — « relancer la prise de brief ».
 *
 * La condition, mot pour mot : un compte porte au moins DEUX opportunités
 * OUVERTES et AUCUNE mission signée. Les deux bords sont ceux que le lot
 * demande de tester explicitement : une seule opportunité ne suffit pas, et
 * une mission signée annule le geste même avec des opportunités en nombre.
 */
describe('countOpenOpportunities', () => {
  it('compte les opportunités OUVERTES de ce compte, dans les quatre étapes en jeu', () => {
    const count = countOpenOpportunities('acc-1', [
      { account_id: 'acc-1', stage: 'qualified' },
      { account_id: 'acc-1', stage: 'negotiation' },
      { account_id: 'acc-2', stage: 'confirmed' },
    ])
    expect(count).toBe(2)
  })

  it('exclut `detected`/`potential` — une preuve non regardée n’est pas une opportunité commerciale', () => {
    const count = countOpenOpportunities('acc-1', [
      { account_id: 'acc-1', stage: 'detected' },
      { account_id: 'acc-1', stage: 'potential' },
    ])
    expect(count).toBe(0)
  })

  it('exclut `won` — un projet gagné n’est plus « en discussion »', () => {
    const count = countOpenOpportunities('acc-1', [
      { account_id: 'acc-1', stage: 'won' },
      { account_id: 'acc-1', stage: 'qualified' },
    ])
    expect(count).toBe(1)
  })

  it('exclut `lost` et `dormant` — des sorties, pas des opportunités qui parlent', () => {
    const count = countOpenOpportunities('acc-1', [
      { account_id: 'acc-1', stage: 'lost' },
      { account_id: 'acc-1', stage: 'dormant' },
      { account_id: 'acc-1', stage: 'qualified' },
    ])
    expect(count).toBe(1)
  })
})

describe('shouldRelaunchBrief', () => {
  it('porte le geste : deux opportunités ouvertes, aucune mission', () => {
    expect(shouldRelaunchBrief({ hasSignedMission: false, openOpportunities: 2 })).toBe(true)
  })

  it('porte le geste au-delà de deux aussi', () => {
    expect(shouldRelaunchBrief({ hasSignedMission: false, openOpportunities: 5 })).toBe(true)
  })

  it('BORD — une seule opportunité ne porte PAS le geste', () => {
    expect(shouldRelaunchBrief({ hasSignedMission: false, openOpportunities: 1 })).toBe(false)
  })

  it('zéro opportunité ne porte pas le geste', () => {
    expect(shouldRelaunchBrief({ hasSignedMission: false, openOpportunities: 0 })).toBe(false)
  })

  it('BORD — une mission déjà signée annule le geste, même avec des opportunités en nombre', () => {
    expect(shouldRelaunchBrief({ hasSignedMission: true, openOpportunities: 2 })).toBe(false)
  })

  it('une mission signée ET peu d’opportunités : pas de geste (les deux raisons cumulent le refus)', () => {
    expect(shouldRelaunchBrief({ hasSignedMission: true, openOpportunities: 0 })).toBe(false)
  })
})
