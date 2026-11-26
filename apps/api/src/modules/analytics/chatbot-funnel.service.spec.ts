import { ChatbotFunnelService } from './chatbot-funnel.service'
import type { PlausibleChatbotClient } from './plausible-chatbot.client'

function stubClient(overrides: Partial<PlausibleChatbotClient> = {}): PlausibleChatbotClient {
  return {
    isEnabled: () => true,
    eventMeasurement: async () => ({ sourceAvailable: false, events: {}, visitors: {} }),
    siteVisitors: async () => null,
    experimentInput: async () => ({ sourceAvailable: false, exposures: {}, successes: {} }),
    ...overrides,
  } as unknown as PlausibleChatbotClient
}

/** Un client qui répond, avec des chiffres au-dessus du seuil d'agrégation. */
function measuringClient(): PlausibleChatbotClient {
  return stubClient({
    isEnabled: () => true,
    eventMeasurement: async () => ({
      sourceAvailable: true,
      events: {
        chat_widget_viewed: 1000,
        chat_opened: 120,
        chat_auto_opened: 80,
        chat_first_reply: 150,
        demo_clicked: 30,
        calendly_clicked: 12,
      },
      visitors: {
        chat_widget_viewed: 900,
        chat_opened: 110,
        chat_auto_opened: 70,
        chat_first_reply: 140,
        demo_clicked: 28,
        calendly_clicked: 11,
      },
    }),
    siteVisitors: async () => 4000,
    experimentInput: async (id: string) =>
      id === 'open_timing'
        ? {
            sourceAvailable: true as const,
            exposures: { at8s: 250, at15s: 260, onScroll: 240 } as Record<string, number>,
            successes: { at8s: 40, at15s: 55, onScroll: 35 } as Record<string, number>,
          }
        : {
            sourceAvailable: true as const,
            exposures: { warm: 300, concrete: 310 } as Record<string, number>,
            successes: { warm: 45, concrete: 60 } as Record<string, number>,
          },
  })
}

describe('ChatbotFunnelService', () => {
  it('configured:false quand Plausible n’est pas configuré, et le tunnel est entièrement non mesuré', async () => {
    const service = new ChatbotFunnelService(stubClient({ isEnabled: () => false }))
    const overview = await service.overview('30d')

    expect(overview.configured).toBe(false)
    expect(overview.period).toBe('30d')
    for (const step of overview.funnel) {
      expect(step.count).toBeNull()
      expect(step.unmeasured).not.toBeNull()
    }
    for (const stage of overview.stages) {
      expect(stage.measured).toBe(false)
    }
    expect(overview.quality.conversations).toBeNull()
    for (const experiment of overview.experiments) {
      expect(experiment.verdict).toBe('unmeasured')
    }
  })

  it('construit le tunnel, la qualité et les deux expériences à partir de ce que Plausible rend', async () => {
    const overview = await new ChatbotFunnelService(measuringClient()).overview()

    const demo = overview.funnel.find(step => step.step === 'demo')
    expect(demo?.count).toBe(30)
    expect(demo?.unmeasured).toBeNull()

    const held = overview.funnel.find(step => step.step === 'held')
    expect(held?.count).toBeNull()
    expect(held?.unmeasured).toBe('not_observable')

    expect(overview.quality.conversations).toBe(150)

    const openTiming = overview.experiments.find(experiment => experiment.id === 'open_timing')
    expect(openTiming?.verdict).toBe('readable')
    expect(openTiming?.bestObserved).toBe('at15s')

    const firstMessage = overview.experiments.find(experiment => experiment.id === 'first_message')
    expect(firstMessage?.verdict).toBe('readable')
    expect(firstMessage?.bestObserved).toBe('concrete')
  })

  it('rend les cinq étapes de #1659, l’entrée étant les VISITEURS du site', async () => {
    const overview = await new ChatbotFunnelService(measuringClient()).overview()

    expect(overview.stages.map(stage => stage.stage)).toEqual([
      'visitors',
      'widget_opened',
      'conversation',
      'qualified',
      'booked',
    ])
    const entry = overview.stages[0]
    expect(entry?.measured && entry.count).toBe(4000)
    // ⚠️ 4 000 et non 1 000 : `chat_widget_viewed` est le widget VU, pas le
    // visiteur. Confondre les deux ferait démarrer le tunnel après la première
    // déperdition.
    expect(entry?.measured && entry.count).not.toBe(1000)
  })

  it('la médiane du score est NOMMÉE non instrumentée, jamais rendue à zéro', async () => {
    const overview = await new ChatbotFunnelService(measuringClient()).overview()
    expect(overview.medianScore).toEqual({ kind: 'not_instrumented' })
  })

  it('interroge les quatre sources en parallèle avec la même période', async () => {
    const calls: string[] = []
    const client = stubClient({
      eventMeasurement: async period => {
        calls.push(`event:${period}`)
        return { sourceAvailable: true, events: {}, visitors: {} }
      },
      siteVisitors: async period => {
        calls.push(`visitors:${period}`)
        return null
      },
      experimentInput: async (id, period) => {
        calls.push(`${id}:${period}`)
        return { sourceAvailable: true, exposures: {}, successes: {} }
      },
    })
    await new ChatbotFunnelService(client).overview('7d')
    expect(calls.sort()).toEqual(['event:7d', 'first_message:7d', 'open_timing:7d', 'visitors:7d'])
  })
})

/**
 * #1659 — « Aucune donnée nominative. Le funnel est agrégé, toujours. »
 *
 * ⚠️ CE BALAYAGE PORTE SUR LA RÉPONSE ENTIÈRE, pas sur les champs qu'on a
 * pensé à regarder. C'est la seule forme qui tienne : une charge utile qui
 * gagnerait demain un champ `visitorEmail` ou `lastLeadName` passerait devant
 * n'importe quelle liste d'assertions écrite à la main. On sérialise tout et on
 * cherche ce qui ne doit pas y être — clés ET valeurs.
 *
 * Il ne prouve pas l'absence de données personnelles en PRODUCTION : il prouve
 * qu'aucune n'a de chemin pour y arriver, sur des mesures qui en contiennent
 * délibérément. C'est dit plutôt que sous-entendu.
 */
describe('le tunnel de Laura ne porte AUCUNE donnée nominative (#1659)', () => {
  /** Une mesure DÉLIBÉRÉMENT polluée : si un nom peut passer, il passera ici. */
  function pollutedClient(): PlausibleChatbotClient {
    return stubClient({
      isEnabled: () => true,
      eventMeasurement: async () => ({
        sourceAvailable: true,
        events: { chat_first_reply: 12, 'sarah.martin@client-esn.fr': 3, 'Sarah Martin': 2 },
        visitors: { chat_first_reply: 11, 'sarah.martin@client-esn.fr': 3, 'Sarah Martin': 2 },
      }),
      siteVisitors: async () => 4000,
      experimentInput: async () => ({
        sourceAvailable: true,
        exposures: { 'sarah.martin@client-esn.fr': 4 },
        successes: { 'sarah.martin@client-esn.fr': 1 },
      }),
    })
  }

  /** Une adresse e-mail, au sens le plus large qui ne produise pas de faux positif. */
  const UNE_ADRESSE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

  /** Les fragments qui, dans un nom de champ, annoncent une PERSONNE. */
  const FRAGMENTS_NOMINATIFS = [
    'email',
    'mail',
    'nom',
    'prenom',
    'firstname',
    'lastname',
    'fullname',
    'phone',
    'telephone',
    'user',
    'visitor',
    'session',
    'adresse',
    'address',
  ]

  /**
   * ⚠️ TROISIÈME PREUVE D'UNE GARDE : elle ne doit pas attraper ce qu'elle ne
   * vise pas. Ces clés PORTENT un fragment nominatif et comptent pourtant des
   * AGRÉGATS — c'est exactement l'unité d'analyse que la doctrine demande.
   * Chacune est nommée avec sa raison ; une exception sans raison se recopie.
   *
   * ⚠️ La première version de ce balayage cherchait le fragment n'importe où
   * dans le JSON, clés ET valeurs confondues : elle s'attrapait sur
   * `"stage":"visitors"` — l'identifiant de l'étape d'entrée, un mot du produit,
   * pas quelqu'un. Elle disait donc NON à ce qu'elle est censée protéger. Le
   * balayage ne lit plus que les CLÉS ; les valeurs restent couvertes par
   * {@link UNE_ADRESSE}, qui vise une forme et non un mot.
   */
  const AGREGATS_QUI_SONNENT_NOMINATIFS = new Map<string, string>([
    ['sessions', 'le NOMBRE de sessions distinctes derrière une étape — le dénominateur du seuil'],
    ['minSessions', 'le SEUIL d’agrégation minimale, une constante du contrat partagé'],
  ])

  /** Les clés du JSON qui annoncent une personne, exceptions retirées. */
  function clesNominatives(serialise: string): string[] {
    return [...serialise.matchAll(/"([^"]+)"\s*:/g)]
      .map(trouve => trouve[1] ?? '')
      .filter(cle => FRAGMENTS_NOMINATIFS.some(fragment => cle.toLowerCase().includes(fragment)))
      .filter(cle => !AGREGATS_QUI_SONNENT_NOMINATIFS.has(cle))
  }

  it('LIT quelque chose — la réponse balayée n’est pas vide', async () => {
    // Contrôle positif : un balayage sur une chaîne vide serait vert pour
    // toujours. C'est la leçon des gardes borgnes de ce dépôt.
    const overview = await new ChatbotFunnelService(measuringClient()).overview()
    const serialise = JSON.stringify(overview)
    expect(serialise.length).toBeGreaterThan(400)
    expect(serialise).toContain('"stages"')
    expect(serialise).toContain('"medianScore"')
    // Le balayage extrait bien des clés — un extracteur cassé rendrait zéro
    // clé, donc zéro fautive, donc un vert qui n'a rien lu.
    expect([...serialise.matchAll(/"([^"]+)"\s*:/g)].length).toBeGreaterThan(10)
  })

  it('sait dire NON — une adresse et une clé nominative sont refusées', () => {
    expect(UNE_ADRESSE.test('{"x":"sarah.martin@client-esn.fr"}')).toBe(true)
    expect(clesNominatives('{"ownerEmail":"x"}')).toEqual(['ownerEmail'])
    expect(clesNominatives('{"visitorId":"x"}')).toEqual(['visitorId'])
    expect(clesNominatives('{"sessionHash":"x"}')).toEqual(['sessionHash'])
  })

  it('n’attrape pas ce qu’il ne vise pas — le vocabulaire légitime du tunnel', () => {
    expect(UNE_ADRESSE.test('{"stage":"widget_opened","count":200}')).toBe(false)
    expect(clesNominatives('{"stage":"conversation","sessions":140}')).toEqual([])
    expect(clesNominatives('{"minSessions":5,"passRate":{"kind":"measured"}}')).toEqual([])
    // `"visitors"` en VALEUR est l'identifiant d'une étape, pas une clé.
    expect(clesNominatives('{"stage":"visitors","count":4000}')).toEqual([])
  })

  it('chaque exception nommée sert encore — une exception périmée fait croire à une garde', async () => {
    // Les deux régimes, parce qu'ils ne produisent pas les mêmes clés : un
    // trafic normal publie ses taux, un trafic rare les RETIENT et c'est
    // seulement là que `minSessions` apparaît.
    const rare = stubClient({
      isEnabled: () => true,
      eventMeasurement: async () => ({
        sourceAvailable: true,
        events: { chat_opened: 1 },
        visitors: { chat_opened: 1 },
      }),
      siteVisitors: async () => 2,
    })
    const serialise = [
      JSON.stringify(await new ChatbotFunnelService(measuringClient()).overview()),
      JSON.stringify(await new ChatbotFunnelService(rare).overview()),
    ].join('')
    expect(AGREGATS_QUI_SONNENT_NOMINATIFS.size).toBeGreaterThan(0)
    // ⚠️ `expect` de Jest ne prend qu'UN argument — pas de message d'échec en
    // second, contrairement à Vitest. Le nom de la clé voyage donc dans une
    // liste construite, pour que l'échec DISE laquelle est périmée.
    const raisonsTropCourtes = [...AGREGATS_QUI_SONNENT_NOMINATIFS]
      .filter(([, raison]) => raison.length <= 20)
      .map(([cle]) => cle)
    expect(raisonsTropCourtes).toEqual([])

    const perimees = [...AGREGATS_QUI_SONNENT_NOMINATIFS.keys()].filter(cle => !serialise.includes(`"${cle}"`))
    expect(perimees).toEqual([])
  })

  it('aucune adresse et aucune clé nominative dans la réponse, même mesure polluée', async () => {
    for (const client of [measuringClient(), pollutedClient()]) {
      const serialise = JSON.stringify(await new ChatbotFunnelService(client).overview())
      expect(UNE_ADRESSE.exec(serialise)?.[0] ?? null).toBeNull()
      expect(clesNominatives(serialise)).toEqual([])
      // Et pas seulement les CLÉS : une valeur qui ressemble à un nom propre
      // suivi d'un nom de famille n'a rien à faire dans un agrégat d'étapes.
      expect(serialise).not.toContain('Sarah Martin')
    }
  })
})
