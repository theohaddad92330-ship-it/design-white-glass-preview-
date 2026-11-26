import { detectConflicts } from '../agenda/free-slots'
import { selectMeetingsToPrepare } from '../briefing/briefing-actions'
import { computeMailThreadPriority } from '../mailbox/mail-priority'
import type { MailThreadText } from '../mailbox/mail-thread-text'
import { demoAgendaWindow } from './demo-agenda'
import type {
  AgendaEvent,
  DailyBriefing,
  MailDraftResult,
  MailReplyDraftResult,
  MailSearchIntent,
  MailSearchResponse,
  MailThread,
  MailboxStatus,
  OutOfOfficeRequest,
} from '@bellum/contracts'

/**
 * Le brief du jour et la messagerie, en espace de DÉMONSTRATION.
 *
 * Sans ce fichier, « Aujourd’hui » et « Messagerie » s'ouvriraient devant un
 * prospect sur « aucune messagerie connectée » : deux écrans livrés, deux
 * écrans vides — exactement ce que la règle de parité démo interdit. Un
 * visiteur ne connecte évidemment pas sa boîte Gmail à une salle de démo.
 *
 * Tout ce qui suit est FICTIF et le montre : adresses en `.example` (RFC 2606,
 * domaine réservé et non attribuable), boîte annoncée comme
 * `demo@bellum.example`. Aucun appel réseau n'est fait, aucune vraie messagerie
 * n'est lue, aucun crédit n'est débité.
 *
 * ⚠️ POURQUOI LES CORRESPONDANTS NE SONT PAS LES SOCIÉTÉS DU PORTEFEUILLE. Les
 * cinq dossiers portent des sociétés RÉELLES. Un fil de discussion attribué à
 * l'une d'elles inventerait une correspondance — et son expéditeur serait une
 * personne inventée chez une entreprise qui existe. Les fils ci-dessous se
 * tiennent donc avec des clients ouvertement fictifs de l'ESN fictive, ce qui
 * est cohérent : la boîte est celle de l'ESN, et l'ESN est inventée. Les
 * sociétés réelles n'apparaissent que dans « comptes à suivre », qui ne suppose
 * aucun échange.
 *
 * Les dates sont calculées à partir de l'instant de la visite. Un jeu figé
 * afficherait « rendez-vous du 3 août 2026 » à un prospect de novembre, ce qui
 * saborde la démonstration plus sûrement qu'un écran vide.
 */

/** Boîte fictive annoncée à l'écran — visiblement une démo, pas une vraie boîte. */
const DEMO_MAILBOX_ADDRESS = 'demo@bellum.example'

/**
 * #2107.28 — CE QUI a bougé sur un compte à suivre, ouvertement fictif.
 *
 * Trois libellés génériques, plausibles pour n'importe quelle ESN, assignés
 * par index : la salle de démo n'a jamais plus de trois comptes à suivre
 * (`buildDemo` en lit `take: 3`), donc aucune répétition visible.
 */
const DEMO_SIGNAL_LABELS = [
  'Levée de fonds Série B',
  "Recrutement d'un DSI",
  'Ouverture d’un bureau en France',
] as const

/**
 * #2107.33 — « la raison pour laquelle cela concerne cette ESN », assignée par
 * le MÊME index que {@link DEMO_SIGNAL_LABELS} : c'est la lecture commerciale
 * du signal ci-dessus, pas une phrase indépendante — un signal sans sa raison
 * assortie montrerait en démo un couple qui ne peut pas exister en production.
 */
const DEMO_ESN_REASONS = [
  'Un tour de table finance des projets IT, pas des intentions.',
  'Une DSI qui se pose recompose vite ses prestataires en place.',
  'Une implantation neuve manque de relais local — fenêtre de mise en avant.',
] as const

/**
 * #4068.6 — l'historique daté du compte (affaire passée, mission terminée, besoin exprimé), ouvertement
 * fictif, assigné par le même index que {@link DEMO_SIGNAL_LABELS}. Dates ABSOLUES et anciennes (jamais
 * présentées comme récentes), types du contrat des faits ; aucune provenance.
 */
const DEMO_ACCOUNT_HISTORY = [
  [
    { daysAgo: 410, kind: 'deal_lost', label: 'Affaire perdue : refonte du SI paie (démo)' },
    { daysAgo: 240, kind: 'mission', label: 'Mission de TMA terminée (démo)' },
  ],
  [
    { daysAgo: 520, kind: 'deal_won', label: 'Affaire gagnée : centre de services data (démo)' },
    { daysAgo: 150, kind: 'need', label: 'Besoin exprimé : architecte cloud (démo)' },
  ],
  [
    { daysAgo: 300, kind: 'deal_dormant', label: 'Affaire en sommeil : schéma directeur (démo)' },
    { daysAgo: 95, kind: 'meeting', label: 'Rendez-vous : cadrage du périmètre (démo)' },
  ],
] as const

function hoursFromNow(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 3600_000).toISOString()
}

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86400_000).toISOString()
}

function event(partial: Partial<AgendaEvent> & Pick<AgendaEvent, 'id' | 'summary' | 'start' | 'end'>): AgendaEvent {
  return {
    description: null,
    location: null,
    organizer: DEMO_MAILBOX_ADDRESS,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
    ...partial,
  }
}

function thread(partial: Partial<MailThread> & Pick<MailThread, 'threadId' | 'subject' | 'counterpart'>): MailThread {
  return {
    lastMessageAt: null,
    lastDirection: 'outbound',
    messageCount: 2,
    awaitingReply: true,
    daysSinceLastMessage: null,
    unread: false,
    hasAttachments: false,
    otherParticipants: [],
    ...partial,
  }
}

/** Le statut de messagerie affiché dans une salle de démo. */
export function demoMailboxStatus(): MailboxStatus {
  return {
    connected: true,
    provider: 'google',
    address: DEMO_MAILBOX_ADDRESS,
    // Théo D settings-integrations.DÉC.absence — la salle montre la réponse d'absence (exemple éteint, rien d'écrit).
    capabilities: { read: true, draft: true, send: false, labels: false, outOfOffice: true },
    // #2756 — une seule boîte fictive en démo : rien à compter au-delà.
    connectedCount: 1,
  }
}

/**
 * Les fils de démonstration, tous rattachés aux sociétés du jeu de données.
 *
 * Refonte Théo B m1 — la salle doit ressembler à la page appliquée : chaque fil porte la RAISON de son rang (le même
 * calcul que le produit, `computeMailThreadPriority`), et les fils scriptés (`DEMO_MAIL_THREAD_TEXTS`) portent leurs
 * messages, lus dans le volet de lecture. Les contenus sont ceux du script, jamais un deuxième texte (GA-26) ; aucune
 * messagerie réelle n'est interrogée.
 */
/**
 * Théo D settings-integrations.DÉC.absence — la réponse d'absence de la boîte fictive : un EXEMPLE éteint, avec un
 * message et une fin relatifs à l'appel. Le visiteur voit le formulaire rempli ; rien n'est écrit chez un fournisseur.
 */
export function demoOutOfOffice(now: Date): OutOfOfficeRequest {
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  return {
    enabled: false,
    contactsOnly: false,
    endsAt: end.toISOString(),
    message: 'Bonjour, je suis absent·e jusqu’à mon retour. Pour une demande urgente, mon équipe vous répond.',
  }
}

/** Les fils de démonstration, tous rattachés aux sociétés du jeu de données. */
function demoThreads(now: Date): MailThread[] {
  return demoThreadsRaw(now).map(item => {
    const priority = computeMailThreadPriority(
      item,
      item.lastDirection === 'inbound' && !item.unread,
      7,
      item.state === 'treated' ? 'treated' : null,
    )
    const script = demoMailThreadText(item.threadId, now)
    return {
      ...item,
      priorityLevel: priority.level,
      priorityReason: priority.reason,
      ...(script
        ? {
            messages: script.messages.map((message, index) => ({
              id: `${item.threadId}-m${index + 1}`,
              threadId: item.threadId,
              subject: script.subject,
              from: message.from,
              to: [],
              cc: [],
              date: message.date,
              snippet: message.text,
              unread: false,
              hasAttachments: false,
              direction: message.direction,
            })),
          }
        : {}),
    }
  })
}

function demoThreadsRaw(now: Date): MailThread[] {
  return [
    thread({
      threadId: 'demo-thread-verdal-proposal',
      subject: 'Refonte du parcours commande — proposition commerciale',
      counterpart: 'c.vasseur@verdal-distribution.example',
      lastMessageAt: daysAgo(now, 11),
      daysSinceLastMessage: 11,
      messageCount: 4,
      hasAttachments: true,
    }),
    thread({
      threadId: 'demo-thread-pharmatek-hebergement',
      subject: 'Hébergement de données de santé : qui pilote le sujet chez vous ?',
      counterpart: 'k.delorme@pharmatek.example',
      lastMessageAt: daysAgo(now, 8),
      daysSinceLastMessage: 8,
      messageCount: 2,
    }),
    thread({
      threadId: 'demo-thread-altiver-supervision',
      subject: 'Programme de supervision industrielle — point de cadrage',
      counterpart: 't.reynier@altiver-industries.example',
      lastMessageAt: daysAgo(now, 21),
      daysSinceLastMessage: 21,
      messageCount: 3,
      // Théo B m1.N1 — l'onglet « Historique » de la Messagerie montre un échange déjà traité en démo.
      state: 'treated',
    }),
    // X66 / #3533 — UN FIL RÉELLEMENT SANS OBJET (`subject: null`) : un message
    // envoyé sans titre. L'écran n'affiche alors AUCUNE ligne d'objet (une
    // absence ne fait pas de ligne) et laisse l'interlocuteur seul.
    thread({
      threadId: 'demo-thread-altiver-sans-objet',
      subject: null,
      counterpart: 'm.perrin@altiver-industries.example',
      lastMessageAt: daysAgo(now, 5),
      daysSinceLastMessage: 5,
      messageCount: 1,
    }),
    thread({
      threadId: 'demo-thread-verdal-positive',
      subject: 'Re: Refonte du parcours commande',
      counterpart: 'j.morvan@verdal-distribution.example',
      lastMessageAt: daysAgo(now, 1),
      daysSinceLastMessage: 1,
      lastDirection: 'inbound',
      awaitingReply: false,
      messageCount: 5,
    }),
    thread({
      threadId: 'demo-thread-pharmatek-unread',
      subject: 'Fiche de poste : ingénieur cybersécurité (H/F)',
      counterpart: 'i.roussel@pharmatek.example',
      lastMessageAt: daysAgo(now, 2),
      daysSinceLastMessage: 2,
      lastDirection: 'inbound',
      awaitingReply: false,
      unread: true,
      hasAttachments: true,
      messageCount: 1,
    }),
    // Théo B M2.N3 — un échange REPORTÉ : il quitte « À traiter » et se retrouve dans « À venir » jusqu'à sa date.
    thread({
      threadId: 'demo-thread-pharmatek-reporting',
      subject: 'Votre périmètre de reporting',
      counterpart: 'k.delorme@pharmatek.example',
      lastMessageAt: daysAgo(now, 3),
      daysSinceLastMessage: 3,
      messageCount: 2,
      snoozeUntil: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  ]
}

/**
 * La réponse de recherche en démo. L'intention CHOISIE par le visiteur filtre
 * réellement le jeu : une démo où tous les onglets rendent la même liste ne
 * démontre pas la recherche par intention, elle la contredit.
 */
export function demoMailSearch(
  intent: MailSearchIntent,
  now: Date = new Date(),
  counterpart?: string,
): MailSearchResponse {
  // Une recherche scopée sur UN interlocuteur (la fiche contact demande « les
  // derniers échanges avec cette personne ») ne doit pas rendre toute la boîte :
  // le visiteur lirait des fils qui ne concernent pas le contact ouvert.
  const all = counterpart
    ? demoThreads(now).filter(item => (item.counterpart ?? '').toLowerCase().includes(counterpart.toLowerCase()))
    : demoThreads(now)
  const threads =
    intent === 'no_reply'
      ? all.filter(item => item.awaitingReply)
      : intent === 'unread'
        ? all.filter(item => item.unread)
        : intent === 'positive_reply'
          ? all.filter(item => item.lastDirection === 'inbound' && !item.unread)
          : intent === 'attachments' || intent === 'cv' || intent === 'job_description'
            ? all.filter(item => item.hasAttachments)
            : all

  return {
    provider: 'google',
    intent,
    threads,
    resolvedQuery: 'démonstration — aucune messagerie réelle interrogée',
    truncated: false,
  }
}

/**
 * #4016 L3 — le contenu scripté de deux fils de la salle de démonstration, pour que
 * « résume ce fil » et « quelles objections ? » aient de quoi répondre devant un
 * prospect. Mêmes interlocuteurs fictifs (`.example`) que `demoThreads` ; aucune
 * messagerie réelle n'est interrogée. Un autre identifiant ⇒ `null` (jamais un
 * texte inventé pour un fil inconnu).
 */
export function demoMailThreadText(threadId: string, now: Date = new Date()): MailThreadText | null {
  const script = DEMO_MAIL_THREAD_TEXTS[threadId]
  if (!script) return null
  return {
    threadId,
    subject: script.subject,
    truncated: false,
    messages: script.messages.map((message, index) => ({
      direction: message.direction,
      date: daysAgo(now, script.messages.length - index + 10),
      from: message.from,
      text: message.text,
    })),
  }
}

const DEMO_MAIL_THREAD_TEXTS: Readonly<
  Record<
    string,
    { subject: string; messages: ReadonlyArray<{ direction: 'inbound' | 'outbound'; from: string; text: string }> }
  >
> = {
  'demo-thread-verdal-proposal': {
    subject: 'Refonte du parcours commande — proposition commerciale',
    messages: [
      {
        direction: 'outbound',
        from: DEMO_MAILBOX_ADDRESS,
        text: 'Bonjour Claire, voici notre proposition pour la refonte du parcours commande : deux développeurs front et un tech lead sur six mois.',
      },
      {
        direction: 'inbound',
        from: 'c.vasseur@verdal-distribution.example',
        text: 'Merci pour la proposition. Le périmètre nous convient, mais le budget dépasse l’enveloppe prévue pour le trimestre. Pouvez-vous étaler le démarrage ? Je dois aussi valider avec les achats.',
      },
    ],
  },
  'demo-thread-pharmatek-hebergement': {
    subject: 'Hébergement de données de santé : qui pilote le sujet chez vous ?',
    messages: [
      {
        direction: 'outbound',
        from: DEMO_MAILBOX_ADDRESS,
        text: 'Bonjour Karine, nous accompagnons des acteurs de santé sur l’hébergement certifié. Qui pilote ce sujet chez vous ?',
      },
      {
        direction: 'inbound',
        from: 'k.delorme@pharmatek.example',
        text: 'Le sujet est porté par notre DSI, M. Aubry. Nous cherchons surtout un expert sécurité disponible rapidement.',
      },
    ],
  },
}

/**
 * #4405.4 — la réponse pré-rédigée d'un fil de démonstration (« Préparer la
 * réponse »). SCRIPTÉE, jamais un appel modèle (`demo-model-calls.spec.ts`) :
 * chaque fil scripté de la boîte de démo a sa réponse, cohérente avec le dernier
 * message reçu. Un fil hors du jeu rend `null` — l'appelant le dit, il n'invente
 * pas un texte pour un fil inconnu.
 */
export function demoMailReplyDraft(threadId: string): MailReplyDraftResult | null {
  const body = DEMO_MAIL_REPLIES[threadId]
  const thread = demoThreads(new Date()).find(item => item.threadId === threadId)
  if (!body || !thread) return null
  // Un fil réellement sans objet (X66) reçoit un « Re: » neutre, jamais un objet inventé sur le fond.
  const subject = thread.subject ?? 'Votre message'
  return { subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`, body }
}

const DEMO_MAIL_REPLIES: Readonly<Record<string, string>> = {
  'demo-thread-verdal-proposal':
    'Bonjour Claire,\n\nMerci pour votre retour. Nous pouvons étaler le démarrage : un développeur front dès le mois prochain, le second et le tech lead au trimestre suivant, ce qui ramène l’engagement du trimestre dans votre enveloppe. Je vous prépare le chiffrage correspondant pour que vous puissiez le valider avec les achats.\n\nSouhaitez-vous qu’on en parle jeudi pendant quinze minutes ?\n\nBien cordialement,',
  'demo-thread-pharmatek-hebergement':
    'Bonjour Karine,\n\nMerci pour cette précision. Je me permets de revenir vers M. Aubry avec un profil d’expert sécurité disponible rapidement sur l’hébergement de données de santé. Pouvez-vous me confirmer le périmètre attendu et la date de démarrage souhaitée ?\n\nBien cordialement,',
  'demo-thread-altiver-supervision':
    'Bonjour Thomas,\n\nJe reviens vers vous après notre point de cadrage sur le programme de supervision industrielle. Avez-vous pu valider le périmètre en interne ? Je peux vous proposer un créneau de trente minutes cette semaine pour caler les profils et le calendrier.\n\nBien cordialement,',
  'demo-thread-altiver-sans-objet':
    'Bonjour Madame, Monsieur Perrin,\n\nJe me permets de revenir sur mon précédent message, resté sans titre. Nous accompagnons des industriels sur la supervision de leurs sites ; seriez-vous la bonne personne pour en parler, ou pouvez-vous m’indiquer qui pilote ce sujet chez vous ?\n\nBien cordialement,',
  'demo-thread-pharmatek-reporting':
    'Bonjour Karine,\n\nJe reviens vers vous au sujet du périmètre de reporting de vos établissements. Avez-vous pu avancer en interne ? Je peux vous présenter en trente minutes la manière dont nous avons outillé un acteur de santé comparable, au moment qui vous arrange.\n\nBien cordialement,',
  'demo-thread-verdal-positive':
    'Bonjour Julien,\n\nMerci pour votre retour positif, c’est une excellente nouvelle. Pour avancer, je vous propose un échange de trente minutes avec votre équipe cette semaine afin de cadrer le périmètre et le calendrier de la refonte. Quels créneaux vous conviennent ?\n\nBien cordialement,',
  'demo-thread-pharmatek-unread':
    'Bonjour Isabelle,\n\nMerci pour la fiche de poste. Je l’ai bien reçue et je regarde dès aujourd’hui les profils cybersécurité disponibles qui correspondent. Pouvez-vous me confirmer la localisation et le niveau d’expérience attendus, afin que je ne vous propose que des candidats pertinents ?\n\nBien cordialement,',
}

/**
 * Un brouillon en salle de démonstration : rien n'est déposé nulle part.
 *
 * L'alternative serait de laisser la route chercher une messagerie réelle, n'en
 * trouver aucune et rendre « Aucune messagerie connectée » — une erreur rouge
 * sous les yeux du prospect, sur un bouton que la démo lui a proposé. Le
 * résultat est donc scripté et sans lien : `webUrl` reste `null` parce qu'il
 * n'y a pas de brouillon à ouvrir, et inventer un lien mort serait pire.
 *
 * #2394.62 — `messageId`/`threadId` restaient `null` ici aussi, alors que
 * `mailDraftHasProof` (la preuve derrière « déposé ») les exige DÉSORMAIS des
 * deux : la démo aurait basculé la carte en échec sur le SEUL parcours qui ne
 * peut jamais échouer. Deux identifiants SCRIPTÉS, comme `draftId` l'était déjà
 * — jamais une valeur d'un fournisseur réel — suffisent : la carte reste un
 * succès complet, `webUrl` reste `null` pour la même raison qu'avant.
 */
export function demoMailDraft(): MailDraftResult {
  return {
    provider: 'google',
    draftId: 'demo-draft',
    messageId: 'demo-message',
    threadId: 'demo-thread',
    webUrl: null,
  }
}

/** Le brief du jour d'une salle de démonstration. */
export function demoBriefing(input: {
  now: Date
  timeZone: string
  firstName: string | null
  accounts: Array<{ accountId: string; companyName: string; website: string | null }>
}): DailyBriefing {
  const { now, timeZone, firstName } = input

  // Le bloc du brief et l'écran « Aujourd’hui » lisent le MÊME jeu
  // (`demo-agenda.ts`) : deux jeux séparés finiraient par se contredire sous les
  // yeux du prospect, sur des rendez-vous censés être les siens.
  //
  // Seuls les rendez-vous À VENIR entrent dans le brief : un brief est ce qui
  // reste à faire, pas un journal. Ce qui est en cours reste visible sur
  // l'écran, qui lit la fenêtre complète.
  const upcoming = demoAgendaWindow({
    now,
    from: now,
    to: new Date(now.getTime() + 36 * 3600_000),
    calendarIds: null,
  }).filter(item => Date.parse(item.start ?? '') > now.getTime())

  const threads = demoThreads(now)
  const awaitingReply = threads.filter(item => item.awaitingReply)
  const unread = threads.filter(item => item.unread)
  const positiveReplies = threads.filter(item => item.lastDirection === 'inbound' && !item.unread)

  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone }).format(now),
    timeZone,
    firstName,
    // Les blocages de parcours ne se scriptent PAS : ils se dérivent des objets
    // de la salle par le chemin de production, et `BriefingService.buildDemo`
    // les pose par-dessus. En écrire ici montrerait une liste que le produit ne
    // sait pas produire (#1503, #1506).
    chainBlockers: [],
    // #3256 (BEL-SC-227.19) — MÊME RAISON que `chainBlockers` juste au-dessus :
    // les risques critiques ne se scriptent PAS, `BriefingService.buildDemo`
    // les pose par-dessus par le chemin de production.
    criticalRisks: [],
    // #2151.23 / #2151.61 — VIDE À DESSEIN dans le brief SCRIPTÉ, et rempli par
    // le chemin de PRODUCTION : `BriefingController.today()` lit
    // `discover_alert_events` pour l'espace, et la salle de démonstration a ses
    // lignes semées comme les autres (voir `demo-coverage.ts`). En écrire ici
    // montrerait des alertes que le produit n'a pas produites — exactement ce
    // que `chainBlockers` refuse juste au-dessus, pour la même raison.
    discoverAlerts: [],
    discoverAlertsLastEventAt: null,
    // #2147.5 — MÊME RAISON que `chainBlockers` juste au-dessus : posé par le
    // chemin de PRODUCTION (`BriefingService.buildDemo`), qui rend `[]`
    // honnêtement (`analysis_runs` est « vide à dessein » en salle).
    runningJobs: [],
    agenda: {
      state: 'ready',
      reason: null,
      // #2098.9 — la salle « lit » à l'instant de la visite, comme le reste du
      // jeu (calculé depuis `now`, jamais une date fixe).
      readAt: now.toISOString(),
      events: upcoming,
      // Conflits et rendez-vous à préparer sont CALCULÉS, avec les mêmes
      // fonctions que le vrai brief : une démo qui scripterait ses conflits
      // montrerait une mécanique que le produit ne sait pas reproduire.
      conflicts: detectConflicts(upcoming),
      needsPreparation: selectMeetingsToPrepare(upcoming, now),
      // #2095.12 (épopée #2993) — REJOINT par `BriefingService.buildDemo`
      // (`this.buildMeetingsWithoutFollowup`, chemin de PRODUCTION) : cette
      // fonction scripte le jeu, elle ne lit pas les notes.
      unfollowedMeetings: [],
    },
    mail: { state: 'ready', reason: null, readAt: now.toISOString(), awaitingReply, unread, positiveReplies },
    // Les tâches d'une salle de démonstration sont RÉELLES : elles vivent dans
    // la table, seedées comme le reste, et le service les lit par le chemin de
    // production. Ce bloc vide n'est là que pour compléter la forme — il est
    // remplacé par le vrai à l'assemblage, jamais destiné à tenir lieu de
    // contenu devant un prospect.
    tasks: { state: 'ready', reason: null, readAt: now.toISOString(), tasks: [], overdueCount: 0, todayCount: 0 },
    // #2101.13 — vide à dessein : un compte de démonstration n'a réglé aucune
    // préférence, `readProtectedTime` rendrait `null` de la même façon sur le
    // chemin de production tant que personne ne l'a choisie.
    protectedTime: null,
    // #2101.17 — MÊME RAISON : `readAgendaPreferences` rendrait `{}` de la
    // même façon sur le chemin de production tant que personne n'a réglé ni
    // sa durée de dossier ni sa réserve.
    agendaPreferences: {},
    accountsToWatch: input.accounts.map((account, index) => ({
      accountId: account.accountId,
      companyName: account.companyName,
      reasonKey: 'briefing.account.freshSignal',
      href: `/accounts/${account.accountId}`,
      // ⚠️ La DATE de détection, calculée depuis l'instant de la visite comme
      // tout le reste du jeu. Sans elle, la salle de démonstration montrerait
      // « date inconnue » sur chaque compte — c'est-à-dire l'état d'exception
      // du produit affiché comme son état normal, devant un prospect. Six et
      // dix-huit heures : deux comptes bougés ce matin, un hier soir, tous
      // DANS la fenêtre de fraîcheur que le vrai brief applique.
      detectedAt: hoursFromNow(now, -(6 + index * 6)),
      // La démonstration montre le cas NOMINAL : une détection exacte. Le cas
      // « suivi depuis » vient du backfill, qui n'existe pas dans une salle.
      detectionExact: true,
      // #2107.28 — CE QUI a bougé, ouvertement fictif : sans lui, la carte
      // « Aujourd'hui » d'une salle de démo dirait encore seulement le nom du
      // compte, exactement l'écran vide qu'une fonctionnalité livrée sans sa
      // moitié démo laisse découvrir en réunion plutôt qu'en CI.
      signalLabel: DEMO_SIGNAL_LABELS[index % DEMO_SIGNAL_LABELS.length],
      // #2107.33 — même index que `signalLabel` juste au-dessus : la raison
      // commerciale du MÊME signal fictif, jamais une phrase indépendante.
      esnReason: DEMO_ESN_REASONS[index % DEMO_ESN_REASONS.length],
      // Théo A today-jour — le lien vers la page d'origine : AUCUN dans la salle de démonstration, à dessein. Le
      // libellé du signal ci-dessus est ouvertement fictif ; lui prêter l'URL d'un vrai éditeur affirmerait qu'un
      // article réel le publie. « Pas d'URL connue = pas de lien, rien d'inventé » (Louis 22/10).
      signalSourceUrl: null,
      signalSourceKind: null,
      // #4068.6 — l'historique daté du compte, fictif (voir {@link DEMO_ACCOUNT_HISTORY}).
      history: DEMO_ACCOUNT_HISTORY[index % DEMO_ACCOUNT_HISTORY.length].map(fact => ({
        date: daysAgo(now, fact.daysAgo).slice(0, 10),
        kind: fact.kind,
        label: fact.label,
      })),
      // #2097.21 — `null` À DESSEIN (doctrine `demo-dataset.ts` : « aucun
      // portrait, aucun logo » — on ne redessine pas la marque d'un tiers).
      // La carte retombe sur le monogramme, comme partout ailleurs en démo.
      logoUrl: null,
      // #2097.21 (correctif) — le VRAI site du VRAI dossier (SNCF, Société Générale…),
      // à l'identique de ce que `/accounts` sert déjà en salle
      // (`AccountTableRow.tsx`, `demo-dataset.ts:website`). Ce n'est pas la
      // même règle que `logo_url` : un favicon réellement servi par le site
      // n'est pas « la marque d'un tiers redessinée » — c'est ce que le site
      // sert publiquement à quiconque, exactement ce que `LogoController`
      // relaie. Sans lui, la carte perdrait le seul repli qui lui reste.
      website: account.website,
      // #2107.40 — `null` À DESSEIN : la mémoire marché (GA-258, quatre
      // tables PARTAGÉES) n'est jamais seedée, même raison que `logoUrl`
      // ci-dessus n'est pas une marque redessinée — voir
      // `DEMO_BRIEFING_STRUCTURAL_POTENTIAL_COVERAGE` (`demo-coverage.ts`).
      structuralPotentialPaths: null,
      // #2107.42 — `null` ICI (brief SCRIPTÉ), posé par le CONTRÔLEUR pour
      // TOUT espace, démo compris : `BriefingController.today()` appelle
      // `ContactsService.rankForAccount` sur les contacts RÉELLEMENT seedés
      // de la salle (`demo-dataset.ts`), jamais une seconde fois ici — même
      // patron que `structuralPotentialPaths`, sauf que la lecture RÉUSSIT en
      // démo (les contacts sont seedés, la mémoire marché ne l'est pas).
      accessPath: null,
    })),
    // Le tri des actions reste celui du produit : la démo ne prouve rien si
    // elle montre un classement que le vrai brief ne produirait pas.
    actions: [],
    generatedAt: now.toISOString(),
  }
}
