import type { TFunction } from 'i18next'
import type { BriefingAction, DailyBriefing, MailThread } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { composeMorningBrief } from './morning-brief'

/**
 * #1936 — le brief du matin DANS LA VOIX DE LAURA, composé sans modèle.
 *
 * Ces tests lisent le VRAI catalogue (FR, puis EN) : ce qui se vérifie ici est
 * autant la phrase que le choix — un bloc « honnêtement vide » mal écrit se lit
 * comme une panne, et c'est la phrase qui le décide.
 */
const fr = i18n.getFixedT('fr', 'chat') as TFunction<'chat'>
const en = i18n.getFixedT('en', 'chat') as TFunction<'chat'>

function briefing(overrides: Partial<DailyBriefing> = {}): DailyBriefing {
  return {
    date: '2026-09-12',
    timeZone: 'Europe/Paris',
    firstName: null,
    protectedTime: null,
    agendaPreferences: {},
    agenda: {
      state: 'ready',
      reason: null,
      readAt: '2026-09-12T06:00:00.000Z',
      events: [],
      conflicts: [],
      needsPreparation: [],
    },
    mail: {
      state: 'ready',
      reason: null,
      readAt: '2026-09-12T06:00:00.000Z',
      awaitingReply: [],
      unread: [],
      positiveReplies: [],
    },
    tasks: {
      state: 'ready',
      reason: null,
      readAt: '2026-09-12T06:00:00.000Z',
      tasks: [],
      overdueCount: 0,
      todayCount: 0,
    },
    accountsToWatch: [],
    // #2151.23 — le brief porte désormais les alertes de Découvrir ; ce témoin
    // les rend vides, ce qui est l'état d'un espace où rien n'est apparu.
    discoverAlerts: [],
    discoverAlertsLastEventAt: null,
    chainBlockers: [],
    criticalRisks: [],
    runningJobs: [],
    actions: [],
    generatedAt: '2026-09-12T06:00:00.000Z',
    ...overrides,
  }
}

function watched(accountId: string, companyName: string, href = `/accounts/${accountId}`) {
  return {
    accountId,
    companyName,
    reasonKey: 'briefing.account.freshSignal',
    href,
    detectedAt: null,
    detectionExact: true,
    signalLabel: null,
    // #2107.33 — `esnReason` du contrat, non pertinent pour ce composeur texte.
    esnReason: null,
    signalSourceUrl: null,
    signalSourceKind: null,
    // #2097.21 — `logoUrl`/`website` du contrat, non pertinents pour ce
    // composeur texte.
    logoUrl: null,
    website: null,
    // #2107.40 — `structuralPotentialPaths` du contrat, non pertinent pour ce
    // composeur texte.
    structuralPotentialPaths: null,
    // #2107.42 — `accessPath` du contrat, non pertinent pour ce composeur texte.
    accessPath: null,
    history: [],
  }
}

function action(overrides: Partial<BriefingAction> = {}): BriefingAction {
  return {
    id: 'account:a-sg',
    labelKey: 'briefing.actions.freshSignal',
    labelVars: { company: 'Société Générale' },
    href: '/accounts/a-sg',
    kind: 'account',
    priority: 5,
    fact: null,
    context: null,
    // `NOTHING_PREPARED` côté serveur : aucun producteur n'existe encore.
    preparedArtifacts: [],
    expiresAt: null,
    // #2095 / #2099 — les sept facettes du contrat canonique, toutes à leur
    // valeur d'ABSENCE : le brief dans la voix de Laura n'en lit aucune, et
    // les remplir ici laisserait croire le contraire.
    businessObject: null,
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
    ...overrides,
  }
}

/** Un fil tel qu'un serveur FAUTIF le rendrait — avec un corps qu'il ne devrait pas porter. */
const leakyThread = {
  threadId: 't-1',
  subject: 'Renouvellement',
  counterpart: 'Sophie Martin',
  lastMessageAt: null,
  lastDirection: 'inbound',
  messageCount: 2,
  awaitingReply: false,
  daysSinceLastMessage: null,
  unread: true,
  hasAttachments: false,
  otherParticipants: [],
  body: 'CORPS CONFIDENTIEL DU MESSAGE',
  snippet: 'EXTRAIT CONFIDENTIEL',
} as unknown as MailThread

const compose = (input: Partial<Parameters<typeof composeMorningBrief>[1]> = {}, t = fr) =>
  composeMorningBrief(t, { briefing: briefing(), role: null, firstName: 'Louis', ...input })

describe('composeMorningBrief — trois blocs, jamais plus (#1936.1)', () => {
  it('rend « Ce qui a changé », « Ce que j’ai préparé », « Ce que je te conseille », dans cet ordre', () => {
    const text = compose()
    const positions = ['**Ce qui a changé**', '**Ce que j’ai préparé**', '**Ce que je te conseille**'].map(title =>
      text.indexOf(title),
    )
    expect(positions.every(position => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('salue par le prénom qu’on lui passe, et n’en invente aucun sans lui', () => {
    expect(compose()).toMatch(/^Bonjour Louis\./)
    expect(compose({ firstName: '' })).toMatch(/^Bonjour\./)
  })

  it('parle anglais quand l’interface est en anglais', () => {
    const text = compose({}, en)
    expect(text).toContain('**What changed**')
    expect(text).toContain('**What I prepared**')
    expect(text).toContain('**What I recommend**')
  })
})

describe('Ce qui a changé (#1936.2) — nommé avec son lien quand le brief en porte un', () => {
  it('nomme les comptes qui ont bougé avec le lien RÉEL que le brief fournit', () => {
    const text = compose({ briefing: briefing({ accountsToWatch: [watched('a-sg', 'Société Générale')] }) })
    expect(text).toContain('- [Société Générale](/accounts/a-sg) a bougé')
  })

  it('au-delà de trois comptes, dit combien il en reste sans les nommer', () => {
    const accounts = ['A', 'B', 'C', 'D', 'E'].map(name => watched(`a-${name}`, `Compte ${name}`))
    const text = compose({ briefing: briefing({ accountsToWatch: accounts }) })
    expect(text).toContain('[Compte C](/accounts/a-C)')
    expect(text).not.toContain('Compte D')
    expect(text).toContain('et 2 autres comptes suivis ont bougé')
  })

  it('un fait AGRÉGÉ s’écrit comme tel — un nombre, sans lien promis', () => {
    const conflict = {} as DailyBriefing['agenda']['conflicts'][number]
    const text = compose({
      briefing: briefing({
        agenda: {
          state: 'ready',
          reason: null,
          readAt: null,
          events: [],
          conflicts: [conflict, conflict],
          needsPreparation: [],
        },
        mail: {
          state: 'ready',
          reason: null,
          readAt: null,
          awaitingReply: [],
          unread: [],
          positiveReplies: [leakyThread],
        },
        tasks: { state: 'ready', reason: null, readAt: null, tasks: [], overdueCount: 3, todayCount: 0 },
      }),
    })
    const line = (needle: string) => text.split('\n').find(entry => entry.includes(needle)) ?? ''
    expect(line('2 chevauchements dans ton agenda')).not.toContain('](')
    expect(line('1 réponse favorable dans ta messagerie')).not.toContain('](')
    expect(line('3 tâches en retard')).not.toContain('](')
  })

  it('une source absente le DIT — jamais « 0 », jamais un bloc muet', () => {
    const text = compose({
      briefing: briefing({
        agenda: { state: 'unavailable', reason: 'x', readAt: null, events: [], conflicts: [], needsPreparation: [] },
        mail: { state: 'not_connected', reason: 'x', readAt: null, awaitingReply: [], unread: [], positiveReplies: [] },
        tasks: { state: 'unavailable', reason: 'x', readAt: null, tasks: [], overdueCount: 0, todayCount: 0 },
      }),
    })
    expect(text).toContain('Ton agenda n’a pas répondu')
    expect(text).toContain('Ta messagerie n’est pas connectée')
    expect(text).toContain('Tes tâches n’ont pas pu être lues')
    expect(text).not.toMatch(/\b0\b/)
  })

  it('une source À MOITIÉ servie montre ce qu’elle a ET dit ce qui manque', () => {
    const text = compose({
      briefing: briefing({
        mail: {
          state: 'partial',
          reason: 'x',
          readAt: null,
          awaitingReply: [],
          unread: [leakyThread],
          positiveReplies: [],
        },
      }),
    })
    expect(text).toContain('1 message non lu d’un interlocuteur externe')
    expect(text).toContain('Une de tes boîtes n’a pas répondu')
  })

  it('rien de neuf : le dit dans les limites de ce qui a été lu — jamais « tout va bien » (#1936.8)', () => {
    const text = compose()
    expect(text).toContain('Rien de neuf dans ce que j’ai pu lire.')
    expect(text).not.toMatch(/tout va bien/i)
  })
})

describe('Ce que j’ai préparé (#1936.3) — honnêtement vide tant que rien n’est préparé', () => {
  it('le serveur rend NOTHING_PREPARED : le bloc le dit, sans promettre un brouillon', () => {
    const text = compose({ briefing: briefing({ actions: [action()] }) })
    expect(text).toContain('Rien de prêt pour l’instant')
  })

  it('un objet RÉELLEMENT préparé se liste avec son lien (#1936.9)', () => {
    const prepared = action({
      preparedArtifacts: [
        {
          id: 'd-1',
          kind: 'draft_message',
          labelKey: 'briefing.actions.meetingPrep',
          labelVars: { subject: 'la soutenance Vinci' },
          href: '/actions/d-1',
          // #2106.12 à #2106.19 — les sept champs dédiés, à leur valeur neutre :
          // ce test mesure le lien, pas ces facettes.
          businessObject: null,
          preparedAt: null,
          version: 1,
          source: null,
          status: 'ready',
          preparedBy: 'laura',
          creditsCost: null,
        },
      ],
    })
    const text = compose({ briefing: briefing({ actions: [prepared] }) })
    expect(text).toContain('- [Prépare la soutenance Vinci](/actions/d-1)')
    expect(text).not.toContain('Rien de prêt')
  })
})

describe('Ce que je te conseille (#1936.4) — le rang 1 DÉJÀ classé, reformulé', () => {
  it('reprend la PREMIÈRE action servie, avec son geste réel — jamais un second classement', () => {
    const followUp = action({
      id: 'follow-up:t-9',
      labelKey: 'briefing.actions.followUpNoSubject',
      labelVars: { counterpart: 'Paul Durand', days: 9 },
      href: '/mailbox?intent=no_reply&thread=t-9',
      kind: 'follow_up',
      priority: 1,
    })
    // L'ordre SERVI fait foi, même quand un rang numérique plus petit arrive second.
    const text = compose({ briefing: briefing({ actions: [action(), followUp] }) })
    const advice = text.slice(text.indexOf('**Ce que je te conseille**'))
    expect(advice).toContain('Je commencerais par ceci : Société Générale a bougé.')
    // Le geste est celui de l'écran « Aujourd’hui » (`actions.cta.account`), mot pour mot.
    expect(advice).toContain("[Analyser l'opportunité](/accounts/a-sg)")
    expect(advice).not.toContain('Paul Durand')
  })

  it('un rang 1 sans destination se dit, sans lien promis', () => {
    const conflict = action({
      id: 'conflict:e1:e2',
      labelKey: 'briefing.actions.conflict',
      labelVars: { first: 'Point équipe', second: 'Client Vinci', minutes: 30 },
      href: null,
      kind: 'conflict',
      priority: 1,
    })
    const text = compose({ briefing: briefing({ actions: [conflict] }) })
    const advice = text.slice(text.indexOf('**Ce que je te conseille**'))
    expect(advice).toContain('Deux rendez-vous se chevauchent de 30 min : Point équipe et Client Vinci')
    expect(advice).not.toContain('](')
  })

  it('aucune action : le dit, et nomme le manque quand une source échappe', () => {
    expect(compose()).toContain('Rien ne ressort en priorité de ce que j’ai pu lire. Par quoi on commence ?')
    const partial = compose({
      briefing: briefing({
        mail: { state: 'not_connected', reason: 'x', readAt: null, awaitingReply: [], unread: [], positiveReplies: [] },
      }),
    })
    expect(partial).toContain('une partie de tes sources m’échappe')
  })
})

describe('brief ILLISIBLE à la 1re ouverture — consommé, et le silence est nommé bloc par bloc', () => {
  it('chacun des trois blocs dit qu’il n’a pas pu lire, sans un chiffre', () => {
    const text = compose({ briefing: null })
    expect(text).toContain('Je n’ai pas pu lire tes sources')
    expect(text).toContain('Sans tes sources, je ne peux pas te dire ce qui est prêt.')
    expect(text).toContain('[réessaie depuis Ma journée](/briefing)')
    expect(text).not.toMatch(/\d/)
  })
})

describe('le rôle change la VOIX, jamais les faits (#1936.11)', () => {
  it('un propriétaire d’espace est prévenu que le brief est le sien, pas celui de l’équipe', () => {
    const facts = briefing({ accountsToWatch: [watched('a-sg', 'Société Générale')], actions: [action()] })
    const owner = compose({ briefing: facts, role: 'owner' })
    const sales = compose({ briefing: facts, role: 'sales' })
    expect(owner).toContain('pas sur celle de ton équipe')
    expect(sales).not.toContain('équipe')
    expect(owner.replace(' Ce brief porte sur ta journée à toi, pas sur celle de ton équipe.', '')).toBe(sales)
  })
})

describe('ce qui entre dans l’historique envoyé au modèle (D65)', () => {
  it('ne contient JAMAIS le corps d’un message, même quand un fil en porterait un', () => {
    const text = compose({
      briefing: briefing({
        mail: {
          state: 'ready',
          reason: null,
          readAt: null,
          awaitingReply: [leakyThread],
          unread: [leakyThread],
          positiveReplies: [leakyThread],
        },
        actions: [
          action({
            id: 'positive:t-1',
            labelKey: 'briefing.actions.positiveReply',
            labelVars: { counterpart: 'Sophie Martin', subject: 'Renouvellement' },
            href: '/mailbox?intent=positive_reply&thread=t-1',
            kind: 'reply',
          }),
        ],
      }),
    })
    expect(text).not.toContain('CONFIDENTIEL')
  })
})

describe('un lien qui ne se lirait pas comme un lien reste un libellé', () => {
  it('une destination avec espace ou parenthèse n’écrit pas de syntaxe markdown cassée', () => {
    const text = compose({ briefing: briefing({ accountsToWatch: [watched('a-v', 'Vinci', '/accounts/a v)')] }) })
    expect(text).toContain('- Vinci a bougé')
    expect(text).not.toContain('[Vinci]')
  })
})

/**
 * #1901.2 — LE BRIEF DIT LE MÊME FAIT QUE LA PAGE, DANS SA PROPRE VOIX.
 *
 * La page « Aujourd'hui » distingue « n'a pas répondu » (ça repasse tout seul)
 * de « l'accès est éteint côté fournisseur » (ça ne repassera jamais sans
 * geste). Laura, elle, disait « n'a pas répondu » dans les deux cas : elle ne
 * lisait pas `reason` du tout. Deux présentations du MÊME système ne peuvent
 * pas dire deux choses différentes du même fait — c'est la demande de #1901.
 *
 * Ce qui converge est le FAIT (`briefingAccessIsSwitchedOff`, `block-state.ts`,
 * partagé avec `BlockState.tsx`). Ce qui ne converge pas, et ne doit pas, est la
 * PHRASE : la page parle de l'écran, Laura parle à la première personne.
 */
describe('#1901.2 — « éteint côté fournisseur », dans la voix de Laura', () => {
  it('le dit pour l’agenda, au lieu de laisser croire que ça repassera', () => {
    const text = compose({
      briefing: briefing({
        agenda: {
          state: 'unavailable',
          reason: 'provider_api_disabled',
          readAt: null,
          events: [],
          conflicts: [],
          needsPreparation: [],
        },
      }),
    })

    expect(text).toContain('éteint côté fournisseur')
    // La voix reste la sienne : première personne, jamais le texte de l'écran.
    expect(text).toMatch(/je ne (vois|sais)/)
  })

  it('le dit pour la messagerie aussi', () => {
    const text = compose({
      briefing: briefing({
        mail: {
          state: 'unavailable',
          reason: 'provider_api_disabled',
          readAt: null,
          awaitingReply: [],
          unread: [],
          positiveReplies: [],
        },
      }),
    })

    expect(text).toContain('éteint côté fournisseur')
  })

  it('LE TÉMOIN — une panne ordinaire garde sa phrase d’avant, mot pour mot', () => {
    const text = compose({
      briefing: briefing({
        agenda: {
          state: 'unavailable',
          reason: 'agenda_status_failed',
          readAt: null,
          events: [],
          conflicts: [],
          needsPreparation: [],
        },
      }),
    })

    expect(text).toContain('Ton agenda n’a pas répondu : je ne sais pas ce qui y a changé.')
    expect(text).not.toContain('éteint côté fournisseur')
  })

  it('le dit aussi en anglais', () => {
    const text = compose(
      {
        briefing: briefing({
          agenda: {
            state: 'unavailable',
            reason: 'provider_api_disabled',
            readAt: null,
            events: [],
            conflicts: [],
            needsPreparation: [],
          },
        }),
      },
      en,
    )

    expect(text).toContain('switched off on the provider side')
  })
})
