import { describe, expect, it } from 'vitest'
import * as module from './chatbot-objections.js'
import {
  CHATBOT_OBJECTION_THEMES,
  OBJECTION_PROPOSAL_MIN_OCCURRENCES,
  proposeObjectionEntries,
} from './chatbot-objections.js'

describe('le vocabulaire des objections', () => {
  it("n'est pas vide, et n'a pas de doublon", () => {
    expect(CHATBOT_OBJECTION_THEMES.length).toBeGreaterThanOrEqual(8)
    expect(new Set(CHATBOT_OBJECTION_THEMES).size).toBe(CHATBOT_OBJECTION_THEMES.length)
  })

  it('garde un fourre-tout NOMMÉ plutôt que de ranger de force', () => {
    expect(CHATBOT_OBJECTION_THEMES).toContain('other')
  })
})

describe("la proposition d'enrichissement", () => {
  it('ne propose que ce que la bibliothèque ne couvre PAS', () => {
    const proposals = proposeObjectionEntries({
      gaps: [
        { theme: 'price', occurrences: 40 },
        { theme: 'sovereignty', occurrences: 30 },
      ],
      covered: ['price'],
    })
    expect(proposals.map(proposal => proposal.theme)).toEqual(['sovereignty'])
  })

  it('attend un seuil : une objection entendue une fois est une anecdote', () => {
    const proposals = proposeObjectionEntries({
      gaps: [{ theme: 'sovereignty', occurrences: OBJECTION_PROPOSAL_MIN_OCCURRENCES - 1 }],
      covered: [],
    })
    expect(proposals).toEqual([])
  })

  it('classe par fréquence décroissante — le §9 demande un « top »', () => {
    const proposals = proposeObjectionEntries({
      gaps: [
        { theme: 'sovereignty', occurrences: 12 },
        { theme: 'support', occurrences: 30 },
        { theme: 'other', occurrences: 20 },
      ],
      covered: [],
    })
    expect(proposals.map(proposal => proposal.theme)).toEqual(['support', 'other', 'sovereignty'])
  })

  it('ignore un thème NON MESURÉ au lieu de le compter zéro', () => {
    const proposals = proposeObjectionEntries({
      gaps: [{ theme: 'sovereignty', occurrences: null }],
      covered: [],
    })
    expect(proposals).toEqual([])
  })

  it('sort tout au statut « proposé » — rien n’arrive accepté', () => {
    const proposals = proposeObjectionEntries({
      gaps: [{ theme: 'support', occurrences: 99 }],
      covered: [],
    })
    expect(proposals).toHaveLength(1)
    expect(proposals[0]?.status).toBe('proposed')
  })

  it('borne la liste pour que « top 20 » veuille dire quelque chose', () => {
    const gaps = CHATBOT_OBJECTION_THEMES.map((theme, index) => ({ theme, occurrences: 100 - index }))
    expect(proposeObjectionEntries({ gaps, covered: [], limit: 3 })).toHaveLength(3)
  })
})

describe("ce que le module NE fait pas — et c'est le point du chantier", () => {
  it("n'expose AUCUN chemin d'écriture vers la bibliothèque", () => {
    // On propose une entrée, on ne l'ajoute jamais : c'est la même règle que
    // « on propose une fusion de doublons, on ne fusionne jamais ». La garantie
    // n'est pas une convention, c'est l'absence de code — et ce test la lit.
    const forbidden = /^(apply|add|append|write|commit|merge|install|patch|mutate|save|accept)/i
    const offenders = Object.keys(module).filter(name => forbidden.test(name))
    expect(offenders).toEqual([])
  })

  it('lit bien quelque chose — une garde qui balaie un module vide ne garde rien', () => {
    expect(Object.keys(module).length).toBeGreaterThan(2)
  })
})
