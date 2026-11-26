import { describe, expect, it } from 'vitest'
import {
  CHATBOT_ANALYTICS_EVENTS,
  CHATBOT_FUNNEL_EVENTS,
  CHATBOT_FUNNEL_STEPS,
  buildChatbotFunnel,
  buildChatbotQuality,
  type ChatbotFunnelReading,
} from './chatbot-funnel.js'

/**
 * Le tunnel du §9 — et surtout la seule chose qu'il ne doit jamais faire :
 * écrire « 0 % » là où personne n'a mesuré.
 *
 * Les deux cas se ressemblent à l'écran et n'appellent pas le même geste. « 0 %
 * de conversations vont à la démo » veut dire que le chatbot ne convertit pas :
 * on change le message. « on ne sait pas » veut dire que la mesure est
 * débranchée : on répare la mesure. Un écran qui confond les deux fait travailler
 * l'équipe sur le mauvais problème pendant une semaine.
 */

function reading(rows: readonly ChatbotFunnelReading[], step: string): ChatbotFunnelReading {
  const found = rows.find(row => row.step === step)
  if (!found) throw new Error(`étape absente du tunnel : ${step}`)
  return found
}

describe('le corpus du tunnel', () => {
  it('nomme au moins les six étapes du §9, et chacune a une source déclarée', () => {
    expect(CHATBOT_FUNNEL_STEPS.length).toBeGreaterThanOrEqual(6)
    for (const step of CHATBOT_FUNNEL_STEPS) {
      expect(CHATBOT_FUNNEL_EVENTS[step]).toBeDefined()
    }
  })

  it("n'invente aucun événement : toute source déclarée existe dans l'énumération", () => {
    const known = new Set<string>(CHATBOT_ANALYTICS_EVENTS)
    for (const step of CHATBOT_FUNNEL_STEPS) {
      for (const event of CHATBOT_FUNNEL_EVENTS[step]) {
        expect(known.has(event), `${step} lit ${event}, qui n'est pas un événement connu`).toBe(true)
      }
    }
  })

  it("l'énumération des événements n'est pas vide — une garde qui ne lit rien ne garde rien", () => {
    expect(CHATBOT_ANALYTICS_EVENTS.length).toBeGreaterThanOrEqual(14)
  })
})

describe('quand la source de mesure ne répond pas', () => {
  const rows = buildChatbotFunnel({ counts: {}, sourceAvailable: false })

  it('ne compte AUCUN zéro : tout est inconnu', () => {
    for (const row of rows) {
      expect(row.count, `${row.step} devrait être inconnu`).toBeNull()
      expect(row.rateFromPrevious).toBeNull()
      expect(row.rateFromEntry).toBeNull()
      expect(row.unmeasured).not.toBeNull()
    }
  })

  it("dit POURQUOI c'est inconnu, et distingue la panne de l'inobservable", () => {
    expect(reading(rows, 'exposed').unmeasured).toBe('source_unavailable')
    expect(reading(rows, 'held').unmeasured).toBe('not_observable')
  })
})

describe('quand la source répond', () => {
  const rows = buildChatbotFunnel({
    counts: {
      chat_widget_viewed: 1000,
      chat_opened: 120,
      chat_auto_opened: 80,
      chat_first_reply: 150,
      demo_clicked: 30,
      calendly_clicked: 12,
    },
    sourceAvailable: true,
  })

  it("additionne les deux façons d'ouvrir — un levier et son résultat comptent tous les deux", () => {
    expect(reading(rows, 'opened').count).toBe(200)
  })

  it('calcule le taux par rapport à létape précédente ET par rapport à lentrée', () => {
    const demo = reading(rows, 'demo')
    expect(demo.count).toBe(30)
    expect(demo.rateFromPrevious).toBeCloseTo(30 / 150, 10)
    expect(demo.rateFromEntry).toBeCloseTo(30 / 1000, 10)
    expect(demo.unmeasured).toBeNull()
  })

  it("laisse « RDV tenu » inconnu : rien sur le site ne l'observe", () => {
    const held = reading(rows, 'held')
    expect(held.count).toBeNull()
    expect(held.unmeasured).toBe('not_observable')
    expect(held.rateFromPrevious).toBeNull()
  })

  it("l'étape d'entrée n'a pas de taux « par rapport à la précédente »", () => {
    expect(reading(rows, 'exposed').rateFromPrevious).toBeNull()
    expect(reading(rows, 'exposed').rateFromEntry).toBe(1)
  })
})

describe('un zéro MESURÉ est un vrai zéro, et il ne se propage pas en taux', () => {
  const rows = buildChatbotFunnel({
    counts: { chat_widget_viewed: 400, chat_opened: 0, chat_first_reply: 0, demo_clicked: 0 },
    sourceAvailable: true,
  })

  it('affiche bien 0 pour létape mesurée à zéro', () => {
    expect(reading(rows, 'opened').count).toBe(0)
    expect(reading(rows, 'opened').rateFromPrevious).toBe(0)
  })

  it("mais rend `null` — jamais 0 % — pour l'étape dont le DÉNOMINATEUR est nul", () => {
    const engaged = reading(rows, 'engaged')
    expect(engaged.count).toBe(0)
    // 0 conversation sur 0 ouverture n'est pas « 0 % » : c'est indéfini.
    expect(engaged.rateFromPrevious).toBeNull()
  })
})

describe('aucune exposition mesurée', () => {
  it('ne rend aucun taux par rapport à lentrée', () => {
    const rows = buildChatbotFunnel({ counts: { chat_widget_viewed: 0, chat_opened: 3 }, sourceAvailable: true })
    expect(reading(rows, 'exposed').count).toBe(0)
    expect(reading(rows, 'exposed').rateFromEntry).toBeNull()
    expect(reading(rows, 'opened').rateFromEntry).toBeNull()
  })
})

describe('les indicateurs de qualité du §9', () => {
  it('rend tout à null quand la source ne répond pas', () => {
    const quality = buildChatbotQuality({ counts: {}, sourceAvailable: false })
    expect(quality.conversations).toBeNull()
    expect(quality.handoffRate).toBeNull()
    expect(quality.refusalRate).toBeNull()
    expect(quality.abandonRate).toBeNull()
  })

  it('rapporte les taux au nombre de conversations, pas au nombre de vues', () => {
    const quality = buildChatbotQuality({
      counts: { chat_widget_viewed: 900, chat_first_reply: 100, human_handoff: 8, chat_refusal: 3, chat_abandoned: 40 },
      sourceAvailable: true,
    })
    expect(quality.conversations).toBe(100)
    expect(quality.handoffRate).toBeCloseTo(0.08, 10)
    expect(quality.refusalRate).toBeCloseTo(0.03, 10)
    expect(quality.abandonRate).toBeCloseTo(0.4, 10)
  })

  it('sans conversation, un taux ne vaut pas 0 % — il ne vaut rien', () => {
    const quality = buildChatbotQuality({ counts: { chat_widget_viewed: 900 }, sourceAvailable: true })
    expect(quality.conversations).toBe(0)
    expect(quality.handoffRate).toBeNull()
    expect(quality.refusalRate).toBeNull()
    expect(quality.abandonRate).toBeNull()
  })
})
