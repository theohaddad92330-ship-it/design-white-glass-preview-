import type { AgendaCalendar, AgendaCalendars, AgendaEvent } from '@bellum/contracts'
import { zonedParts, zonedTimeToInstant } from '../agenda/time-zone'
import { maskPrivateAgendaEvent } from '../agenda/agenda-backend'

/**
 * L'AGENDA d'une salle de démonstration.
 *
 * L'écran « Ma journée » sait désormais montrer une journée et une semaine, se
 * caler sur l'heure qu'il est et ouvrir la visio d'un rendez-vous. Sans ce
 * fichier, un prospect ouvrirait tout ça sur « aucun agenda connecté » — un
 * visiteur ne branche évidemment pas l'agenda de son entreprise sur un lien
 * qu'on lui a envoyé. C'est la règle de parité démo, appliquée à la capacité
 * agenda plutôt qu'au seul bloc du brief.
 *
 * Trois partis pris.
 *
 * 1. Tout est FICTIF et le montre : adresses en `.example` (RFC 2606, domaine
 *    réservé), sociétés inventées, liens de visio en `meet.example`. Aucun
 *    appel réseau n'est fait et aucune vraie donnée n'est lue.
 * 2. Les évènements sont posés à l'HEURE MURALE, à partir du jour de la visite.
 *    Un jeu figé afficherait « réunion du 3 août » à un prospect de novembre, et
 *    des décalages en heures pleines placeraient un point d'équipe à 3 h 47 du
 *    matin — la démonstration se saborde toute seule.
 * 3. La semaine est REMPLIE, pas seulement les 36 prochaines heures : la vue
 *    « Semaine » est précisément ce qu'on veut montrer, et une semaine avec
 *    deux rendez-vous ne démontre rien.
 */

const DEMO_TIME_ZONE = 'Europe/Paris'

/** Boîte fictive de la salle de démonstration — la même que la messagerie. */
const DEMO_ORGANIZER = 'demo@bellum.example'

function shell(partial: Partial<AgendaEvent> & Pick<AgendaEvent, 'id' | 'summary' | 'start' | 'end'>): AgendaEvent {
  return {
    description: null,
    location: null,
    organizer: DEMO_ORGANIZER,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
    ...partial,
  }
}

/** L'instant d'une heure murale, `dayOffset` jours après le jour de la visite. */
function at(now: Date, dayOffset: number, hour: number, minute = 0): Date {
  const today = zonedParts(now, DEMO_TIME_ZONE)
  const anchor = zonedTimeToInstant({ ...today, hour: 12, minute: 0 }, DEMO_TIME_ZONE)
  const targetDay = zonedParts(new Date(anchor.getTime() + dayOffset * 86400_000), DEMO_TIME_ZONE)
  return zonedTimeToInstant({ ...targetDay, hour, minute }, DEMO_TIME_ZONE)
}

function slot(now: Date, dayOffset: number, hour: number, minutes: number, startMinute = 0) {
  const start = at(now, dayOffset, hour, startMinute)
  return { start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString() }
}

function hoursFromNow(now: Date, hours: number): { start: string; end: string } {
  const start = new Date(now.getTime() + hours * 3600_000)
  return { start: start.toISOString(), end: new Date(start.getTime() + 3600_000).toISOString() }
}

/**
 * Les agendas d'une salle de démonstration.
 *
 * Ils sont plusieurs, et c'est le sujet : la démonstration doit montrer qu'on
 * choisit CEUX qu'on lit. « Jours fériés » est là exprès — c'est l'exemple
 * canonique de l'agenda qu'on ne veut pas voir dans sa journée.
 */
export function demoAgendaCalendars(): AgendaCalendar[] {
  return [
    { id: 'demo-cal-moi', name: 'Mon agenda', provider: 'google', primary: true, canWrite: false },
    { id: 'demo-cal-equipe', name: 'Équipe commerciale', provider: 'google', primary: false, canWrite: false },
    { id: 'demo-cal-clients', name: 'Rendez-vous clients', provider: 'google', primary: false, canWrite: false },
    { id: 'demo-cal-feries', name: 'Jours fériés en France', provider: 'google', primary: false, canWrite: false },
  ]
}

/** La réponse du sélecteur en démonstration. La SÉLECTION n'est pas scriptée :
 *  elle vient du profil de la salle, comme pour un vrai compte — c'est ce qui
 *  fait que cocher un agenda devant un prospect a un effet visible. */
export function demoAgendaCalendarListing(): AgendaCalendars {
  return { calendars: demoAgendaCalendars(), selectedCalendars: [], readsAll: false, unavailable: [] }
}

/** L'agenda de rattachement de chaque évènement fictif — ce qui rend la
 *  sélection multiple DÉMONTRABLE : décocher « Jours fériés » doit se voir. */
const CALENDAR_OF: Record<string, string> = {
  'demo-event-pipe': 'demo-cal-equipe',
  'demo-event-verdal': 'demo-cal-clients',
  'demo-event-pharmatek': 'demo-cal-clients',
  'demo-event-interne': 'demo-cal-equipe',
  'demo-event-annule': 'demo-cal-clients',
  'demo-event-altiver': 'demo-cal-clients',
  'demo-event-salon': 'demo-cal-moi',
  'demo-event-pharmatek-suivi': 'demo-cal-clients',
  'demo-event-pharmatek-cadrage': 'demo-cal-clients',
  'demo-event-verdal-comite': 'demo-cal-clients',
  'demo-event-recrutement': 'demo-cal-moi',
  'demo-event-personnel': 'demo-cal-moi',
  'demo-event-ferie': 'demo-cal-feries',
  'demo-event-nova': 'demo-cal-clients',
  'demo-event-ooo': 'demo-cal-moi',
  'demo-event-prive': 'demo-cal-moi',
}

/**
 * #2770 (#2101.19/.21/.22/.37) — l'identifiant du seul évènement démo écrit
 * par la porte de proposition de créneau, lu par
 * `BriefingService.listBellumCreatedEventIds` en salle de démonstration
 * (aucune vraie ligne `agenda_bellum_created_event` n'existe jamais pour un
 * utilisateur démo : `confirmSlotProposal` y est bloqué, comme toute écriture
 * agenda).
 */
export const DEMO_BELLUM_CREATED_EVENT_ID = 'demo-event-nova-creneau-propose'

/**
 * La semaine fictive.
 *
 * Deux rendez-vous se chevauchent volontairement (c'est une des mécaniques à
 * démontrer), deux portent un lien de visio, un est une journée entière, et le
 * point d'équipe est interne — de quoi montrer que l'écran distingue un vrai
 * rendez-vous client d'un point interne.
 */
export function demoAgendaEvents(now: Date): AgendaEvent[] {
  return [
    shell({
      id: 'demo-event-pipe',
      summary: 'Revue de pipe hebdomadaire',
      ...slot(now, 0, 8, 45, 30),
      isExternal: false,
      conferenceUrl: 'https://meet.example/demo-pipe',
      // #2103.29 — le seul évènement DIT hebdomadaire du jeu : celui qui montre
      // le badge « récurrent » sans en inventer un dédié.
      recurring: true,
    }),
    /**
     * LE RENDEZ-VOUS QUI SE PRÉPARE VRAIMENT (01/09/2026).
     *
     * Les autres évènements de cette semaine sont des sociétés inventées SUR
     * PLACE : aucun compte du portefeuille de démonstration ne leur correspond,
     * donc le brief d'avant rendez-vous s'y ouvre sur « aucun compte ne
     * correspond » — le message JUSTE, mais qui ne montre rien du produit.
     *
     * Celui-ci est branché sur le client de livraison du jeu de données
     * (`SNCF`, décision Louis 04/10/2026) : le compte se rattache par le titre
     * du rendez-vous. Aucun invité n'est posé — rien n'est déclaré sur une
     * personne réelle —, donc les blocs qui lisent une PERSONNE restent vides à
     * dessein (voir `DEMO_MEETING_BRIEF_BLOCKS`).
     *
     * ⚠️ Il ne remplace aucun des évènements existants : la démonstration doit
     * continuer à montrer ce que fait le produit quand il ne sait PAS à qui
     * rattacher un rendez-vous. Les deux cas sont vrais, et les deux se voient.
     */
    shell({
      id: 'demo-event-nova',
      summary: 'SNCF — point besoin programme de refonte applicative',
      ...hoursFromNow(now, 2),
      // Décision Louis 04/10/2026 — aucun invité : la présence (« accepté ») d'une
      // personne réelle serait une déclaration inventée. Le compte se rattache
      // par le TITRE (« SNCF »), jamais par une adresse fabriquée.
      attendees: [],
      conferenceUrl: 'https://meet.example/demo-nova',
      // #2985 — le rendez-vous qui OFFRE « Préparer le rendez-vous » (compte rattaché par le titre)
      // est aussi une occurrence de série : le pré-brief y affiche « récurrent » (#2319.14).
      recurring: true,
    }),
    shell({
      id: 'demo-event-verdal',
      summary: 'Verdal Distribution (démo) — cadrage refonte parcours commande',
      ...hoursFromNow(now, 3),
      attendees: [
        {
          email: 'c.vasseur@verdal-distribution.example',
          displayName: 'Claire Vasseur (client fictif)',
          responseStatus: 'accepted',
          external: true,
        },
      ],
      conferenceUrl: 'https://meet.example/demo-verdal',
    }),
    shell({
      id: 'demo-event-pharmatek',
      summary: 'Pharmatek (démo) — retour sur l’audit d’hébergement',
      ...hoursFromNow(now, 3.5),
      attendees: [
        {
          email: 'k.delorme@pharmatek.example',
          displayName: 'Karim Delorme (client fictif)',
          responseStatus: 'needsAction',
          external: true,
        },
      ],
    }),
    shell({
      id: 'demo-event-interne',
      summary: 'Point hebdo équipe commerciale',
      ...slot(now, 1, 9, 45, 30),
      isExternal: false,
    }),
    /**
     * #2103.27 — le SEUL évènement ANNULÉ du jeu : celui qui montre que
     * `AgendaBoard` le nomme désormais dans sa section lecture seule au lieu de
     * simplement le faire disparaître. Sans lui, la salle de démonstration ne
     * porterait aucune donnée montrant ce que le point corrige.
     */
    shell({
      id: 'demo-event-annule',
      summary: 'Point Altiver Industries — annulé par le client',
      ...slot(now, 1, 11, 30),
      attendees: [
        {
          email: 't.reynier@altiver-industries.example',
          displayName: 'Thomas Reynier (client fictif)',
          responseStatus: 'declined',
          external: true,
        },
      ],
      cancelled: true,
      status: 'cancelled',
    }),
    shell({
      id: 'demo-event-altiver',
      summary: 'Altiver Industries (démo) — supervision, point de cadrage',
      ...slot(now, 1, 14, 60),
      attendees: [
        {
          email: 't.reynier@altiver-industries.example',
          displayName: 'Thomas Reynier (client fictif)',
          responseStatus: 'accepted',
          external: true,
        },
      ],
      conferenceUrl: 'https://meet.example/demo-altiver',
      location: 'Visioconférence',
    }),
    shell({
      id: 'demo-event-salon',
      summary: 'Salon Solutions IT (démo) — journée sur stand',
      // Journée entière : une date nue, exactement comme la rendent les
      // fournisseurs. C'est le cas qui casse les affichages qui supposent
      // toujours une heure.
      start: zonedDateOnly(at(now, 2, 12)),
      end: zonedDateOnly(at(now, 3, 12)),
      isExternal: false,
      location: 'Paris Expo, Porte de Versailles',
    }),
    shell({
      id: 'demo-event-pharmatek-suivi',
      summary: 'Pharmatek (démo) — suivi de la proposition',
      ...slot(now, 2, 11, 45),
      attendees: [
        {
          email: 'i.roussel@pharmatek.example',
          displayName: 'Inès Roussel (client fictif)',
          responseStatus: 'tentative',
          external: true,
        },
      ],
      // Le créneau lui-même est PROPOSÉ, pas fixé (30/08/2026) — cohérent
      // avec son unique invitée, qui n'a pas encore répondu (`tentative`
      // juste au-dessus, mais c'est un AUTRE champ : la réponse d'UN invité,
      // pas le statut de l'évènement). `AgendaGrid.tsx`/`AgendaBoard.tsx`
      // affichent ce statut depuis le 28/09/2026 (#2770/#2101.19/.37,
      // `isProposedAgendaEvent`) — voir `demo-agenda-status-coverage.spec.ts`
      // et `demo-coverage.ts`.
      status: 'tentative',
    }),
    shell({
      id: 'demo-event-verdal-comite',
      summary: 'Verdal Distribution (démo) — comité de pilotage',
      ...slot(now, 3, 10, 90),
      attendees: [
        {
          email: 'j.morvan@verdal-distribution.example',
          displayName: 'Julie Morvan (client fictif)',
          responseStatus: 'accepted',
          external: true,
        },
      ],
      conferenceUrl: 'https://meet.example/demo-comite',
    }),
    /**
     * #2102.4 — le conflit CLIENT / INTERNE : un point interne posé pendant le comité de pilotage client
     * ci-dessus. `ConflictDialog` en tire l'importance du seul TYPE de réunion (`isExternal`) — la ligne
     * « le rendez-vous client pèse davantage » se voit donc en démo, à côté du conflit client/client
     * Verdal/Pharmatek (cas « même type »). Aucun invité : rien n'est déclaré sur une personne.
     */
    shell({
      id: 'demo-event-interne-chevauchement',
      summary: 'Point interne — préparation du comité (démo)',
      ...slot(now, 3, 10, 45, 30),
      isExternal: false,
    }),
    shell({
      id: 'demo-event-recrutement',
      summary: 'Point recrutement — deux profils à positionner',
      ...slot(now, 4, 16, 45),
      isExternal: false,
      // #2319.10 — CONFIDENTIEL, posé par le calendrier lui-même : le brief se
      // prépare normalement, mais l'écran le NOMME plutôt que de le taire.
      visibility: 'confidential',
      // #2390.9 (épopée #2926) — LA SEULE salle réservée du jeu : un invité
      // marqué `resource: true`, comme Google/Microsoft le rendent réellement
      // (jamais une simple adresse ou un lieu en texte libre).
      attendees: [
        {
          email: 'salle-paris-3e@bellum.example',
          displayName: 'Salle Paris 3e',
          responseStatus: 'accepted',
          external: false,
          resource: true,
          // #2390.9 — le nombre de places, comme l'API Places le rend.
          capacity: 8,
        },
      ],
    }),
    /**
     * #2319.18 — UNE RÉUNION PERSONNELLE, distincte d'un point interne. Les
     * deux n'ont pas de fiche client à préparer, mais pour des raisons
     * différentes : un point interne est un moment de TRAVAIL sans client en
     * face, une réunion personnelle n'est pas un moment de travail du tout.
     * Aucun invité (externe ou non) : c'est le rendez-vous chez le dentiste
     * posé dans le même agenda que le reste de la semaine.
     */
    /**
     * #2095.12 (épopée #2993) — LE SEUL RENDEZ-VOUS DÉJÀ TERMINÉ du jeu :
     * externe, dans la fenêtre de rattrapage (`MEETING_FOLLOWUP_LOOKBACK_HOURS`,
     * `briefing-actions.ts`), et sans aucune note seedée qui porte son
     * `sourceEventId` (`demo-dataset.ts` n'en pose aucune sur cet identifiant).
     * Sans lui, la salle ne portait aucune donnée montrant la carte
     * `meeting_no_followup` — même raison que `demo-event-nova` plus haut pour
     * `meeting_prep`.
     */
    shell({
      id: 'demo-event-pharmatek-cadrage',
      summary: 'Pharmatek (démo) — atelier de cadrage sécurité',
      ...hoursFromNow(now, -20),
      attendees: [
        {
          email: 'k.delorme@pharmatek.example',
          displayName: 'Karim Delorme (client fictif)',
          responseStatus: 'accepted',
          external: true,
        },
      ],
    }),
    shell({
      // #2770 (#2101.19/.21/.22/.37) — le SEUL évènement du jeu qui montre la
      // distinction « confirmé, proposé par BellumAI » sur la grille/le
      // plateau partagés. Confirmé (contrairement à `demo-event-pharmatek-
      // suivi`, qui reste `tentative`) : c'est la porte de proposition de
      // créneau (`AgendaSlotProposalTrigger`) qui a écrit ce rendez-vous, pas
      // un geste manuel — voir `DEMO_BELLUM_CREATED_EVENT_ID`,
      // `BriefingService.listBellumCreatedEventIds`.
      id: 'demo-event-nova-creneau-propose',
      summary: 'SNCF — point de suivi',
      ...slot(now, 1, 15, 30),
      // Décision Louis 04/10/2026 — aucun invité : la présence (« accepté ») d'une
      // personne réelle serait une déclaration inventée. Le compte se rattache
      // par le TITRE (« SNCF »), jamais par une adresse fabriquée.
      attendees: [],
      conferenceUrl: 'https://meet.example/demo-nova-suivi',
    }),
    shell({
      id: 'demo-event-personnel',
      summary: 'Rendez-vous personnel',
      ...slot(now, 4, 12, 30),
      isExternal: false,
      visibility: 'personal',
    }),
    shell({
      id: 'demo-event-ferie',
      summary: 'Jour férié (agenda de démonstration)',
      start: zonedDateOnly(at(now, 5, 12)),
      end: zonedDateOnly(at(now, 6, 12)),
      isExternal: false,
    }),
    /**
     * #2390.6 (épopée #2926) — LE SEUL bloc d'indisponibilité du jeu :
     * journée entière, comme Google le pose réellement pour un
     * `eventType: outOfOffice`. Il chevauche `demo-event-interne` et
     * `demo-event-altiver`, déjà posés le même jour — sans lui, la salle ne
     * portait aucune donnée montrant `GET /agenda/conflicts/owner-unavailable`.
     */
    shell({
      id: 'demo-event-ooo',
      summary: 'Absent du bureau (démo)',
      start: zonedDateOnly(at(now, 1, 12)),
      end: zonedDateOnly(at(now, 2, 12)),
      isExternal: false,
      providerEventType: 'outOfOffice',
    }),
    /**
     * #2390.16 — UN évènement privé, tel que la synchronisation le rend :
     * créneau seul (`busyOnly`), passé par la même `maskPrivateAgendaEvent`
     * que les vraies agendas — le titre fictif ci-dessous ne sort jamais du
     * masque, il prouve que la démo montre « Indisponible » et rien d'autre.
     */
    maskPrivateAgendaEvent(
      shell({
        id: 'demo-event-prive',
        summary: 'Rendez-vous privé (démo)',
        ...slot(now, 3, 18, 60),
        isExternal: false,
        visibility: 'private',
      }),
    ),
  ]
}

/** La date nue (`YYYY-MM-DD`) d'un instant, pour un évènement « journée entière ». */
function zonedDateOnly(instant: Date): string {
  const { year, month, day } = zonedParts(instant, DEMO_TIME_ZONE)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * La fenêtre demandée, filtrée sur les agendas COCHÉS.
 *
 * La démonstration applique la même règle que la vraie lecture : un agenda
 * décoché ne remonte pas. Sans ça, décocher « Jours fériés » devant un prospect
 * ne changerait rien à l'écran, et la fonctionnalité qu'on est en train de
 * montrer aurait l'air cassée.
 */
export function demoAgendaWindow(input: {
  now: Date
  from: Date
  to: Date
  calendarIds: string[] | null
}): AgendaEvent[] {
  const wanted = input.calendarIds?.length ? new Set(input.calendarIds) : null
  return demoAgendaEvents(input.now)
    .filter(event => !wanted || wanted.has(CALENDAR_OF[event.id] ?? ''))
    .filter(event => {
      // Un évènement « journée entière » porte une date nue : il appartient au
      // jour demandé dès que ce jour est dans la fenêtre.
      const start = Date.parse(event.start ?? '')
      const end = Date.parse(event.end ?? event.start ?? '')
      if (Number.isNaN(start) || Number.isNaN(end)) return false
      return end > input.from.getTime() && start < input.to.getTime()
    })
    .sort((first, second) => Date.parse(first.start ?? '') - Date.parse(second.start ?? ''))
}
