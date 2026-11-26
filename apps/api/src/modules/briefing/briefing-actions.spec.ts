import type { AgendaEvent, BriefingRankingAxisReading, MailThread } from '@bellum/contracts'
import {
  BRIEFING_ACTION_KINDS,
  BRIEFING_ACTIONS_MAX,
  BRIEFING_ACTIONS_SHOWN,
  BRIEFING_FACT_CAPABILITIES,
} from '@bellum/contracts'
import {
  BRIEFING_ACTION_LABEL_KEYS,
  BRIEFING_CONTEXT_LABEL_KEYS,
  BRIEFING_FACT_LABEL_KEYS,
  buildAllBriefingActions,
  buildBriefingActions,
  compareBriefingActions,
  selectEndedMeetingsAwaitingFollowup,
  selectMeetingsToPrepare,
} from './briefing-actions'

const NOW = new Date('2026-08-03T07:00:00Z')

function event(partial: Partial<AgendaEvent> & Pick<AgendaEvent, 'id'>): AgendaEvent {
  return {
    summary: 'Point client',
    description: null,
    location: null,
    start: '2026-08-03T09:00:00.000Z',
    end: '2026-08-03T10:00:00.000Z',
    organizer: 'moi@bellum.fr',
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
    ...partial,
  }
}

function thread(partial: Partial<MailThread> & Pick<MailThread, 'threadId'>): MailThread {
  return {
    subject: 'Proposition',
    counterpart: 'jean@acme.com',
    lastMessageAt: '2026-07-25T09:00:00.000Z',
    lastDirection: 'outbound',
    messageCount: 2,
    awaitingReply: true,
    daysSinceLastMessage: 9,
    unread: false,
    hasAttachments: false,
    otherParticipants: [],
    ...partial,
  }
}

const EMPTY = {
  // L'INSTANT du brief. Il n'était pas passé : les cartes d'agenda datent leur
  // fait de la LECTURE de l'agenda (un rendez-vous futur n'a pas d'autre date
  // d'observation que celle-là), et sans lui elles ne pouvaient rien dater.
  now: NOW,
  meetings: [],
  conflicts: [],
  awaitingReply: [],
  unread: [],
  positiveReplies: [],
  accountsWithFreshSignal: [],
  staleNeeds: [],
}

describe('buildBriefingActions', () => {
  it('place ce qui a une heure avant ce qui n’en a pas', () => {
    // Un rendez-vous dans deux heures ne se rattrape pas ; une relance de J+9 si.
    const actions = buildBriefingActions({
      ...EMPTY,
      meetings: [event({ id: 'm1' })],
      awaitingReply: [thread({ threadId: 't1' })],
      accountsWithFreshSignal: [{ accountId: 'a1', companyName: 'ACME', detectedAt: null, detectionExact: true }],
    })
    expect(actions.map(action => action.kind)).toEqual(['meeting_prep', 'follow_up', 'account'])
  })

  it('un conflit d’agenda passe avant tout : deux personnes attendent au même moment', () => {
    const actions = buildBriefingActions({
      ...EMPTY,
      meetings: [event({ id: 'm1' })],
      conflicts: [{ first: event({ id: 'a' }), second: event({ id: 'b' }), overlapMinutes: 30 }],
    })
    expect(actions[0]?.kind).toBe('conflict')
  })

  // #3671.1 — recette prod 08/10 : « Donnée fausse » sur une carte de conflit
  // n'avait AUCUN effet. Cause : `fact.provenance.observedAt` datait la
  // LECTURE (`readAt`, l'instant du brief) au lieu du FAIT — deux appels de
  // `buildBriefingActions` pour LE MÊME conflit produisaient deux dates
  // différentes, donc `isStillHeld` (côté contrats) ne reconnaissait jamais
  // la correction au rechargement suivant. La date doit venir des DEUX
  // rendez-vous eux-mêmes (`earliestStart`), stable tant qu'ils ne bougent
  // pas — jamais de l'instant de lecture.
  it('le fait d’un conflit ne change pas avec l’instant de lecture — sinon une correction ne tient jamais', () => {
    const conflicts = [{ first: event({ id: 'a' }), second: event({ id: 'b' }), overlapMinutes: 30 }]
    const firstRead = buildBriefingActions({ ...EMPTY, now: NOW, conflicts })
    const secondRead = buildBriefingActions({
      ...EMPTY,
      now: new Date(NOW.getTime() + 3600_000),
      conflicts,
    })
    expect(firstRead[0]?.fact?.provenance.observedAt).not.toBeNull()
    expect(firstRead[0]?.fact?.provenance.observedAt).toEqual(secondRead[0]?.fact?.provenance.observedAt)
  })

  it('trie les silences du plus ancien au plus récent', () => {
    const actions = buildBriefingActions({
      ...EMPTY,
      awaitingReply: [
        thread({ threadId: 'recent', daysSinceLastMessage: 8 }),
        thread({ threadId: 'ancien', daysSinceLastMessage: 40 }),
      ],
    })
    expect(actions.map(action => action.id)).toEqual(['follow-up:ancien', 'follow-up:recent'])
  })

  it('ne classe jamais plus que le plafond — au-delà ce n’est plus un brief', () => {
    const actions = buildBriefingActions({
      ...EMPTY,
      // Douze interlocuteurs DIFFÉRENTS : c'est la forme d'une vraie boîte, et
      // c'est ce que ce test veut mesurer. La fixture n'en avait qu'un seul,
      // donc elle mesurait aussi, sans le dire, l'absence de borne par personne.
      awaitingReply: Array.from({ length: 12 }, (_, index) =>
        thread({ threadId: `t${index}`, counterpart: `contact${index}@acme.com`, daysSinceLastMessage: index }),
      ),
    })
    expect(actions).toHaveLength(BRIEFING_ACTIONS_MAX)
  })

  it('n’laisse pas UN interlocuteur occuper tout le brief (recette du 17/08)', () => {
    // Le défaut vu en production : quatre lignes identiques d'une même personne
    // remplissaient les cinq places, et cachaient les quatre autres sujets du
    // jour. Deux places par personne — pas une, pas cinq.
    const actions = buildBriefingActions({
      ...EMPTY,
      positiveReplies: Array.from({ length: 4 }, (_, index) =>
        thread({ threadId: `p${index}`, counterpart: 'nathan@esce.fr', subject: `Sujet ${index}` }),
      ),
      awaitingReply: [thread({ threadId: 'autre', counterpart: 'jean@acme.com' })],
    })
    expect(actions.filter(action => action.kind === 'reply')).toHaveLength(2)
    // Et la place libérée sert : l'autre interlocuteur remonte.
    expect(actions.some(action => action.id === 'follow-up:autre')).toBe(true)
  })

  it('distingue deux fils du même interlocuteur par leur SUJET', () => {
    const actions = buildBriefingActions({
      ...EMPTY,
      positiveReplies: [
        thread({ threadId: 'p1', counterpart: 'nathan@esce.fr', subject: 'Renouvellement' }),
        thread({ threadId: 'p2', counterpart: 'nathan@esce.fr', subject: 'Nouveau besoin' }),
      ],
    })
    expect(actions.map(action => action.labelVars['subject'])).toEqual(['Renouvellement', 'Nouveau besoin'])
    expect(new Set(actions.map(action => action.labelKey))).toEqual(new Set(['briefing.actions.positiveReply']))
  })

  it('ne rend pas DEUX FOIS la même ligne quand deux fils partagent interlocuteur ET sujet (recette du 27/08)', () => {
    // Le défaut mesuré au navigateur sur « Aujourd’hui » : deux `<a>` au
    // `textContent` identique et à la même destination —
    // « nathan.kosmowski@esce.fr a répondu favorablement sur « Louis, toujours
    // intéressé ? » — enchaîne » — deux fois.
    //
    // Le plafond de deux fils par interlocuteur (17/08) supposait que le SUJET
    // les distinguerait. Quand le sujet est le même, il ne distingue rien : la
    // seconde ligne consomme une des cinq places sans rien apprendre, ce qui
    // est exactement le tort que le plafond corrigeait.
    const actions = buildBriefingActions({
      ...EMPTY,
      positiveReplies: [
        thread({ threadId: 'p1', counterpart: 'nathan.kosmowski@esce.fr', subject: 'Louis, toujours intéressé ?' }),
        thread({ threadId: 'p2', counterpart: 'nathan.kosmowski@esce.fr', subject: 'Louis, toujours intéressé ?' }),
      ],
      awaitingReply: [thread({ threadId: 'autre', counterpart: 'jean@acme.com' })],
    })

    expect(actions.filter(action => action.kind === 'reply')).toHaveLength(1)
    // La place libérée sert : l'autre sujet de la journée remonte.
    expect(actions.some(action => action.id === 'follow-up:autre')).toBe(true)
  })

  it('ne rend jamais deux actions au MÊME contenu — la clé métier, pas le texte traduit', () => {
    // La garde est posée sur `labelKey` + `labelVars`, qui sont la donnée : deux
    // actions qui les partagent rendent la même phrase dans TOUTES les langues.
    // Dédupliquer sur la chaîne française casserait au premier changement de
    // langue.
    const actions = buildBriefingActions({
      ...EMPTY,
      positiveReplies: [
        thread({ threadId: 'p1', counterpart: 'nathan.kosmowski@esce.fr', subject: 'Louis, toujours intéressé ?' }),
        thread({ threadId: 'p2', counterpart: 'nathan.kosmowski@esce.fr', subject: 'Louis, toujours intéressé ?' }),
      ],
      awaitingReply: [
        thread({ threadId: 't1', counterpart: 'marie@acme.com', subject: 'Devis' }),
        thread({ threadId: 't2', counterpart: 'marie@acme.com', subject: 'Devis' }),
      ],
    })

    const rendered = actions.map(action => `${action.labelKey}|${JSON.stringify(action.labelVars)}`)
    expect(new Set(rendered).size).toBe(rendered.length)
  })

  // #2095.77 — deux candidats qui OUVRIRAIENT LE MÊME ÉCRAN se fusionnent en
  // une seule carte. Le dédoublonnage déjà en place (recette du 27/08 juste
  // au-dessus) ne couvre que le contenu d'UNE source (deux fils de la même
  // relance) ; ici, un même compte signalé deux fois par l'historique de
  // signaux (deux lignes d'entrée) doit rendre une seule carte, pas deux
  // `<a href="/accounts/a1">` identiques.
  it('fusionne deux candidats qui appellent la même action (#2095.77)', () => {
    const actions = buildBriefingActions({
      ...EMPTY,
      accountsWithFreshSignal: [
        { accountId: 'a1', companyName: 'ACME', detectedAt: null, detectionExact: true },
        { accountId: 'a1', companyName: 'ACME', detectedAt: null, detectionExact: true },
      ],
    })
    expect(actions.filter(action => action.href === '/accounts/a1')).toHaveLength(1)
  })

  it('garde le libellé court quand le fil n’a pas de sujet lisible', () => {
    // « ... a répondu favorablement sur «  » » se lirait comme un trou.
    const actions = buildBriefingActions({
      ...EMPTY,
      positiveReplies: [thread({ threadId: 'p1', subject: '   ' })],
    })
    expect(actions[0]?.labelKey).toBe('briefing.actions.positiveReplyNoSubject')
  })

  it('rend des clés i18n, jamais du texte figé', () => {
    // Un libellé français en dur dans l'API, c'est un écran anglais à moitié
    // traduit le jour où quelqu'un change de langue.
    const actions = buildBriefingActions({
      ...EMPTY,
      awaitingReply: [thread({ threadId: 't1' })],
    })
    expect(actions[0]?.labelKey).toBe('briefing.actions.followUp')
    expect(actions[0]?.labelVars).toEqual({ counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' })
  })

  // #5003.1 — une relance vers un compte ESN est ÉTIQUETÉE « ESN » (jamais retirée : un partenaire reste une relance).
  it('étiquette ESN une relance vers une ESN, sans la retirer', () => {
    const actions = buildBriefingActions({
      ...EMPTY,
      awaitingReply: [
        thread({ threadId: 'e1', account: { id: 'a1', name: 'Davidson', via: 'domain', isEsn: true } }),
        thread({ threadId: 'c1', counterpart: 'paul@client.com', subject: 'Devis' }),
      ],
    })
    const esn = actions.find(a => a.id === 'follow-up:e1')
    expect(esn?.labelKey).toBe('briefing.actions.followUpEsn')
    expect(esn?.labelVars).toMatchObject({ counterpart: 'jean@acme.com', days: 9 })
    expect(actions.find(a => a.id === 'follow-up:c1')?.labelKey).toBe('briefing.actions.followUp')
    expect(actions).toHaveLength(2)
  })

  it('n’émet que des clés DÉCLARÉES — et donc vérifiées côté traduction', () => {
    // Cette assertion existait, et elle affirmait la clé fausse : elle gelait
    // le défaut au lieu de l'attraper. Une clé recopiée du code ne prouve rien.
    // Rattachée à la liste exportée, elle devient le point unique que
    // `briefing-labels.spec.ts` confronte aux fichiers de traduction réels.
    const actions = buildBriefingActions({
      ...EMPTY,
      conflicts: [{ first: event({ id: 'a' }), second: event({ id: 'b' }), overlapMinutes: 30 }],
      meetings: [event({ id: 'm1' })],
      positiveReplies: [thread({ threadId: 'p1' })],
      awaitingReply: [thread({ threadId: 't1' })],
      accountsWithFreshSignal: [{ accountId: 'acc1', companyName: 'ACME', detectedAt: null, detectionExact: true }],
    })
    for (const action of actions) {
      expect(BRIEFING_ACTION_LABEL_KEYS).toContain(action.labelKey)
    }
  })

  // #2107.28 — « Ne plus afficher seulement le nom du compte ». Avant ce lot,
  // la carte disait « Thales a bougé » sans jamais dire CE QUI a bougé.
  describe('accountsWithFreshSignal (#2107.28 — ce qui a bougé)', () => {
    it('le libellé du signal devient le FAIT de la carte, la clé déclarée', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        accountsWithFreshSignal: [
          {
            accountId: 'acc1',
            companyName: 'Thales',
            detectedAt: '2026-08-02T08:00:00Z',
            detectionExact: true,
            signalLabel: 'Levée de fonds Série B',
          },
        ],
      })
      expect(actions[0]?.fact).toMatchObject({
        labelKey: 'briefing.facts.freshSignal',
        labelVars: { signal: 'Levée de fonds Série B' },
      })
      expect(BRIEFING_FACT_LABEL_KEYS).toContain(actions[0]?.fact?.labelKey)
      // Le nom du compte reste lisible — via `businessObject`, jamais perdu.
      expect(actions[0]?.businessObject).toMatchObject({ kind: 'account', name: 'Thales' })
    })

    it('sans libellé de signal, le fait reste sans clé — comportement inchangé', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        accountsWithFreshSignal: [
          { accountId: 'acc1', companyName: 'Thales', detectedAt: '2026-08-02T08:00:00Z', detectionExact: true },
        ],
      })
      expect(actions[0]?.fact?.labelKey).toBeNull()
    })

    // #2097.21 — la carte peut enfin montrer le logo du compte mentionné.
    it('le logo du compte, quand la lecture le porte', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        accountsWithFreshSignal: [
          {
            accountId: 'acc1',
            companyName: 'Thales',
            detectedAt: null,
            detectionExact: true,
            logoUrl: 'https://cdn.example/thales.png',
          },
        ],
      })
      expect(actions[0]?.businessObject).toMatchObject({
        kind: 'account',
        name: 'Thales',
        logoUrl: 'https://cdn.example/thales.png',
      })
    })

    it('sans logo connu, `null` plutôt qu’une valeur inventée', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        accountsWithFreshSignal: [{ accountId: 'acc1', companyName: 'Thales', detectedAt: null, detectionExact: true }],
      })
      expect(actions[0]?.businessObject).toMatchObject({ logoUrl: null, website: null })
    })

    // #2097.21 (correctif) — mesuré en prod le 25/09 : `logoUrl` seul (le
    // logo Apollo persisté, quasi toujours vide) ne suffit pas à faire
    // apparaître une image. `website` porte le MÊME repli favicon que
    // `/accounts` (`CompanyAvatar`, `apps/web/src/lib/company-logo.ts`).
    it('le site du compte, pour le repli favicon quand `logoUrl` est vide', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        accountsWithFreshSignal: [
          {
            accountId: 'acc1',
            companyName: 'Thales',
            detectedAt: null,
            detectionExact: true,
            website: 'https://www.thalesgroup.com',
          },
        ],
      })
      expect(actions[0]?.businessObject).toMatchObject({
        kind: 'account',
        logoUrl: null,
        website: 'https://www.thalesgroup.com',
      })
    })
  })

  // #2107.3 — un besoin ouvert depuis plus de cinq jours, sans shortlist.
  // Doublon de #2106.7 : les deux se livrent avec ce producteur, avec la même
  // preuve — voir `briefing.service.ts` (appelant réel) pour la lecture SQL.
  describe('need_stale (#2107.3, doublon #2106.7)', () => {
    it('ouvre le besoin lui-même — jamais une liste', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleNeeds: [{ id: 'need-1', title: 'DevOps confirmé', days: 9 }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'need:need-1',
        kind: 'need_stale',
        href: '/projects/needs/need-1',
        labelKey: 'briefing.actions.needStale',
        labelVars: { title: 'DevOps confirmé', days: 9 },
      })
    })

    it('porte un fait sourcé sur la capacité `needs`, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleNeeds: [{ id: 'need-1', title: 'DevOps confirmé', days: 9 }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('needs')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('dit le CRITÈRE — cinq jours sans shortlist — dans le contexte', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleNeeds: [{ id: 'need-1', title: 'DevOps confirmé', days: 12 }],
      })
      expect(actions[0]?.context).toEqual({ labelKey: 'briefing.context.needStale', labelVars: { days: 12 } })
    })

    it('n’expire jamais tout seul — un besoin sans shortlist ne cesse pas d’être vrai', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleNeeds: [{ id: 'need-1', title: 'DevOps confirmé', days: 9 }],
      })
      expect(actions[0]?.expiresAt).toBeNull()
    })

    it('n’a rien à préparer — proposer un profil suppose un appariement hors périmètre', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleNeeds: [{ id: 'need-1', title: 'DevOps confirmé', days: 9 }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('classe plusieurs besoins, le plus ancien d’abord', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleNeeds: [
          { id: 'need-recent', title: 'Récent', days: 6 },
          { id: 'need-old', title: 'Ancien', days: 40 },
        ],
      })
      expect(actions.map(action => action.id)).toEqual(['need:need-old', 'need:need-recent'])
    })
  })

  // #3389.13 (reste) — une veille dont la date de reprise est échue : la date
  // s'affichait, rien ne la relançait. Même geste que `need_stale` (ouvrir le
  // besoin), même genre — le libellé dit pourquoi.
  describe('need_stale — reprise de veille échue (#3389.13)', () => {
    const due = { id: 'need-hold', title: 'Chef de projet', days: 3, resumeOn: '2026-07-30' }

    it('ouvre le besoin et dit que la reprise prévue est échue, pas qu’il manque une shortlist', () => {
      const actions = buildBriefingActions({ ...EMPTY, staleNeeds: [due] })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'need:need-hold',
        kind: 'need_stale',
        href: '/projects/needs/need-hold',
        labelKey: 'briefing.actions.needResumeDue',
        labelVars: { title: 'Chef de projet' },
      })
    })

    it('dit le CRITÈRE — la date de reprise posée par l’utilisateur — dans le contexte', () => {
      const actions = buildBriefingActions({ ...EMPTY, staleNeeds: [due] })
      expect(actions[0]?.context).toEqual({
        labelKey: 'briefing.context.needResumeDue',
        labelVars: { date: '2026-07-30' },
      })
    })

    it('sans date de reprise, le besoin garde le libellé « sans shortlist » (aucun changement)', () => {
      const actions = buildBriefingActions({ ...EMPTY, staleNeeds: [{ id: 'n', title: 'T', days: 9 }] })
      expect(actions[0]?.labelKey).toBe('briefing.actions.needStale')
    })

    it('classe la reprise la plus ancienne d’abord', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleNeeds: [
          { id: 'recent', title: 'R', days: 1, resumeOn: '2026-08-01' },
          { id: 'old', title: 'O', days: 20, resumeOn: '2026-07-14' },
        ],
      })
      expect(actions.map(action => action.id)).toEqual(['need:old', 'need:recent'])
    })
  })

  // #3389 (recette prod 02/10, Y17) — la carte « la reprise prévue est échue »
  // était PRODUITE (visible dans /actions, qui ne plafonne pas) mais n'entrait
  // pas dans les sept places de /briefing : sept relances la devançaient et la
  // coupe l'évinçait. La date posée par l'utilisateur est un engagement : elle
  // cède sa place comme `mission_end`/`payment_overdue`, mais seulement à une relance.
  describe('need_stale — reprise échue face au plafond (#3389)', () => {
    const sevenFollowUps = Array.from({ length: BRIEFING_ACTIONS_MAX }, (_, index) =>
      thread({ threadId: `t${index}`, counterpart: `contact${index}@acme.com`, daysSinceLastMessage: index }),
    )

    it('une reprise échue est parmi les cartes VISIBLES (pas derrière « voir les autres ») malgré sept relances', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        awaitingReply: sevenFollowUps,
        staleNeeds: [{ id: 'need-hold', title: 'Chef de projet', days: 3, resumeOn: '2026-09-30' }],
      })
      expect(actions).toHaveLength(BRIEFING_ACTIONS_MAX)
      const rank = actions.findIndex(action => action.id === 'need:need-hold')
      expect(rank).toBeGreaterThanOrEqual(0)
      expect(rank).toBeLessThan(BRIEFING_ACTIONS_SHOWN)
    })

    it('un besoin SANS date de reprise garde son rang derrière les relances (sait dire NON)', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        awaitingReply: sevenFollowUps,
        staleNeeds: [{ id: 'need-old', title: 'Chef de projet', days: 40 }],
      })
      const rank = actions.findIndex(action => action.id === 'need:need-old')
      expect(rank === -1 || rank >= BRIEFING_ACTIONS_SHOWN).toBe(true)
    })
  })

  // #2095.2 — une mission qui approche de sa fin. `kind: 'mission_end'` existait
  // déjà au contrat (urgency-tier, role-order, i18n) ; seule la PRODUCTION
  // manquait — voir `briefing.service.ts` (appelant réel, lecture SQL sur
  // `missions.ends_on`).
  describe('mission_end (#2095.2)', () => {
    it('ouvre le dossier de la mission elle-même', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEnding: [{ id: 'mission-1', label: 'Maintenance prédictive', daysUntilEnd: 28 }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'mission-end:mission-1',
        kind: 'mission_end',
        href: '/missions/mission-1',
        labelKey: 'briefing.actions.missionEnding',
        labelVars: { label: 'Maintenance prédictive', days: 28 },
      })
    })

    it('porte un fait sourcé sur la capacité `missions`, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEnding: [{ id: 'mission-1', label: 'Maintenance prédictive', daysUntilEnd: 28 }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('missions')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('dit le CRITÈRE — l’échéance en jours — dans le contexte', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEnding: [{ id: 'mission-1', label: 'Maintenance prédictive', daysUntilEnd: 12 }],
      })
      expect(actions[0]?.context).toEqual({ labelKey: 'briefing.context.missionEnding', labelVars: { days: 12 } })
    })

    it('ouvre sur le dossier mission — un objet nommé, jamais anonyme', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEnding: [{ id: 'mission-1', label: 'Maintenance prédictive', daysUntilEnd: 28 }],
      })
      // #2097.21 — `logoUrl: null` : aucun avatar pour une mission.
      expect(actions[0]?.businessObject).toEqual({
        kind: 'mission',
        id: 'mission-1',
        name: 'Maintenance prédictive',
        logoUrl: null,
        website: null,
      })
    })

    it('n’a rien à préparer — rien ici ne rédige de plan de transition', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEnding: [{ id: 'mission-1', label: 'Maintenance prédictive', daysUntilEnd: 28 }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('classe plusieurs missions, l’échéance la plus proche d’abord', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEnding: [
          { id: 'mission-far', label: 'Lointaine', daysUntilEnd: 28 },
          { id: 'mission-close', label: 'Proche', daysUntilEnd: 3 },
        ],
      })
      expect(actions.map(action => action.id)).toEqual(['mission-end:mission-close', 'mission-end:mission-far'])
    })

    it('ne double pas une mission déjà annoncée par la fenêtre de renouvellement (#2106.8/#2107.7)', () => {
      // Une mission à J-20 est À LA FOIS « approche de sa fin » (< 30 jours,
      // #2095.2) ET dans la fenêtre j30 du renouvellement (#2106.8/#2107.7) :
      // sans ce garde-fou, `mission-end:m-1` apparaîtrait deux fois dans la
      // liste — la même mission, la même carte, comptée deux fois.
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEnding: [{ id: 'm-1', label: 'DevOps chez ACME', daysUntilEnd: 20 }],
        missionsEndingSoon: [{ id: 'm-1', title: 'DevOps chez ACME', renewal: 'j30', days: 20, thresholdDays: 30 }],
      })
      expect(actions.filter(action => action.id === 'mission-end:m-1')).toHaveLength(1)
      // La carte de renouvellement gagne : elle nomme le SEUIL atteint, plus
      // précis que la simple échéance en jours.
      expect(actions.find(action => action.id === 'mission-end:m-1')?.context).toEqual({
        labelKey: 'briefing.context.missionEndingWithin',
        labelVars: { days: 30 },
      })
    })
  })

  // #2106.8 / #2107.7 — doublon : « mission à J-30 » (producteur) et « mission
  // à J-45/J-30/J-15 » (trois seuils distincts) se livrent avec le même
  // producteur, sur `renewalWindow` (`@bellum/contracts`), la SEULE échelle du
  // dépôt — voir `briefing.service.ts` (appelant réel : lecture `missions`).
  describe('mission_end (#2106.8, #2107.7 — trois seuils distincts)', () => {
    it('ouvre la mission elle-même', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEndingSoon: [{ id: 'm-1', title: 'DevOps chez ACME', renewal: 'j30', days: 25, thresholdDays: 30 }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'mission-end:m-1',
        kind: 'mission_end',
        href: '/missions/m-1',
        labelKey: 'briefing.actions.missionEnding',
        labelVars: { title: 'DevOps chez ACME', days: 25 },
      })
    })

    it('nomme le SEUIL atteint dans le contexte — 45, 30 ou 15 — pas le compte exact de jours', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEndingSoon: [
          { id: 'm-45', title: 'A', renewal: 'j45', days: 44, thresholdDays: 45 },
          { id: 'm-30', title: 'B', renewal: 'j30', days: 21, thresholdDays: 30 },
          { id: 'm-15', title: 'C', renewal: 'j15', days: 3, thresholdDays: 15 },
        ],
      })
      const byId = new Map(actions.map(action => [action.id, action]))
      expect(byId.get('mission-end:m-45')?.context).toEqual({
        labelKey: 'briefing.context.missionEndingWithin',
        labelVars: { days: 45 },
      })
      expect(byId.get('mission-end:m-30')?.context).toEqual({
        labelKey: 'briefing.context.missionEndingWithin',
        labelVars: { days: 30 },
      })
      expect(byId.get('mission-end:m-15')?.context).toEqual({
        labelKey: 'briefing.context.missionEndingWithin',
        labelVars: { days: 15 },
      })
    })

    it('porte un fait sourcé sur la capacité `missions`, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEndingSoon: [{ id: 'm-1', title: 'DevOps chez ACME', renewal: 'j30', days: 25, thresholdDays: 30 }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('missions')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('expire à la date de fin de la mission — passé ce jour, le renouvellement n’a plus de sens', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEndingSoon: [
          {
            id: 'm-1',
            title: 'DevOps chez ACME',
            renewal: 'j30',
            days: 25,
            thresholdDays: 30,
            endsOn: '2026-08-28T00:00:00.000Z',
          },
        ],
      })
      expect(actions[0]?.expiresAt).toBe('2026-08-28T00:00:00.000Z')
    })

    it('nomme la mission comme objet ouvrable', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEndingSoon: [{ id: 'm-1', title: 'DevOps chez ACME', renewal: 'j30', days: 25, thresholdDays: 30 }],
      })
      // #2097.21 — `logoUrl: null` : aucun avatar pour une mission.
      expect(actions[0]?.businessObject).toEqual({
        kind: 'mission',
        id: 'm-1',
        name: 'DevOps chez ACME',
        logoUrl: null,
        website: null,
      })
    })

    it('n’a rien à préparer — une checklist de renouvellement suppose des étapes que rien ici ne calcule', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsEndingSoon: [{ id: 'm-1', title: 'DevOps chez ACME', renewal: 'j30', days: 25, thresholdDays: 30 }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('sans mission à échéance, absent de la liste — jamais une carte vide', () => {
      const actions = buildBriefingActions({ ...EMPTY, missionsEndingSoon: [] })
      expect(actions.filter(action => action.kind === 'mission_end')).toEqual([])
    })
  })

  // #2106.6 — un consultant dont TOUTES les affectations en cours finissent
  // sous peu (`consultantsFreeingSoon`, même fenêtre que le compteur Laura).
  // Aucune shortlist de comptes n'est fabriquée (même doctrine que
  // `need_stale`/`mission_end`) : la carte ouvre la fiche du consultant.
  describe('consultant_available (#2106.6)', () => {
    it('ouvre la fiche du consultant', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        consultantsFreeingSoon: [{ id: 'c-1', name: 'Yanis Berthier', days: 12, endsOn: '2026-08-15T00:00:00.000Z' }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'consultant-available:c-1',
        kind: 'consultant_available',
        href: '/consultants/c-1',
        labelKey: 'briefing.actions.consultantAvailable',
        labelVars: { name: 'Yanis Berthier', days: 12 },
      })
    })

    it('porte un fait sourcé sur la capacité `missions` — même source que le producteur, mission_assignments', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        consultantsFreeingSoon: [{ id: 'c-1', name: 'Yanis Berthier', days: 12, endsOn: null }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('missions')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('nomme le consultant comme objet ouvrable — kind `talent`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        consultantsFreeingSoon: [{ id: 'c-1', name: 'Yanis Berthier', days: 12, endsOn: null }],
      })
      // #2097.21 — `logoUrl: null` : aucune photo lue pour cette carte.
      expect(actions[0]?.businessObject).toEqual({
        kind: 'talent',
        id: 'c-1',
        name: 'Yanis Berthier',
        logoUrl: null,
        website: null,
      })
    })

    it('n’a rien à préparer — aucune shortlist de comptes fabriquée', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        consultantsFreeingSoon: [{ id: 'c-1', name: 'Yanis Berthier', days: 12, endsOn: null }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('expire à la date de fin de la dernière affectation', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        consultantsFreeingSoon: [{ id: 'c-1', name: 'Yanis Berthier', days: 12, endsOn: '2026-08-15T00:00:00.000Z' }],
      })
      expect(actions[0]?.expiresAt).toBe('2026-08-15T00:00:00.000Z')
    })

    it('sans consultant disponible, absent de la liste — jamais une carte vide', () => {
      const actions = buildBriefingActions({ ...EMPTY, consultantsFreeingSoon: [] })
      expect(actions.filter(action => action.kind === 'consultant_available')).toEqual([])
    })
  })

  // #2107.6 — une disponibilité saisie il y a plus de
  // `AVAILABILITY_RECONFIRM_AFTER_DAYS` jours, jamais reconfirmée depuis
  // (`TalentRoutinesService.availabilityToReconfirm`, routine déjà lue par
  // ailleurs — seule la production vers « Aujourd'hui » manquait). Même
  // doctrine que `consultant_available` : aucune shortlist fabriquée, la
  // carte ouvre la fiche du consultant, qui reconfirme lui-même sur son
  // dossier.
  describe('availability_reconfirm (#2107.6)', () => {
    it('ouvre la fiche du consultant', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        availabilityToReconfirm: [{ id: 'c-1', name: 'Yanis Berthier', days: 74 }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'availability-reconfirm:c-1',
        kind: 'availability_reconfirm',
        href: '/consultants/c-1',
        labelKey: 'briefing.actions.availabilityReconfirm',
        labelVars: { name: 'Yanis Berthier', days: 74 },
      })
    })

    it('porte un fait sourcé sur la capacité `missions` — lecture directe de `consultants`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        availabilityToReconfirm: [{ id: 'c-1', name: 'Yanis Berthier', days: 74 }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('missions')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('nomme le consultant comme objet ouvrable — kind `talent`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        availabilityToReconfirm: [{ id: 'c-1', name: 'Yanis Berthier', days: 74 }],
      })
      expect(actions[0]?.businessObject).toEqual({
        kind: 'talent',
        id: 'c-1',
        name: 'Yanis Berthier',
        logoUrl: null,
        website: null,
      })
    })

    it('n’a rien à préparer — aucune shortlist fabriquée', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        availabilityToReconfirm: [{ id: 'c-1', name: 'Yanis Berthier', days: 74 }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('sans disponibilité à reconfirmer, absent de la liste — jamais une carte vide', () => {
      const actions = buildBriefingActions({ ...EMPTY, availabilityToReconfirm: [] })
      expect(actions.filter(action => action.kind === 'availability_reconfirm')).toEqual([])
    })

    it('sans le champ (appelant antérieur à #2107.6), absent de la liste', () => {
      const actions = buildBriefingActions({ ...EMPTY })
      expect(actions.filter(action => action.kind === 'availability_reconfirm')).toEqual([])
    })
  })

  // #2107.8 — une mission ACTIVE sans date de fin : `mission_end` (#2095.2) et
  // la fenêtre de renouvellement (#2106.8/#2107.7) l'EXCLUENT explicitement
  // (`ends_on IS NOT NULL` côté requête, `routine-catalog.ts` « n'alerte
  // jamais ») — sans cette carte, une mission sans date reste invisible du
  // brief pour toujours, jamais parce qu'elle est saine.
  describe('mission_no_end_date (#2107.8)', () => {
    it('ouvre le dossier de la mission elle-même', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsWithoutEndDate: [{ id: 'mission-9', label: 'Support N2' }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'mission-no-end-date:mission-9',
        kind: 'mission_no_end_date',
        href: '/missions/mission-9',
        labelKey: 'briefing.actions.missionNoEndDate',
        labelVars: { label: 'Support N2' },
      })
    })

    it('porte un fait sourcé sur la capacité `missions`, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsWithoutEndDate: [{ id: 'mission-9', label: 'Support N2' }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('missions')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('ouvre sur le dossier mission — un objet nommé, jamais anonyme', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsWithoutEndDate: [{ id: 'mission-9', label: 'Support N2' }],
      })
      expect(actions[0]?.businessObject).toEqual({
        kind: 'mission',
        id: 'mission-9',
        name: 'Support N2',
        logoUrl: null,
        website: null,
      })
    })

    it('n’a rien à préparer — rien ici ne devine une date', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        missionsWithoutEndDate: [{ id: 'mission-9', label: 'Support N2' }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
      expect(actions[0]?.expiresAt).toBeNull()
    })

    it('sans mission sans date, absente de la liste — jamais une carte vide', () => {
      const actions = buildBriefingActions({ ...EMPTY, missionsWithoutEndDate: [] })
      expect(actions.filter(action => action.kind === 'mission_no_end_date')).toEqual([])
    })

    it('sans le champ (appelant antérieur à #2107.8), absente de la liste', () => {
      const actions = buildBriefingActions({ ...EMPTY })
      expect(actions.filter(action => action.kind === 'mission_no_end_date')).toEqual([])
    })
  })

  // #2107.15 — un connecteur CONNECTÉ mais DÉGRADÉ (droit d'écriture retiré) :
  // les routines se désactivent en silence (`requires: [...]`), aucune n'alerte
  // sur la panne elle-même. Même prédicat que `RoutinesService.connectorHealth`
  // (`read_only`), mais lu ici directement sur `AgendaService`/`MailboxService`
  // — déjà injectés dans `BriefingService`, aucun import cross-module de plus
  // (GA-07). Scope volontairement limité à `mailbox`/`agenda` : `crm` demande un
  // service que `BriefingService` n'a pas, hors de ce lot. La déconnexion pure
  // n'entre pas ici : elle est déjà montrée par les blocs agenda/mail eux-mêmes
  // (`state: 'not_connected'`) — la doubler serait un second rendu du même fait.
  describe('connector_broken (#2107.15)', () => {
    it('ouvre la page des intégrations — messagerie en lecture seule', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        brokenConnectors: [{ tool: 'mailbox', state: 'read_only' }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'connector-broken:mailbox',
        kind: 'connector_broken',
        href: '/integrations',
        labelKey: 'briefing.actions.connectorBrokenMailbox',
      })
    })

    it('ouvre la page des intégrations — agenda en lecture seule', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        brokenConnectors: [{ tool: 'agenda', state: 'read_only' }],
      })
      expect(actions[0]).toMatchObject({
        id: 'connector-broken:agenda',
        kind: 'connector_broken',
        href: '/integrations',
        labelKey: 'briefing.actions.connectorBrokenAgenda',
      })
    })

    it('porte un fait sourcé sur la capacité du connecteur concerné, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        brokenConnectors: [{ tool: 'mailbox', state: 'read_only' }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('mailbox')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('aucun dossier par connecteur — pas de businessObject', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        brokenConnectors: [{ tool: 'mailbox', state: 'read_only' }],
      })
      expect(actions[0]?.businessObject).toBeNull()
    })

    it('n’a rien à préparer — reconnecter n’est pas une préparation', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        brokenConnectors: [{ tool: 'mailbox', state: 'read_only' }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('sans connecteur cassé, absent de la liste — jamais une carte vide', () => {
      const actions = buildBriefingActions({ ...EMPTY, brokenConnectors: [] })
      expect(actions.filter(action => action.kind === 'connector_broken')).toEqual([])
    })

    it('sans le champ (appelant antérieur à #2107.15), absent de la liste', () => {
      const actions = buildBriefingActions({ ...EMPTY })
      expect(actions.filter(action => action.kind === 'connector_broken')).toEqual([])
    })
  })

  // #2107.10 — une mission entre dans sa fenêtre de renouvellement
  // (#2106.8/#2107.7) ET AUCUNE conversation n'a été engagée
  // (`missions.renewal_status IS NULL OR 'non_engage'`, `mission.ts`
  // RENEWAL_STATUSES). Un genre DISTINCT de `mission_end` : la même échéance,
  // mais un fait différent (rien n'a commencé), plus actionnable.
  describe('renewal_not_engaged (#2107.10)', () => {
    it('ouvre le dossier de la mission elle-même', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        renewalsNotEngaged: [{ id: 'mission-3', title: 'Support N1', days: 20 }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'renewal-not-engaged:mission-3',
        kind: 'renewal_not_engaged',
        href: '/missions/mission-3',
        labelKey: 'briefing.actions.renewalNotEngaged',
        labelVars: { title: 'Support N1', days: 20 },
      })
    })

    it('porte un fait sourcé sur la capacité `missions`, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        renewalsNotEngaged: [{ id: 'mission-3', title: 'Support N1', days: 20 }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('missions')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('ouvre sur le dossier mission — un objet nommé, jamais anonyme', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        renewalsNotEngaged: [{ id: 'mission-3', title: 'Support N1', days: 20 }],
      })
      expect(actions[0]?.businessObject).toEqual({
        kind: 'mission',
        id: 'mission-3',
        name: 'Support N1',
        logoUrl: null,
        website: null,
      })
    })

    it('n’a rien à préparer — engager la conversation est un geste humain', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        renewalsNotEngaged: [{ id: 'mission-3', title: 'Support N1', days: 20 }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('sans mission au renouvellement non engagé, absente de la liste', () => {
      const actions = buildBriefingActions({ ...EMPTY, renewalsNotEngaged: [] })
      expect(actions.filter(action => action.kind === 'renewal_not_engaged')).toEqual([])
    })

    it('sans le champ (appelant antérieur à #2107.10), absente de la liste', () => {
      const actions = buildBriefingActions({ ...EMPTY })
      expect(actions.filter(action => action.kind === 'renewal_not_engaged')).toEqual([])
    })
  })

  // #2107.4 — un profil ENVOYÉ chez un client (`submissions.substatus =
  // 'presented'`, `submission.ts`) sans AUCUN retour depuis plus de
  // {@link SUBMISSION_NO_RESPONSE_AFTER_DAYS} jours (`first_feedback_at IS
  // NULL` — « toujours rien, une information, pas un trou »). La fiche du
  // consultant s'ouvre ; aucun dossier par soumission n'existe.
  describe('submission_no_response (#2107.4)', () => {
    it('ouvre la fiche du consultant', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        submissionsWithoutResponse: [{ consultantId: 'c-1', consultantName: 'Karim Belaïd', days: 9 }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'submission-no-response:c-1',
        kind: 'submission_no_response',
        href: '/consultants/c-1',
        labelKey: 'briefing.actions.submissionNoResponse',
        labelVars: { name: 'Karim Belaïd', days: 9 },
      })
    })

    it('porte un fait sourcé sur la capacité `missions`, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        submissionsWithoutResponse: [{ consultantId: 'c-1', consultantName: 'Karim Belaïd', days: 9 }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('missions')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('nomme le consultant comme objet ouvrable — kind `talent`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        submissionsWithoutResponse: [{ consultantId: 'c-1', consultantName: 'Karim Belaïd', days: 9 }],
      })
      expect(actions[0]?.businessObject).toEqual({
        kind: 'talent',
        id: 'c-1',
        name: 'Karim Belaïd',
        logoUrl: null,
        website: null,
      })
    })

    it('n’a rien à préparer — relancer le client est un geste humain', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        submissionsWithoutResponse: [{ consultantId: 'c-1', consultantName: 'Karim Belaïd', days: 9 }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('sans profil sans retour, absent de la liste — jamais une carte vide', () => {
      const actions = buildBriefingActions({ ...EMPTY, submissionsWithoutResponse: [] })
      expect(actions.filter(action => action.kind === 'submission_no_response')).toEqual([])
    })

    it('sans le champ (appelant antérieur à #2107.4), absent de la liste', () => {
      const actions = buildBriefingActions({ ...EMPTY })
      expect(actions.filter(action => action.kind === 'submission_no_response')).toEqual([])
    })
  })

  // #2107.14 — un appel d'offres porte au moins une exigence OBLIGATOIRE non
  // couverte (`computeRfpCompliance(requirements).mandatoryUnanswered > 0`,
  // `@bellum/contracts`, fonction PURE déjà utilisée côté écran). Ouvre la
  // liste des AO — même dossier, même geste que `rfp_due` : aucune fiche PAR
  // appel d'offres n'existe.
  describe('rfp_requirement_gap (#2107.14)', () => {
    it('ouvre la liste des appels d’offres — aucun dossier dédié n’existe', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        rfpsWithUncoveredRequirements: [{ id: 'rfp-1', title: 'Consultation infra', count: 2 }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'rfp-requirement-gap:rfp-1',
        kind: 'rfp_requirement_gap',
        href: '/rfp',
        labelKey: 'briefing.actions.rfpRequirementGap',
        labelVars: { title: 'Consultation infra', count: 2 },
      })
    })

    it('porte un fait sourcé sur la capacité `rfps`, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        rfpsWithUncoveredRequirements: [{ id: 'rfp-1', title: 'Consultation infra', count: 2 }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('rfps')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('aucun dossier par appel d’offres — pas de businessObject', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        rfpsWithUncoveredRequirements: [{ id: 'rfp-1', title: 'Consultation infra', count: 2 }],
      })
      expect(actions[0]?.businessObject).toBeNull()
    })

    it('n’a rien à préparer — produire une réponse est un geste humain', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        rfpsWithUncoveredRequirements: [{ id: 'rfp-1', title: 'Consultation infra', count: 2 }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('sans exigence non couverte, absent de la liste — jamais une carte vide', () => {
      const actions = buildBriefingActions({ ...EMPTY, rfpsWithUncoveredRequirements: [] })
      expect(actions.filter(action => action.kind === 'rfp_requirement_gap')).toEqual([])
    })

    it('sans le champ (appelant antérieur à #2107.14), absent de la liste', () => {
      const actions = buildBriefingActions({ ...EMPTY })
      expect(actions.filter(action => action.kind === 'rfp_requirement_gap')).toEqual([])
    })
  })

  // #2107.18 — un compte ACTIF sans propriétaire assigné (`accounts.
  // assigned_to IS NULL`) : une zone blanche au niveau INDIVIDUEL, ouvrable
  // directement (`/accounts/:id`), distincte de la carte de couverture par
  // SEGMENT du Manager (`ManagerService.coverageMap`).
  describe('account_no_owner (#2107.18)', () => {
    it('ouvre la fiche du compte', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        accountsWithoutOwner: [{ id: 'acc-1', companyName: 'ACME' }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'account-no-owner:acc-1',
        kind: 'account_no_owner',
        href: '/accounts/acc-1',
        labelKey: 'briefing.actions.accountNoOwner',
        labelVars: { company: 'ACME' },
      })
    })

    it('porte un fait sourcé sur la capacité `accounts`, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        accountsWithoutOwner: [{ id: 'acc-1', companyName: 'ACME' }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('accounts')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('nomme le compte via businessObject — la SEULE famille où il existe déjà', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        accountsWithoutOwner: [{ id: 'acc-1', companyName: 'ACME' }],
      })
      expect(actions[0]?.businessObject).toEqual({
        kind: 'account',
        id: 'acc-1',
        name: 'ACME',
        logoUrl: null,
        website: null,
      })
    })

    it('lu directement sur `assigned_to` — jamais une déduction', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        accountsWithoutOwner: [{ id: 'acc-1', companyName: 'ACME' }],
      })
      expect(actions[0]?.confidence).toBe('verified')
    })

    it('sans compte sans propriétaire, absent de la liste — jamais une carte vide', () => {
      const actions = buildBriefingActions({ ...EMPTY, accountsWithoutOwner: [] })
      expect(actions.filter(action => action.kind === 'account_no_owner')).toEqual([])
    })

    it('sans le champ (appelant antérieur à #2107.18), absent de la liste', () => {
      const actions = buildBriefingActions({ ...EMPTY })
      expect(actions.filter(action => action.kind === 'account_no_owner')).toEqual([])
    })
  })

  // #2106.9/#2107.1 (doublon, épopée #2801) — une affaire EN JEU sans AUCUNE
  // tâche encore ouverte qui lui soit rattachée (`pipelineHealth`, raison
  // `without_next_action` — la MÊME lecture que la carte du pipe, #1325).
  // Bloqué jusqu'à #2801 : sans `/projects/$id`, la carte n'avait aucun
  // dossier où ouvrir.
  describe('project_no_next_action (#2106.9, #2107.1)', () => {
    it('ouvre le dossier du projet', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        projectsWithoutNextAction: [{ id: 'p-1', label: 'Portail transporteurs', companyName: 'ACME' }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'project-no-next-action:p-1',
        kind: 'project_no_next_action',
        href: '/projects/p-1',
        labelKey: 'briefing.actions.projectNoNextAction',
        labelVars: { label: 'Portail transporteurs', company: 'ACME' },
      })
    })

    it('nomme le projet via businessObject', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        projectsWithoutNextAction: [{ id: 'p-1', label: 'Portail transporteurs', companyName: 'ACME' }],
      })
      expect(actions[0]?.businessObject).toEqual({
        kind: 'project',
        id: 'p-1',
        name: 'Portail transporteurs',
        logoUrl: null,
        website: null,
      })
    })

    it('ne fabrique aucun artefact — deviner LA prochaine action est interdit', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        projectsWithoutNextAction: [{ id: 'p-1', label: 'Portail transporteurs', companyName: 'ACME' }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('sans affaire concernée, absente de la liste — jamais une carte vide', () => {
      const actions = buildBriefingActions({ ...EMPTY, projectsWithoutNextAction: [] })
      expect(actions.filter(action => action.kind === 'project_no_next_action')).toEqual([])
    })
  })

  // #2107.2 (épopée #2801) — une affaire EN JEU dont la fraîcheur a dépassé
  // le seuil de l'ontologie (`pipelineHealth`, raisons `ageing`/`stale` — la
  // MÊME lecture que la carte du pipe), jamais recalculée ici.
  describe('project_stale (#2107.2)', () => {
    it('ouvre le dossier du projet', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleProjects: [{ id: 'p-2', label: 'Schéma directeur data', companyName: 'ACME', days: 45 }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'project-stale:p-2',
        kind: 'project_stale',
        href: '/projects/p-2',
        labelKey: 'briefing.actions.projectStale',
        labelVars: { label: 'Schéma directeur data', company: 'ACME', days: 45 },
      })
    })

    it('nomme le projet via businessObject', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleProjects: [{ id: 'p-2', label: 'Schéma directeur data', companyName: 'ACME', days: 45 }],
      })
      expect(actions[0]?.businessObject).toEqual({
        kind: 'project',
        id: 'p-2',
        name: 'Schéma directeur data',
        logoUrl: null,
        website: null,
      })
    })

    it('dit le CRITÈRE — les jours écoulés — dans le contexte', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleProjects: [{ id: 'p-2', label: 'Schéma directeur data', companyName: 'ACME', days: 45 }],
      })
      expect(actions[0]?.context).toEqual({ labelKey: 'briefing.context.projectStale', labelVars: { days: 45 } })
    })

    it('ne fabrique aucun artefact — deviner LE geste de relance est interdit', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleProjects: [{ id: 'p-2', label: 'Schéma directeur data', companyName: 'ACME', days: 45 }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('classe la plus ancienne en premier', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        staleProjects: [
          { id: 'p-a', label: 'Affaire récente', companyName: 'ACME', days: 32 },
          { id: 'p-b', label: 'Affaire ancienne', companyName: 'ACME', days: 190 },
        ],
      })
      expect(actions.map(action => action.id)).toEqual(['project-stale:p-b', 'project-stale:p-a'])
    })

    it('sans affaire concernée, absente de la liste — jamais une carte vide', () => {
      const actions = buildBriefingActions({ ...EMPTY, staleProjects: [] })
      expect(actions.filter(action => action.kind === 'project_stale')).toEqual([])
    })

    it('sans le champ (appelant antérieur à #2107.2), absente de la liste', () => {
      const actions = buildBriefingActions({ ...EMPTY })
      expect(actions.filter(action => action.kind === 'project_stale')).toEqual([])
    })
  })

  // #2095.7 — un paiement client est en retard. `unsettledInvoiceSql`
  // (`invoice-settlement.ts`) est le MÊME prédicat que `mission-scores.service`
  // (`overdue_invoices`) — voir `briefing.service.ts` (appelant réel).
  describe('payment_overdue (#2095.7)', () => {
    it('ouvre le dossier de la mission dont la facture est en retard', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        overdueInvoices: [{ id: 'mission-1', label: 'Maintenance prédictive', daysOverdue: 14 }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'payment:mission-1',
        kind: 'payment_overdue',
        href: '/missions/mission-1',
        labelKey: 'briefing.actions.paymentOverdue',
        labelVars: { label: 'Maintenance prédictive', days: 14 },
      })
    })

    // #3671.6 — recette prod 09/10 : « paiement en retard de 68 jours » (carte) et « facture du mois 2026-06 :
    // échéance dépassée depuis 31 jours » (intervention) sur la MÊME mission = deux factures, dont la carte
    // ne nommait pas le mois. Quand le mois est connu, le titre le dit ; sinon, l'ancien libellé, rien de deviné.
    it('#3671.6 — nomme le mois de la facture quand il est connu', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        overdueInvoices: [
          { id: 'mission-1', label: 'Maintenance prédictive', daysOverdue: 68, periodMonth: '2026-05' },
        ],
      })
      expect(actions[0]).toMatchObject({
        labelKey: 'briefing.actions.paymentOverdueMonth',
        labelVars: { label: 'Maintenance prédictive', days: 68, month: '2026-05' },
      })
    })

    it('#3671.6 — sans mois connu, garde le libellé sans mois (jamais un mois inventé)', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        overdueInvoices: [{ id: 'mission-1', label: 'Maintenance prédictive', daysOverdue: 68, periodMonth: null }],
      })
      expect(actions[0]).toMatchObject({ labelKey: 'briefing.actions.paymentOverdue' })
      expect(actions[0]?.labelVars).not.toHaveProperty('month')
    })

    it('porte un fait sourcé sur la capacité `invoices`, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        overdueInvoices: [{ id: 'mission-1', label: 'Maintenance prédictive', daysOverdue: 14 }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('invoices')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('dit le CRITÈRE — le retard en jours — dans le contexte, jamais un montant', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        overdueInvoices: [{ id: 'mission-1', label: 'Maintenance prédictive', daysOverdue: 21 }],
      })
      expect(actions[0]?.context).toEqual({ labelKey: 'briefing.context.paymentOverdue', labelVars: { days: 21 } })
    })

    it('ouvre sur le dossier mission — un objet nommé, jamais anonyme', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        overdueInvoices: [{ id: 'mission-1', label: 'Maintenance prédictive', daysOverdue: 14 }],
      })
      // #2097.21 — `logoUrl: null` : aucun avatar pour une mission.
      expect(actions[0]?.businessObject).toEqual({
        kind: 'mission',
        id: 'mission-1',
        name: 'Maintenance prédictive',
        logoUrl: null,
        website: null,
      })
    })

    it('n’a rien à préparer — aucune relance n’est rédigée ici', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        overdueInvoices: [{ id: 'mission-1', label: 'Maintenance prédictive', daysOverdue: 14 }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('classe plusieurs retards, le plus ancien d’abord', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        overdueInvoices: [
          { id: 'mission-recent', label: 'Récent', daysOverdue: 3 },
          { id: 'mission-old', label: 'Ancien', daysOverdue: 40 },
        ],
      })
      expect(actions.map(action => action.id)).toEqual(['payment:mission-old', 'payment:mission-recent'])
    })

    /**
     * #2993 (lot V35, recette écran du 28/09 soir) — CONSTAT PRODUCTION : sur
     * « Aujourd'hui », une facture à 34 j de retard se classait AVANT deux
     * factures à 57 j — sans que rien à l'écran ne dise pourquoi (le lien
     * « Pourquoi ? » justifie la carte, pas son rang).
     *
     * Vérifié d'abord si le tri lui-même était en cause (montant, échéance,
     * autre critère) : NON — `compareBriefingActions` trie bien par échéance
     * (le retard le plus ancien d'abord, voir le test juste au-dessus). La
     * cause est `protectFromFollowUpEviction` (#2095.2/#2095.7) : quand PLUS
     * D'UN paiement en retard est évincé du plafond (`BRIEFING_ACTIONS_MAX`)
     * par des relances (`follow_up`, priorité 4) puis réintégré en cédant la
     * place des relances les moins prioritaires, la boucle d'origine
     * réinsérait chaque paiement à l'index `findLastIndex` du dernier
     * `follow_up` RESTANT — un index qui recule à CHAQUE réinsertion — ce qui
     * INVERSAIT l'ordre relatif des paiements réintégrés entre eux. Le tri
     * final (`kept.sort(compareBriefingActions)`) est STABLE et les paiements
     * partagent la même priorité/confiance/poids d'axes : il ne pouvait pas
     * corriger cette inversion, il ne fait que la reproduire.
     *
     * Sept relances DIFFÉRENTES remplissent déjà les sept places du plafond
     * (même mécanisme que la recette du 24/09 documentée sur
     * `protectFromFollowUpEviction`) : les DEUX paiements en retard sont donc
     * évincés puis réintégrés — le cas exact qui inversait leur ordre.
     */
    it('#2993 — deux paiements en retard ÉVINCÉS PUIS RÉINTÉGRÉS restent classés le plus ancien d’abord', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        awaitingReply: Array.from({ length: BRIEFING_ACTIONS_MAX }, (_, index) =>
          thread({ threadId: `t${index}`, counterpart: `contact${index}@acme.com`, daysSinceLastMessage: index }),
        ),
        overdueInvoices: [
          { id: 'mission-57', label: 'Le plus ancien', daysOverdue: 57 },
          { id: 'mission-34', label: 'Le plus récent', daysOverdue: 34 },
        ],
      })

      const paymentIds = actions.filter(action => action.kind === 'payment_overdue').map(action => action.id)
      expect(paymentIds).toEqual(['payment:mission-57', 'payment:mission-34'])
    })

    // #3671.1 — même cause que le conflit juste au-dessus : `readAt` (l'instant
    // du brief) datait le fait d'un impayé, jamais son ÉCHÉANCE. Une facture
    // encore en retard le lendemain voit `daysOverdue` croître de 1 EXACTEMENT
    // comme `now` avance d'un jour : l'échéance recalculée (`now - daysOverdue`)
    // doit donc rester IDENTIQUE d'une lecture à l'autre, qu'elles se fassent le
    // même jour ou le lendemain — sinon « Donnée fausse » ne tient jamais.
    it('le fait d’un impayé ne change pas avec l’instant de lecture, même le lendemain', () => {
      const sameDayLater = buildBriefingActions({
        ...EMPTY,
        now: new Date(NOW.getTime() + 3600_000),
        overdueInvoices: [{ id: 'mission-1', label: 'Maintenance prédictive', daysOverdue: 14 }],
      })
      const firstRead = buildBriefingActions({
        ...EMPTY,
        now: NOW,
        overdueInvoices: [{ id: 'mission-1', label: 'Maintenance prédictive', daysOverdue: 14 }],
      })
      const nextDay = buildBriefingActions({
        ...EMPTY,
        now: new Date(NOW.getTime() + 24 * 3600_000),
        overdueInvoices: [{ id: 'mission-1', label: 'Maintenance prédictive', daysOverdue: 15 }],
      })
      expect(firstRead[0]?.fact?.provenance.observedAt).not.toBeNull()
      expect(firstRead[0]?.fact?.provenance.observedAt).toEqual(sameDayLater[0]?.fact?.provenance.observedAt)
      expect(firstRead[0]?.fact?.provenance.observedAt).toEqual(nextDay[0]?.fact?.provenance.observedAt)
    })
  })

  // #2095.8 — un appel d'offres approche de son échéance. Même prédicat que
  // `laura-probe.service.ts` (`rfpsDueWithGaps`) — voir `briefing.service.ts`
  // (appelant réel, lecture SQL sur `rfps.due_at`).
  describe('rfp_due (#2095.8)', () => {
    it('ouvre la liste des appels d’offres — aucun dossier dédié n’existe', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        rfpsDueSoon: [{ id: 'rfp-1', title: 'Consultation infra', daysUntilDue: 2 }],
      })
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        id: 'rfp:rfp-1',
        kind: 'rfp_due',
        href: '/rfp',
        labelKey: 'briefing.actions.rfpDue',
        labelVars: { title: 'Consultation infra', days: 2 },
      })
    })

    it('porte un fait sourcé sur la capacité `rfps`, jamais `null`', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        rfpsDueSoon: [{ id: 'rfp-1', title: 'Consultation infra', daysUntilDue: 2 }],
      })
      expect(actions[0]?.fact?.provenance.capability).toBe('rfps')
      expect(actions[0]?.fact?.provenance.source).toBe('pipeline')
    })

    it('dit le CRITÈRE — l’échéance en jours — dans le contexte', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        rfpsDueSoon: [{ id: 'rfp-1', title: 'Consultation infra', daysUntilDue: 1 }],
      })
      expect(actions[0]?.context).toEqual({ labelKey: 'briefing.context.rfpDue', labelVars: { days: 1 } })
    })

    it('n’ouvre aucun dossier nommé — aucun genre `rfp` au contrat', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        rfpsDueSoon: [{ id: 'rfp-1', title: 'Consultation infra', daysUntilDue: 2 }],
      })
      expect(actions[0]?.businessObject).toBeNull()
    })

    it('n’a rien à préparer — aucune réponse n’est rédigée ici', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        rfpsDueSoon: [{ id: 'rfp-1', title: 'Consultation infra', daysUntilDue: 2 }],
      })
      expect(actions[0]?.preparedArtifacts).toEqual([])
    })

    it('classe plusieurs AO, l’échéance la plus proche d’abord', () => {
      const actions = buildBriefingActions({
        ...EMPTY,
        rfpsDueSoon: [
          { id: 'rfp-far', title: 'Lointain', daysUntilDue: 3 },
          { id: 'rfp-close', title: 'Proche', daysUntilDue: 1 },
        ],
      })
      expect(actions.map(action => action.id)).toEqual(['rfp:rfp-close', 'rfp:rfp-far'])
    })
  })
})

describe('selectMeetingsToPrepare', () => {
  it('retient les rendez-vous externes des 24 prochaines heures', () => {
    const selected = selectMeetingsToPrepare([event({ id: 'm1' })], NOW)
    expect(selected.map(meeting => meeting.id)).toEqual(['m1'])
  })

  it('écarte un point interne — il n’y a rien à préparer', () => {
    const selected = selectMeetingsToPrepare([event({ id: 'm1', isExternal: false })], NOW)
    expect(selected).toEqual([])
  })

  it('écarte un rendez-vous déjà passé', () => {
    const selected = selectMeetingsToPrepare([event({ id: 'm1', start: '2026-08-03T05:00:00.000Z' })], NOW)
    expect(selected).toEqual([])
  })

  it('écarte un rendez-vous annulé', () => {
    const selected = selectMeetingsToPrepare([event({ id: 'm1', cancelled: true })], NOW)
    expect(selected).toEqual([])
  })

  it('écarte un rendez-vous au-delà de l’horizon', () => {
    const selected = selectMeetingsToPrepare([event({ id: 'm1', start: '2026-08-06T09:00:00.000Z' })], NOW)
    expect(selected).toEqual([])
  })
})

// #2095.12 (épopée #2993) — la moitié PASSÉE de `selectMeetingsToPrepare`,
// mêmes cinq cas, sur la fenêtre inverse.
describe('selectEndedMeetingsAwaitingFollowup', () => {
  it('retient un rendez-vous externe terminé dans la fenêtre de rattrapage', () => {
    const selected = selectEndedMeetingsAwaitingFollowup(
      [event({ id: 'm1', start: '2026-08-03T05:00:00.000Z', end: '2026-08-03T06:00:00.000Z' })],
      NOW,
    )
    expect(selected.map(meeting => meeting.id)).toEqual(['m1'])
  })

  it('écarte un point interne — rien à rattraper', () => {
    const selected = selectEndedMeetingsAwaitingFollowup(
      [event({ id: 'm1', start: '2026-08-03T05:00:00.000Z', end: '2026-08-03T06:00:00.000Z', isExternal: false })],
      NOW,
    )
    expect(selected).toEqual([])
  })

  it('écarte un rendez-vous pas encore terminé', () => {
    const selected = selectEndedMeetingsAwaitingFollowup([event({ id: 'm1' })], NOW)
    expect(selected).toEqual([])
  })

  it('écarte un rendez-vous annulé', () => {
    const selected = selectEndedMeetingsAwaitingFollowup(
      [event({ id: 'm1', start: '2026-08-03T05:00:00.000Z', end: '2026-08-03T06:00:00.000Z', cancelled: true })],
      NOW,
    )
    expect(selected).toEqual([])
  })

  it('écarte un rendez-vous terminé au-delà de la fenêtre de rattrapage', () => {
    const selected = selectEndedMeetingsAwaitingFollowup(
      [event({ id: 'm1', start: '2026-08-01T05:00:00.000Z', end: '2026-08-01T06:00:00.000Z' })],
      NOW,
    )
    expect(selected).toEqual([])
  })
})

/**
 * CE QU'UNE CARTE DIT D'ELLE-MÊME.
 *
 * Une carte portait une phrase et une destination. Elle ne disait ni d'où
 * venait son fait, ni depuis quand, ni pourquoi elle tombait AUJOURD'HUI. Ces
 * tests tiennent les invariants, pas les phrases : ce qui compte est qu'une
 * carte qui PEUT dire sa source la dise, et qu'une carte qui ne le peut pas
 * rende `null` plutôt qu'une source plausible.
 */
describe('buildBriefingActions — le contrat de carte', () => {
  const CARD_INPUT = {
    ...EMPTY,
    // #2106.2 — un participant externe RÉEL : c'est la donnée que le
    // producteur de l'artefact du rendez-vous compile (voir plus bas).
    meetings: [
      event({
        id: 'm1',
        attendees: [{ email: 'client@acme.com', displayName: null, responseStatus: null, external: true }],
      }),
    ],
    conflicts: [{ first: event({ id: 'a' }), second: event({ id: 'b' }), overlapMinutes: 30 }],
    awaitingReply: [thread({ threadId: 't1' })],
    positiveReplies: [thread({ threadId: 'p1', lastDirection: 'inbound' as const })],
    accountsWithFreshSignal: [
      { accountId: 'acc1', companyName: 'ACME', detectedAt: '2026-08-02T18:00:00.000Z', detectionExact: true },
    ],
  }

  it('chaque carte qui porte un fait porte AUSSI sa source — jamais l’un sans l’autre', () => {
    // « Un fait sans source ne s'affiche pas comme un fait. » Le contrat le
    // rend impossible ; ce test vérifie que le producteur ne triche pas en
    // rendant `fact: null` partout — au moins une carte doit en porter un.
    const actions = buildBriefingActions(CARD_INPUT)
    expect(actions.length).toBeGreaterThan(0)
    const withFact = actions.filter(action => action.fact !== null)
    expect(withFact.length).toBeGreaterThan(0)
    for (const action of withFact) {
      expect(action.fact?.provenance.capability).toBeTruthy()
      expect(action.fact?.provenance.source).toBeTruthy()
    }
  })

  it('#2095.19 / #2993 — chaque carte porte SON lecteur, jamais un tiers', () => {
    const actions = buildBriefingActions({ ...CARD_INPUT, ownerId: 'user-1' })
    expect(actions.length).toBeGreaterThan(0)
    for (const action of actions) {
      expect(action.owner).toBe('user-1')
    }
  })

  it('#2095.19 — sans lecteur connu, `owner` rend l’absence, jamais un lecteur deviné', () => {
    for (const action of buildBriefingActions(CARD_INPUT)) {
      expect(action.owner).toBeNull()
    }
  })

  it('#2095.34 / #2993 — `permission` reste nul : aucune carte n’exige un droit distinct du lecteur', () => {
    for (const action of buildBriefingActions({ ...CARD_INPUT, ownerId: 'user-1' })) {
      expect(action.permission).toBeNull()
    }
  })

  it('ne nomme QUE des capacités déclarées au contrat — pas un éditeur, pas une invention', () => {
    for (const action of buildBriefingActions(CARD_INPUT)) {
      if (!action.fact) continue
      expect(BRIEFING_FACT_CAPABILITIES).toContain(action.fact.provenance.capability)
    }
  })

  it('un fil sans date de dernier message rend `observedAt` à null, jamais à aujourd’hui', () => {
    // Le défaut que ce contrat existe pour empêcher : dater un fait qu'on n'a
    // pas su dater. « Non mesuré » n'est jamais « aujourd'hui ».
    const actions = buildBriefingActions({
      ...EMPTY,
      awaitingReply: [thread({ threadId: 'sans-date', lastMessageAt: null })],
    })
    expect(actions[0]?.fact?.provenance.observedAt).toBeNull()
  })

  it('un compte dont la détection est illisible ne se voit inventer ni date ni péremption', () => {
    const actions = buildBriefingActions({
      ...EMPTY,
      accountsWithFreshSignal: [{ accountId: 'acc1', companyName: 'ACME', detectedAt: null, detectionExact: true }],
    })
    expect(actions[0]?.fact?.provenance.observedAt).toBeNull()
    expect(actions[0]?.expiresAt).toBeNull()
  })

  it('date la péremption de ce qui EXPIRE, et laisse null ce qui n’expire pas', () => {
    const actions = buildBriefingActions(CARD_INPUT)
    const byKind = new Map(actions.map(action => [action.kind, action]))
    // Un rendez-vous à préparer cesse de l'être quand il commence.
    expect(byKind.get('meeting_prep')?.expiresAt).toBe('2026-08-03T09:00:00.000Z')
    // Un silence de neuf jours ne cesse pas d'être vrai à une heure connue.
    expect(byKind.get('follow_up')?.expiresAt).toBeNull()
  })

  it('dit POURQUOI la carte tombe aujourd’hui — le critère de sélection, pas un commentaire', () => {
    const actions = buildBriefingActions(CARD_INPUT)
    // Le genre de la carte fautive est DANS la valeur comparée : jest n'accepte
    // pas de message sur `expect`, donc sans lui un échec dirait « null n'est
    // pas non-null » et il faudrait le déboguer.
    const withoutContext = actions.filter(action => action.context === null).map(action => action.kind)
    expect(withoutContext).toEqual([])
    for (const action of actions) {
      expect(BRIEFING_CONTEXT_LABEL_KEYS).toContain(action.context?.labelKey)
    }
  })

  it('#2106.2 — seul le rendez-vous prépare un artefact RÉEL ; les autres cartes restent vides tant que rien ne les prépare', () => {
    // Le défaut n°1 du dépôt est du code juste que personne n'appelle. Son
    // miroir serait un champ rempli par un producteur INVENTÉ. Cette garde
    // sait dire NON dans les deux sens : elle rougirait si le rendez-vous ne
    // compilait plus la liste de ses participants externes RÉELS, et elle
    // rougirait tout autant si une autre carte se mettait à fabriquer un
    // artefact sans donnée réelle pour le justifier.
    const actions = buildBriefingActions(CARD_INPUT)
    const byKind = new Map(actions.map(action => [action.kind, action]))
    expect(byKind.get('meeting_prep')?.preparedArtifacts).toEqual([
      {
        id: 'shortlist:m1',
        kind: 'shortlist',
        labelKey: 'briefing.artifacts.meetingAttendees',
        labelVars: { count: 1 },
        href: null,
        // #2106.12 à #2106.19 — les sept champs dédiés, à leur valeur honnête.
        businessObject: null,
        preparedAt: NOW.toISOString(),
        version: 1,
        source: 'connector',
        status: 'ready',
        preparedBy: 'laura',
        creditsCost: null,
      },
    ])
    for (const kind of ['conflict', 'reply', 'follow_up', 'account'] as const) {
      expect(byKind.get(kind)?.preparedArtifacts).toEqual([])
    }
  })

  it('#2106.2 — sans participant externe connu, rien à compiler : pas de liste inventée', () => {
    const actions = buildBriefingActions({
      ...EMPTY,
      meetings: [event({ id: 'm2', attendees: [] })],
    })
    expect(actions[0]?.preparedArtifacts).toEqual([])
  })

  it('classe jusqu’au plafond et n’en fabrique jamais pour remplir', () => {
    const many = buildBriefingActions({
      ...EMPTY,
      awaitingReply: Array.from({ length: 12 }, (_, index) =>
        thread({ threadId: `t${index}`, counterpart: `contact${index}@acme.com`, daysSinceLastMessage: index }),
      ),
    })
    expect(many).toHaveLength(BRIEFING_ACTIONS_MAX)

    // …et trois entrées ne rendent que trois cartes. Le plafond est un
    // maximum, jamais une cible.
    const few = buildBriefingActions({
      ...EMPTY,
      awaitingReply: Array.from({ length: 3 }, (_, index) =>
        thread({ threadId: `t${index}`, counterpart: `contact${index}@acme.com`, daysSinceLastMessage: index }),
      ),
    })
    expect(few).toHaveLength(3)
  })

  /**
   * #2107 (Centre d'actions, recette écran du 25/09/2026) — `buildAllBriefingActions`
   * est la MÊME dérivation, JAMAIS plafonnée : un genre de priorité basse
   * (12-17) qui perdrait sa place au plafond de `buildBriefingActions` doit
   * rester visible pour l'appelant qui a besoin de l'ensemble (`/actions`).
   */
  it('#2107 — buildAllBriefingActions ne plafonne JAMAIS, même dérivation que buildBriefingActions', () => {
    const many = {
      ...EMPTY,
      awaitingReply: Array.from({ length: 12 }, (_, index) =>
        thread({ threadId: `t${index}`, counterpart: `contact${index}@acme.com`, daysSinceLastMessage: index }),
      ),
    }

    const capped = buildBriefingActions(many)
    const all = buildAllBriefingActions(many)

    expect(capped).toHaveLength(BRIEFING_ACTIONS_MAX)
    expect(all.length).toBeGreaterThan(BRIEFING_ACTIONS_MAX)
    expect(all.length).toBe(12)
    // Les sept premières places sont IDENTIQUES : une seule dérivation, la
    // troncature seule change.
    expect(all.slice(0, BRIEFING_ACTIONS_MAX)).toEqual(capped)
  })

  it('n’émet que des clés de fait et de contexte DÉCLARÉES', () => {
    // Même raison que pour les libellés d'action : la clé est une chaîne côté
    // serveur et une entrée de JSON côté web. La liste exportée est le lien que
    // `briefing-labels.spec.ts` confronte aux vrais fichiers de traduction.
    for (const action of buildBriefingActions(CARD_INPUT)) {
      if (action.fact?.labelKey) expect(BRIEFING_FACT_LABEL_KEYS).toContain(action.fact.labelKey)
      if (action.context) expect(BRIEFING_CONTEXT_LABEL_KEYS).toContain(action.context.labelKey)
    }
  })

  it('au moins une famille de carte ÉNONCE son fait — sinon le champ serait mort', () => {
    // « Prépare X » est un ordre, pas un fait : cette carte-là porte donc un
    // libellé de fait à elle. Si plus aucune ne le faisait, `fact.labelKey`
    // deviendrait du code que personne n'appelle.
    const actions = buildBriefingActions(CARD_INPUT)
    expect(actions.some(action => action.fact?.labelKey)).toBe(true)
  })
})

/**
 * #2397.2 — LES AXES ENTRENT DANS LE CALCUL DU RANG, PAS SEULEMENT L'AFFICHAGE.
 *
 * `BRIEFING_RANKING_AXES`/`rankingAxes` ne nourrissaient AUCUN calcul : la
 * seule clé de tri était `priority`, un entier fixe par catégorie. Deux
 * cartes de MÊME priorité (un conflit et un rendez-vous imminent, tous deux
 * `priority: 1`) ne se distinguaient donc que par leur ordre d'insertion.
 * `compareBriefingActions` garde `priority` comme clé PREMIÈRE (« ce qui a
 * une heure passe avant ce qui n'en a pas », inchangé), et départage l'ÉGALITÉ
 * par les axes RÉELLEMENT évaluables de chaque carte — jamais un axe non
 * mesurable, qui reste NOMMÉ (`rankingAxes` inchangé) mais sort du calcul.
 * Aucun score n'est exposé : ce poids ne quitte jamais la fonction.
 */
describe('#2397.2 — compareBriefingActions : les axes départagent une priorité ÉGALE', () => {
  function reading(axis: BriefingRankingAxisReading['axis'], evaluated: boolean): BriefingRankingAxisReading {
    return { axis, evaluated }
  }

  it('à PRIORITÉ ÉGALE, la carte qui a pu peser PLUS d’axes (dans l’ordre déclaré) passe devant', () => {
    const richer = {
      priority: 1,
      rankingAxes: [reading('consequence', true), reading('urgency', true)],
    }
    const poorer = { priority: 1, rankingAxes: [reading('urgency', true)] }
    expect(compareBriefingActions(richer, poorer)).toBeLessThan(0)
    expect(compareBriefingActions(poorer, richer)).toBeGreaterThan(0)
  })

  it('un axe NON évaluable ne pèse RIEN dans le calcul — seul `evaluated: true` compte', () => {
    const withUnevaluableConsequence = {
      priority: 1,
      rankingAxes: [reading('consequence', false), reading('urgency', true)],
    }
    const withoutConsequenceAtAll = { priority: 1, rankingAxes: [reading('urgency', true)] }
    // Un axe nommé mais non évalué ne doit RIEN ajouter au poids : les deux
    // cartes ne se distinguent que sur ce qui a RÉELLEMENT pu être mesuré.
    expect(compareBriefingActions(withUnevaluableConsequence, withoutConsequenceAtAll)).toBe(0)
  })

  it('la PRIORITÉ garde le dernier mot — jamais un axe qui la renverse', () => {
    // « Ce qui a une heure passe avant ce qui n'en a pas » : une carte de
    // priorité 2, même la mieux pesée, ne double jamais une priorité 1.
    const wellRanked = { priority: 2, rankingAxes: [reading('consequence', true), reading('urgency', true)] }
    const barelyRanked = { priority: 1, rankingAxes: [] }
    expect(compareBriefingActions(wellRanked, barelyRanked)).toBeGreaterThan(0)
  })

  it('DÉTERMINISTE : le résultat ne dépend pas de l’ordre des lectures dans le tableau', () => {
    const a = { priority: 1, rankingAxes: [reading('urgency', true), reading('consequence', true)] }
    const b = { priority: 1, rankingAxes: [reading('consequence', true), reading('urgency', true)] }
    expect(compareBriefingActions(a, b)).toBe(0)
  })

  // #2095.72 — une donnée DOUTEUSE ne passe jamais devant un FAIT VÉRIFIÉ, à
  // priorité égale : `confidence` départage AVANT les axes (une carte pesée
  // sur plus d'axes mais `inferred` ne doit pas doubler une carte `verified`
  // moins pesée — la doctrine porte sur la FIABILITÉ du fait, pas sur combien
  // de facettes la carte affiche).
  it('à PRIORITÉ ÉGALE, un fait VÉRIFIÉ passe devant une donnée DOUTEUSE (#2095.72)', () => {
    const verified = { priority: 3, rankingAxes: [], confidence: 'verified' as const }
    const inferred = { priority: 3, rankingAxes: [], confidence: 'inferred' as const }
    expect(compareBriefingActions(verified, inferred)).toBeLessThan(0)
    expect(compareBriefingActions(inferred, verified)).toBeGreaterThan(0)
  })

  it('une confiance ABSENTE (`null`) n’est pas traitée comme douteuse — jamais pénalisée sans raison', () => {
    const verified = { priority: 3, rankingAxes: [], confidence: 'verified' as const }
    const unstated = { priority: 3, rankingAxes: [], confidence: null }
    expect(compareBriefingActions(verified, unstated)).toBe(0)
  })
})

/**
 * #2397.7 — LE RETOUR UTILISATEUR, COMME UN AXE DE PLUS.
 *
 * `roleFit` reste NOMMÉ mais jamais évalué par défaut (comme `dependency` et
 * `opportunity`, #2397.2) : c'est cette section qui prouve qu'il PEUT l'être,
 * quand la personne a marqué un GENRE de carte comme prioritaire pour elle
 * (`input.roleFit`, alimenté par `BriefingService.setRoleFit`).
 */
describe('#2397.7 — buildBriefingActions : le retour utilisateur ajuste un axe', () => {
  it('sans retour (`roleFit` absent), `roleFit` reste NON évalué — byte-identique à avant ce lot', () => {
    const actions = buildBriefingActions({ ...EMPTY, awaitingReply: [thread({ threadId: 't1' })] })
    const followUp = actions.find(action => action.kind === 'follow_up')
    expect(followUp?.rankingAxes.find(reading => reading.axis === 'roleFit')).toEqual({
      axis: 'roleFit',
      evaluated: false,
    })
  })

  it('un genre MARQUÉ engagé voit `roleFit` évalué sur SES cartes, jamais sur les autres', () => {
    const actions = buildBriefingActions({
      ...EMPTY,
      conflicts: [{ first: event({ id: 'a' }), second: event({ id: 'b' }), overlapMinutes: 15 }],
      awaitingReply: [thread({ threadId: 't1' })],
      roleFit: { follow_up: true },
    })
    const followUp = actions.find(action => action.kind === 'follow_up')
    const conflict = actions.find(action => action.kind === 'conflict')
    expect(followUp?.rankingAxes.find(reading => reading.axis === 'roleFit')).toEqual({
      axis: 'roleFit',
      evaluated: true,
    })
    // Le conflit n'a pas été marqué : son `roleFit` reste NON évalué — le
    // retour utilisateur ne se propage jamais à un genre qu'il n'a pas visé.
    expect(conflict?.rankingAxes.find(reading => reading.axis === 'roleFit')).toEqual({
      axis: 'roleFit',
      evaluated: false,
    })
  })

  it('une OBLIGATION (`priority` la plus basse) garde son rang, quel que soit le retour sur un autre genre', () => {
    // Le conflit (`priority: 1`) et la relance (`priority: 4`) ne sont JAMAIS
    // à égalité : `roleFit` ne peut donc jamais faire passer la relance
    // devant, quel que soit le retour utilisateur enregistré sur elle.
    const actions = buildBriefingActions({
      ...EMPTY,
      conflicts: [{ first: event({ id: 'a' }), second: event({ id: 'b' }), overlapMinutes: 15 }],
      awaitingReply: [thread({ threadId: 't1' })],
      roleFit: { follow_up: true },
    })
    const conflictIndex = actions.findIndex(action => action.kind === 'conflict')
    const followUpIndex = actions.findIndex(action => action.kind === 'follow_up')
    expect(conflictIndex).toBeGreaterThanOrEqual(0)
    expect(conflictIndex).toBeLessThan(followUpIndex)
  })
})

// #2107.19 / #2107.47 — corpus PARTAGÉ : une entrée PAR GENRE, isolée. Passer
// toutes les entrées ensemble dépasserait `BRIEFING_ACTIONS_MAX` (7) et ferait
// évincer les moins prioritaires avant qu'un test les voie — un faux rouge sur
// le mauvais défaut. `task` est ABSENT à dessein : `buildBriefingActions` n'en
// produit jamais (#1391). Module-scope pour être réutilisable par les DEUX
// recettes — deux chemins qui reconstruiraient chacun leur corpus finiraient
// par diverger (même doctrine que `computeRfpCompliance`).
const PER_KIND_INPUT: Record<
  Exclude<(typeof BRIEFING_ACTION_KINDS)[number], 'task'>,
  Partial<Parameters<typeof buildBriefingActions>[0]>
> = {
  meeting_prep: {
    meetings: [
      event({
        id: 'm1',
        attendees: [{ email: 'client@acme.com', displayName: null, responseStatus: null, external: true }],
      }),
    ],
  },
  follow_up: { awaitingReply: [thread({ threadId: 't1' })] },
  reply: { positiveReplies: [thread({ threadId: 'p1', lastDirection: 'inbound' as const })] },
  conflict: { conflicts: [{ first: event({ id: 'a' }), second: event({ id: 'b' }), overlapMinutes: 30 }] },
  account: {
    accountsWithFreshSignal: [
      { accountId: 'acc1', companyName: 'ACME', detectedAt: '2026-08-02T18:00:00.000Z', detectionExact: true },
    ],
  },
  need_stale: { staleNeeds: [{ id: 'need-1', title: 'DevOps confirmé', days: 9 }] },
  mission_end: { missionsEnding: [{ id: 'mission-1', label: 'Maintenance prédictive', daysUntilEnd: 28 }] },
  payment_overdue: { overdueInvoices: [{ id: 'mission-2', label: 'Refonte SI', daysOverdue: 14 }] },
  rfp_due: { rfpsDueSoon: [{ id: 'rfp-1', title: 'Consultation infra', daysUntilDue: 2 }] },
  consultant_available: {
    consultantsFreeingSoon: [{ id: 'c-1', name: 'Yanis Berthier', days: 12, endsOn: '2026-08-15T00:00:00.000Z' }],
  },
  availability_reconfirm: { availabilityToReconfirm: [{ id: 'c-2', name: 'Marion Aziz', days: 74 }] },
  mission_no_end_date: { missionsWithoutEndDate: [{ id: 'mission-9', label: 'Support N2' }] },
  connector_broken: { brokenConnectors: [{ tool: 'mailbox' as const, state: 'read_only' as const }] },
  renewal_not_engaged: { renewalsNotEngaged: [{ id: 'mission-3', title: 'Support N1', days: 20 }] },
  submission_no_response: {
    submissionsWithoutResponse: [{ consultantId: 'c-1', consultantName: 'Karim Belaïd', days: 9 }],
  },
  rfp_requirement_gap: {
    rfpsWithUncoveredRequirements: [{ id: 'rfp-1', title: 'Consultation infra', count: 2 }],
  },
  account_no_owner: { accountsWithoutOwner: [{ id: 'acc-1', companyName: 'ACME' }] },
  project_no_next_action: {
    projectsWithoutNextAction: [{ id: 'p-1', label: 'Portail transporteurs', companyName: 'ACME' }],
  },
  project_stale: {
    staleProjects: [{ id: 'p-2', label: 'Schéma directeur data', companyName: 'ACME', days: 45 }],
  },
  cra_missing: { craMissing: [{ id: 'mission-4', label: 'Migration cloud' }] },
  invoice_ready: { invoicesReady: [{ id: 'mission-5', label: 'Audit sécurité' }] },
  invoicing_blocked_missing_data: {
    invoicingBlockedMissingData: [{ id: 'mission-6', label: 'Refonte SI RH', blocker: 'missing_rate' as const }],
  },
  contact_bounced: {
    contactsBounced: [{ id: 'contact-1', name: 'Aïcha Bensalem' }],
  },
  meeting_no_followup: {
    meetingsWithoutFollowup: [event({ id: 'm2', summary: 'Point Pharmatek' })],
  },
  // L1 (31/10/2026) — les cinq familles du moteur de cartes.
  invoice_blocked: {
    invoicesBlocked: [{ id: 'mission-9', label: 'Run SNCF', blocker: 'timesheet_disputed' }],
  },
  critical_data_missing: {
    criticalDataMissing: [{ field: 'mission_consultant', objectKind: 'mission', id: 'mission-10', label: 'Audit' }],
  },
  mission_starting: {
    missionsStarting: [{ id: 'mission-11', label: 'Data Orange', daysUntilStart: 3, startsOn: '2026-08-06' }],
  },
  mission_amendment_pending: {
    amendmentsPending: [{ missionId: 'mission-12', label: 'Run Total', documentName: 'Avenant 2', days: 9 }],
  },
  contact_left: {
    contactsLeft: [{ id: 'contact-2', name: 'Lucie Bernard', companyName: 'Thales', leftAt: null }],
  },
}

/**
 * #2107.47 — RECETTE : CHAQUE TRIGGER A UNE DATE ET UNE SOURCE.
 *
 * Le critère de recette de #2107 lu littéralement (« chaque trigger possède
 * une date et une source »). Une entrée PAR GENRE, isolée : les passer toutes
 * ensemble dépasserait `BRIEFING_ACTIONS_MAX` (7) et ferait évincer les moins
 * prioritaires AVANT que ce test les voie — un faux rouge sur le mauvais
 * défaut. `task` est ABSENT à dessein : `buildBriefingActions` n'en produit
 * jamais (#1391 — une tâche vit dans « Tes tâches », pas ici), même si le
 * genre existe au contrat pour d'autres lecteurs (urgency-tier, role-order).
 */
describe('#2107.47 — chaque trigger a une date et une source', () => {
  it('lit un corpus qui exerce chaque genre producible — un genre neuf sans entrée ici casse ce test', () => {
    // `task` est le SEUL genre du contrat que `buildBriefingActions` ne produit
    // jamais — voir le docblock de cette description.
    expect(Object.keys(PER_KIND_INPUT).sort()).toEqual(
      [...BRIEFING_ACTION_KINDS].filter(kind => kind !== 'task').sort(),
    )
  })

  it.each(Object.entries(PER_KIND_INPUT))(
    '%s — porte un fait non nul, sourcé et daté-ou-honnêtement-inconnu',
    (kind, input) => {
      const actions = buildBriefingActions({ ...EMPTY, ...input })
      const action = actions.find(candidate => candidate.kind === kind)
      expect(action?.fact).not.toBeNull()
      expect(action?.fact?.provenance.capability).toBeTruthy()
      expect(action?.fact?.provenance.source).toBeTruthy()
      // `observedAt` peut être `null` (honnêtement inconnu), mais le CHAMP existe
      // toujours — jamais `undefined`, qui se lirait comme un contrat incomplet.
      expect(action?.fact?.provenance).toHaveProperty('observedAt')
    },
  )
})

/**
 * #2107.19 — CONTRAINTE : CHAQUE TRIGGER VIENT DE L'OBJET PROPRIÉTAIRE.
 *
 * Le corps de l'issue #2107 : « Chaque trigger doit venir de l'objet
 * propriétaire et posséder un CTA vers lui. » Dix-huit genres plus tard, la
 * contrainte est enfin VÉRIFIABLE : pour toute carte qui NOMME un objet
 * (`businessObject` non nul), son `href` doit mener AU DOSSIER DE CET OBJET
 * précis — jamais une liste, jamais un autre dossier.
 *
 * Les genres SANS dossier par objet (`rfp_due`, `rfp_requirement_gap`,
 * `need_stale`, `connector_broken`, les relances mail, les rendez-vous) ne
 * sont PAS un manquement à cette règle : ils n'affirment aucun
 * `businessObject`, et une carte qui ne nomme personne n'a personne à
 * trahir — chacun documenté à sa création (voir `RFP_ROUTE`, etc.). Ce test
 * ne les ignore pas : il boucle sur TOUS les genres, il se contente de ne
 * rien affirmer là où il n'y a rien à affirmer.
 */
describe('#2107.19 — chaque trigger avec un objet nommé pointe vers SON dossier', () => {
  const ROUTE_PREFIX: Record<'account' | 'mission' | 'talent' | 'contact' | 'project', string> = {
    account: '/accounts/',
    mission: '/missions/',
    talent: '/consultants/',
    // #2095.41 (épopée #2993) — premier genre à produire un
    // `businessObject: { kind: 'contact' }` (`contact_bounced`).
    contact: '/contacts/',
    // #2106.9/#2107.1/#2107.2 (épopée #2801) — premiers genres à produire un
    // `businessObject: { kind: 'project' }`, désormais que `/projects/$id`
    // existe.
    project: '/projects/',
  }

  it.each(Object.entries(PER_KIND_INPUT))('%s — href mène au dossier de son businessObject', (kind, input) => {
    const actions = buildBriefingActions({ ...EMPTY, ...input })
    const action = actions.find(candidate => candidate.kind === kind)
    if (!action?.businessObject) return // rien à affirmer : ce genre ne nomme aucun objet (documenté à sa création)
    const prefix = ROUTE_PREFIX[action.businessObject.kind]
    expect(action.href).toBe(`${prefix}${action.businessObject.id}`)
  })
})
