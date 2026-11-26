import { describe, expect, it } from 'vitest'
import { CHATBOT_ANALYTICS_EVENTS } from './chatbot-funnel.js'
import {
  CHATBOT_EXPERIMENTS,
  CHATBOT_EXPERIMENT_MIN_EXPOSURES,
  assignChatbotVariant,
  chatbotExperiment,
  readChatbotExperiment,
} from './chatbot-experiments.js'

describe('le registre des expériences', () => {
  it('porte les deux A/B demandés par la checklist P1', () => {
    const ids = CHATBOT_EXPERIMENTS.map(experiment => experiment.id)
    expect(ids).toContain('first_message')
    expect(ids).toContain('open_timing')
  })

  it('déclare au moins deux variantes par expérience — sinon il n’y a rien à comparer', () => {
    for (const experiment of CHATBOT_EXPERIMENTS) {
      expect(experiment.variants.length, experiment.id).toBeGreaterThanOrEqual(2)
      expect(new Set(experiment.variants).size, `${experiment.id} : variante dupliquée`).toBe(
        experiment.variants.length,
      )
    }
  })

  it("n'appuie sa mesure que sur des événements qui existent", () => {
    const known = new Set<string>(CHATBOT_ANALYTICS_EVENTS)
    for (const experiment of CHATBOT_EXPERIMENTS) {
      for (const event of [...experiment.exposure, experiment.success]) {
        expect(known.has(event), `${experiment.id} lit ${event}`).toBe(true)
      }
    }
  })

  it('se retrouve par son identifiant', () => {
    expect(chatbotExperiment('open_timing')?.variants).toEqual(['at8s', 'at15s', 'onScroll'])
  })

  it('propose les trois moments du §11 pour l’ouverture : 8 s, 15 s, au défilement', () => {
    expect(chatbotExperiment('open_timing')?.variants).toHaveLength(3)
  })
})

describe("l'affectation d'un visiteur", () => {
  it('est STABLE : le même visiteur revoit la même variante', () => {
    const first = assignChatbotVariant('first_message', 'visiteur-abc')
    for (let i = 0; i < 50; i += 1) {
      expect(assignChatbotVariant('first_message', 'visiteur-abc')).toBe(first)
    }
  })

  it('est INDÉPENDANTE d’une expérience à l’autre — sinon les deux A/B se contaminent', () => {
    // On ne demande pas que ce soit différent pour un id donné (ce serait du
    // hasard) : on demande que sur un échantillon, les deux affectations ne
    // soient pas la même fonction.
    let differing = 0
    for (let i = 0; i < 500; i += 1) {
      const id = `v-${i}`
      const a = CHATBOT_EXPERIMENTS[0]!.variants.indexOf(assignChatbotVariant('first_message', id))
      const b = CHATBOT_EXPERIMENTS[1]!.variants.indexOf(assignChatbotVariant('open_timing', id))
      if (a !== b) differing += 1
    }
    expect(differing).toBeGreaterThan(100)
  })

  it('rend toujours une variante déclarée', () => {
    const experiment = chatbotExperiment('open_timing')!
    for (let i = 0; i < 200; i += 1) {
      expect(experiment.variants).toContain(assignChatbotVariant('open_timing', `id-${i}`))
    }
  })

  it('répartit à peu près également — une variante qui ne sort jamais ne se mesure jamais', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 6000; i += 1) {
      const variant = assignChatbotVariant('open_timing', `visitor-${i}-${i * 7}`)
      counts.set(variant, (counts.get(variant) ?? 0) + 1)
    }
    expect(counts.size).toBe(3)
    for (const [variant, count] of counts) {
      expect(count, variant).toBeGreaterThan(6000 / 3 - 400)
      expect(count, variant).toBeLessThan(6000 / 3 + 400)
    }
  })

  it('sans identifiant de visiteur, rend la variante de RÉFÉRENCE — jamais un tirage par appel', () => {
    const experiment = chatbotExperiment('first_message')!
    expect(assignChatbotVariant('first_message', '')).toBe(experiment.variants[0])
  })
})

describe("la lecture d'un A/B", () => {
  const enough = CHATBOT_EXPERIMENT_MIN_EXPOSURES

  it('ne dit rien quand la source de mesure ne répond pas', () => {
    const reading = readChatbotExperiment('first_message', {
      sourceAvailable: false,
      exposures: {},
      successes: {},
    })
    expect(reading.verdict).toBe('unmeasured')
    expect(reading.bestObserved).toBeNull()
    for (const variant of reading.variants) {
      expect(variant.exposures).toBeNull()
      expect(variant.rate).toBeNull()
      expect(variant.shortfall).toBeNull()
    }
  })

  it('dit « non concluant » sous le seuil, et NOMME ce qui manque', () => {
    const reading = readChatbotExperiment('first_message', {
      sourceAvailable: true,
      exposures: { warm: 40, concrete: 38 },
      successes: { warm: 20, concrete: 4 },
    })
    expect(reading.verdict).toBe('inconclusive')
    expect(reading.minExposures).toBe(enough)
    expect(reading.variants[0]?.shortfall).toBe(enough - 40)
    // Même avec un écart spectaculaire, on ne désigne personne.
    expect(reading.bestObserved).toBeNull()
  })

  it('lit les taux dès que CHAQUE variante a atteint le seuil', () => {
    const reading = readChatbotExperiment('first_message', {
      sourceAvailable: true,
      exposures: { warm: enough, concrete: enough * 2 },
      successes: { warm: enough * 0.1, concrete: enough * 2 * 0.2 },
    })
    expect(reading.verdict).toBe('readable')
    expect(reading.variants[0]?.rate).toBeCloseTo(0.1, 10)
    expect(reading.variants[1]?.rate).toBeCloseTo(0.2, 10)
    expect(reading.variants[0]?.shortfall).toBe(0)
    expect(reading.bestObserved).toBe('concrete')
  })

  it("ne désigne personne à égalité parfaite — « meilleur taux observé » n'est pas un tirage", () => {
    const reading = readChatbotExperiment('first_message', {
      sourceAvailable: true,
      exposures: { warm: enough, concrete: enough },
      successes: { warm: 30, concrete: 30 },
    })
    expect(reading.verdict).toBe('readable')
    expect(reading.bestObserved).toBeNull()
  })

  it('une variante à zéro exposition n’a pas un taux de 0 %, elle n’a pas de taux', () => {
    const reading = readChatbotExperiment('open_timing', {
      sourceAvailable: true,
      exposures: { at8s: enough, at15s: enough, onScroll: 0 },
      successes: { at8s: 10, at15s: 10, onScroll: 0 },
    })
    const onScroll = reading.variants.find(variant => variant.variant === 'onScroll')
    expect(onScroll?.exposures).toBe(0)
    expect(onScroll?.rate).toBeNull()
    expect(reading.verdict).toBe('inconclusive')
  })

  it('rend une variante déclarée mais jamais vue comme non mesurée, pas comme absente', () => {
    const reading = readChatbotExperiment('open_timing', {
      sourceAvailable: true,
      exposures: { at8s: 5 },
      successes: {},
    })
    expect(reading.variants).toHaveLength(3)
    expect(reading.variants.find(v => v.variant === 'at15s')?.exposures).toBe(0)
  })
})
