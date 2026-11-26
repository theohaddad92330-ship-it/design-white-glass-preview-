import {
  assignChatbotVariant,
  buildChatbotPrefill,
  CHATBOT_EXPERIMENTS,
  CHATBOT_OBJECTION_THEMES,
  CHATBOT_PREFILL_FIELDS,
  CHATBOT_PREFILL_PARAM,
  encodeChatbotPrefill,
} from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { assignVariant, FIRST_MESSAGE_VARIANTS, OPEN_TIMING_VARIANTS } from './experiments'
import { OBJECTION_THEMES } from './objection-coverage'
import { buildPrefill, PREFILL_FIELDS, PREFILL_PARAM } from './prefill'

/**
 * La garde promise par trois commentaires (`experiments.ts`, `objection-coverage.ts`,
 * `prefill.ts`) — et qui n'existait pas avant cette relecture. Trois fichiers
 * affirmaient « `contracts-parity.test.ts` confronte les deux » sans qu'aucun
 * fichier de ce nom n'existe : exactement le défaut que le dépôt nomme « une
 * garde qui se déclare implémentée sans l'être ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * `@bellum/contracts` est une dépendance de DÉVELOPPEMENT du site (lue par les
 * tests, jamais embarquée) — les trois fichiers du site RECOPIENT donc le
 * contrat au lieu de l'importer à l'exécution. Cette garde confronte les deux
 * moitiés : mêmes listes, même paramètre, et — le seul endroit où une
 * divergence serait invisible et fausserait une mesure — le MÊME hachage pour
 * le MÊME visiteur.
 */

describe('parité expériences — site et contrat', () => {
  it('portent les mêmes variantes, dans le même ordre', () => {
    const firstMessage = CHATBOT_EXPERIMENTS.find(experiment => experiment.id === 'first_message')
    const openTiming = CHATBOT_EXPERIMENTS.find(experiment => experiment.id === 'open_timing')
    expect(firstMessage?.variants).toEqual([...FIRST_MESSAGE_VARIANTS])
    expect(openTiming?.variants).toEqual([...OPEN_TIMING_VARIANTS])
  })

  it('affectent le MÊME visiteur à la MÊME variante — le seul écart qui fausserait la mesure', () => {
    for (let i = 0; i < 200; i += 1) {
      const visitor = `visiteur-${i}`
      expect(assignVariant('open_timing', visitor)).toBe(assignChatbotVariant('open_timing', visitor))
      expect(assignVariant('first_message', visitor)).toBe(assignChatbotVariant('first_message', visitor))
    }
  })

  it('rendent la même référence sans identifiant', () => {
    expect(assignVariant('open_timing', '')).toBe(assignChatbotVariant('open_timing', ''))
    expect(assignVariant('first_message', '')).toBe(assignChatbotVariant('first_message', ''))
  })
})

describe('parité objections — site et contrat', () => {
  it('portent le même vocabulaire fermé, dans le même ordre', () => {
    expect(OBJECTION_THEMES).toEqual([...CHATBOT_OBJECTION_THEMES])
  })
})

describe('parité prefill — site et contrat', () => {
  it('portent la même liste blanche et le même paramètre', () => {
    expect(PREFILL_FIELDS).toEqual([...CHATBOT_PREFILL_FIELDS])
    expect(PREFILL_PARAM).toBe(CHATBOT_PREFILL_PARAM)
  })

  it('encodent la même chaîne de requête pour le même lead', () => {
    const lead = {
      companyType: 'esn',
      teamSize: '6-15',
      persona: 'manager',
      pain: 'texte libre qui ne doit jamais partir',
      firstName: 'Louis',
    }
    const site = buildPrefill(lead)
    const contract = buildChatbotPrefill(lead)
    expect(site.query).toBe(encodeChatbotPrefill(contract))
    expect(site.fields).toEqual(contract.fields)
    expect(site.withheld.sort()).toEqual(contract.withheld.sort())
  })

  it('retiennent le même texte libre — ni l’un ni l’autre ne le laisse passer', () => {
    const site = buildPrefill({ pain: 'on perd nos comptes' })
    const contract = buildChatbotPrefill({ pain: 'on perd nos comptes' })
    expect(site.fields).toEqual({})
    expect(contract.fields).toEqual({})
    expect(site.withheld).toEqual(contract.withheld)
  })
})
