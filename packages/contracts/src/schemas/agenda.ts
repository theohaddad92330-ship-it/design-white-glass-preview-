import { z } from 'zod'

/**
 * L'AGENDA de l'utilisateur, capacité provider-agnostique (Google Calendar ou
 * Outlook Calendar), pendant de `mailbox.ts`.
 *
 * Les méta-analyses besoins (03/08/2026) en font un socle P0 et lui attachent
 * quatre exigences que le code ne servait pas encore : trouver des créneaux
 * libres, détecter les conflits, repérer les annulations, et — règle n°15 des
 * garde-fous — ne JAMAIS ajouter l'utilisateur comme participant de sa propre
 * réunion. Cette dernière n'est pas cosmétique : un organisateur listé en
 * invité reçoit sa propre invitation et son agenda affiche un « en attente de
 * réponse » qui ne se résoudra jamais.
 */

export const agendaProviderSchema = z.enum(['google', 'microsoft'])
export type AgendaProvider = z.infer<typeof agendaProviderSchema>

export const agendaAttendeeSchema = z.object({
  email: z.string(),
  displayName: z.string().nullable(),
  responseStatus: z.string().nullable(),
  /** L'invité est-il hors de l'organisation de l'utilisateur ? */
  external: z.boolean(),
  /**
   * #2390.9 — cet « invité » est-il en réalité une SALLE réservée ? Google
   * (`attendees[].resource`) et Microsoft Graph (`attendees[].type ===
   * 'resource'`) documentent tous deux le champ sur l'évènement lui-même —
   * aucun scope Admin/domaine requis, contrairement à la CAPACITÉ d'une salle
   * (voir `agent_docs/env-reference.md`, lecture #2390.9). Optionnel : une
   * réponse antérieure à ce champ ne le porte pas, jamais confondu avec « pas
   * une salle ».
   */
  resource: z.boolean().optional(),
  /**
   * #2390.9 — le nombre de places de cette salle, QUAND il a été lu (Microsoft
   * Graph Places, portée optionnelle `Place.Read.All`). Absent = inconnu, jamais
   * « 0 place ».
   */
  capacity: z.number().int().positive().optional(),
})
export type AgendaAttendee = z.infer<typeof agendaAttendeeSchema>

/**
 * Les invités de cet évènement qui sont en réalité des SALLES réservées —
 * #2390.9. Jamais un lieu deviné : seuls les invités que le fournisseur a
 * lui-même marqués « ressource » comptent.
 */
export function roomAttendeesOf(event: Pick<AgendaEvent, 'attendees'>): AgendaAttendee[] {
  return event.attendees.filter(attendee => attendee.resource === true)
}

/**
 * Les invités de cet évènement qui sont réellement des PERSONNES — le
 * complément de `roomAttendeesOf`. Recette 29/09 (#2390.9) : une salle
 * réservée ne doit jamais gonfler un compte de « participants » ou de
 * « invités prévenus » — la source unique de cette exclusion, pour ne pas la
 * refaire à chaque appelant (GA-26).
 */
export function personAttendeesOf(event: Pick<AgendaEvent, 'attendees'>): AgendaAttendee[] {
  return event.attendees.filter(attendee => attendee.resource !== true)
}

/**
 * #2390.9 — les salles trop petites pour cet évènement : places LUES inférieures
 * au nombre de personnes (invités humains + organisateur s'il n'est pas déjà
 * invité). Une salle sans capacité lue ne produit aucune ligne.
 */
export function roomCapacityShortfalls(
  event: Pick<AgendaEvent, 'attendees' | 'organizer'>,
): Array<{ room: AgendaAttendee; capacity: number; people: number }> {
  const persons = personAttendeesOf(event)
  const organizer = event.organizer?.trim().toLowerCase() ?? ''
  const organizerExtra = organizer && !persons.some(p => p.email.trim().toLowerCase() === organizer) ? 1 : 0
  const people = persons.length + organizerExtra
  return roomAttendeesOf(event)
    .filter(room => room.capacity !== undefined && room.capacity < people)
    .map(room => ({ room, capacity: room.capacity as number, people }))
}

export const agendaEventSchema = z.object({
  id: z.string().min(1),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  /** ISO 8601 (ou date nue pour un évènement « journée entière »). */
  start: z.string().nullable(),
  end: z.string().nullable(),
  organizer: z.string().nullable(),
  attendees: z.array(agendaAttendeeSchema),
  /** Lien visio quand il y en a un (Meet, Teams…), sinon null. */
  conferenceUrl: z.string().nullable(),
  webUrl: z.string().nullable(),
  /**
   * Le statut BRUT, tel que rendu par le fournisseur — volontairement une
   * chaîne libre, et non `agendaEventStatusSchema` ci-dessous.
   *
   * Google renvoie ce champ tel quel, sans validation
   * (`apps/api/src/modules/google/google.client.ts` — `event?.status ? String(event.status) : null`),
   * et les deux backends d'agenda (`google-agenda.backend.ts`,
   * `microsoft-agenda.backend.ts`, hors périmètre de ce chantier) l'assignent
   * directement depuis la réponse du fournisseur. Le typer en énumération
   * fermée ICI casserait leur affectation dès qu'une valeur imprévue arrive —
   * exactement le risque qu'une énumération fermée est censée réduire, pas
   * provoquer. `normalizeAgendaEventStatus` / `isConfirmedAgendaEvent`
   * ci-dessous sont le moyen sûr de LIRE ce champ sans jamais confondre un
   * créneau PROPOSÉ avec un rendez-vous FIXÉ.
   */
  status: z.string().nullable(),
  /** Vrai dès qu'un participant est hors organisation : c'est ce qui distingue
   *  un vrai rendez-vous client d'un point interne, et donc ce qui déclenche
   *  brief, compte rendu et trace CRM. */
  isExternal: z.boolean(),
  /** Annulé côté fournisseur — la source du déclencheur « replanifier ». */
  cancelled: z.boolean(),
  /**
   * #2319.10 / #2319.18 — la confidentialité BRUTE, telle que rendue par le
   * fournisseur. `private` n'apparaît jamais ici : `isPrivateAgendaEvent`
   * le réduit à un créneau `busyOnly` (#2390.16, avant : exclu, #2388.23). Chaîne libre comme `status` ci-dessus, pour la même raison —
   * les deux backends l'assignent directement depuis la réponse du
   * fournisseur, et Google/Microsoft ne portent pas le même vocabulaire.
   * `normalizeAgendaEventVisibility` ci-dessous est le moyen sûr de LIRE ce
   * champ. Optionnel : une réponse antérieure à ce champ ne le porte pas.
   */
  visibility: z.string().nullable().optional(),
  /**
   * #2390.16 — l'évènement est PRIVÉ côté fournisseur : seul le créneau
   * voyage (début, fin, annulation), tout le reste est vidé à la source
   * (`maskPrivateAgendaEvent`, apps/api) et l'écran affiche « Indisponible ».
   * Un créneau absent de l'agenda laisserait croire l'utilisateur libre ; un
   * créneau masqué compte dans les conflits sans rien révéler. Optionnel :
   * une réponse antérieure à ce champ ne le porte pas, jamais confondu avec
   * « évènement ordinaire ».
   */
  busyOnly: z.boolean().optional(),
  /**
   * #2103.29 (épopée #2878) — appartient-il à une SÉRIE récurrente ? Dérivé de
   * l'identifiant que chaque fournisseur pose sur une OCCURRENCE (jamais sur
   * l'évènement maître lui-même) : `recurringEventId` côté Google
   * (`google.client.ts`), `seriesMasterId` côté Microsoft Graph
   * (`microsoft.client.ts`) — l'identifiant lui-même ne voyage pas plus loin,
   * seul le fait qu'il existe. Optionnel : une réponse antérieure à ce champ
   * ne le porte pas, jamais confondu avec « non récurrent ».
   */
  recurring: z.boolean().optional(),
  /**
   * #2770 (#2101.19/.21/.22/.37) — cet évènement a-t-il été ÉCRIT par la
   * porte de proposition de créneau (`confirmSlotProposal`,
   * `agenda-slot-proposal.ts`) ? JAMAIS rendu par un fournisseur — calculé
   * côté web en croisant `event.id` avec `GET
   * /briefing/bellum-created-event-ids` (`useBellumCreatedEventIds`), qui lit
   * la table locale `agenda_bellum_created_event` plutôt qu'un round-trip
   * `extendedProperties` chez Google/Microsoft (le second chantier que le
   * docblock d'`agenda-slot-proposal.ts` nommait non engagé). Optionnel :
   * absent tant que rien ne l'a croisé, jamais confondu avec « pas créé par
   * BellumAI ».
   */
  createdByBellum: z.boolean().optional(),
  /**
   * #2390.1 / #2390.6 — la NATURE brute de l'évènement, telle que Google la
   * rend sur `events.list`/`events.get` : `eventType` ∈ `default` |
   * `outOfOffice` | `focusTime` | `workingLocation` | `fromGmail` | `birthday`
   * (developers.google.com/workspace/calendar/api/v3/reference/events, champ
   * `eventType`). Microsoft Graph ne documente AUCUN champ équivalent sur la
   * ressource `event` (learn.microsoft.com/graph/api/resources/event) — un
   * contrat d'API non vérifiable ne se devine pas (CLAUDE.md) : `null` côté
   * Microsoft, TOUJOURS, plutôt qu'une valeur inventée. Optionnel : une
   * réponse antérieure à ce champ ne le porte pas.
   */
  providerEventType: z.string().nullable().optional(),
  /**
   * #2390.6 — le PROPRIÉTAIRE est-il marqué indisponible sur ce créneau,
   * BRUT côté Microsoft : `showAs` ∈ `free` | `tentative` | `busy` | `oof` |
   * `workingElsewhere` | `unknown`
   * (learn.microsoft.com/graph/api/resources/event, champ `showAs`). Google
   * ne rend rien d'équivalent par évènement (sa notion la plus proche est
   * `eventType: outOfOffice`, déjà portée par `providerEventType` ci-dessus) :
   * `null` côté Google, TOUJOURS. Optionnel : une réponse antérieure à ce
   * champ ne le porte pas.
   */
  showAs: z.string().nullable().optional(),
})
export type AgendaEvent = z.infer<typeof agendaEventSchema>

/**
 * Le propriétaire de l'évènement est-il marqué INDISPONIBLE — #2390.6.
 *
 * Deux vocabulaires fournisseur distincts, jamais mélangés à la valeur d'un
 * troisième champ : Google marque un BLOC d'absence dédié
 * (`providerEventType === 'outOfOffice'`), Microsoft marque n'IMPORTE QUEL
 * évènement en absence (`showAs === 'oof'`). Une valeur absente ou tout autre
 * mot ne se lit jamais « indisponible » : deviner à la hausse fabriquerait un
 * conflit qui n'existe pas.
 */
export function isOwnerUnavailable(event: Pick<AgendaEvent, 'providerEventType' | 'showAs'>): boolean {
  return event.providerEventType === 'outOfOffice' || event.showAs === 'oof'
}

/**
 * #2390.1 — les onze NATURES d'objet calendrier que l'analyse de conflits sait
 * distinguer. ⚠️ tranché sans Louis (04/10) : la liste LAU-FINAL-104 n'est écrite
 * nulle part (le registre n'en nomme que 7) ; ces onze natures ne sont donc pas
 * inventées, elles sont les seules que les champs RÉELLEMENT rendus par
 * Google/Microsoft permettent de séparer. Si la liste source arrive, on la
 * remplace ici — c'est l'unique endroit.
 */
export const AGENDA_OBJECT_KINDS = [
  'private_busy',
  'cancelled',
  'out_of_office',
  'focus_time',
  'working_location',
  'birthday',
  'email_event',
  'proposed',
  'external_meeting',
  'internal_meeting',
  'personal_block',
] as const
export type AgendaObjectKind = (typeof AGENDA_OBJECT_KINDS)[number]

/**
 * La nature d'un évènement — déterministe, jamais deviné : un champ absent ne
 * fait JAMAIS une nature (un statut illisible n'est ni « proposé » ni « externe »).
 * L'ordre est celui de la prudence : un créneau masqué n'est lu sur rien d'autre,
 * une annulation et une absence priment sur la forme de la réunion.
 */
export function classifyAgendaObject(
  event: Pick<
    AgendaEvent,
    'busyOnly' | 'cancelled' | 'providerEventType' | 'showAs' | 'status' | 'isExternal' | 'attendees'
  >,
): AgendaObjectKind {
  if (event.busyOnly === true) return 'private_busy'
  if (event.cancelled) return 'cancelled'
  if (isOwnerUnavailable(event)) return 'out_of_office'
  if (event.providerEventType === 'focusTime') return 'focus_time'
  if (event.providerEventType === 'workingLocation') return 'working_location'
  if (event.providerEventType === 'birthday') return 'birthday'
  // La valeur fournisseur « évènement créé depuis un e-mail » commence par `from` ;
  // le préfixe suffit, et ne nomme aucun éditeur dans un contrat qui voyage à l'écran (GA-44).
  if (event.providerEventType?.startsWith('from')) return 'email_event'
  if (normalizeAgendaEventStatus(event.status) === 'tentative') return 'proposed'
  const persons = personAttendeesOf(event)
  if (persons.length === 0) return 'personal_block'
  return event.isExternal ? 'external_meeting' : 'internal_meeting'
}

/**
 * Le VERDICT fermé du statut d'un évènement (N11-A).
 *
 * `confirmed` / `tentative` / `cancelled` sont les trois valeurs que rend
 * réellement Google Calendar (le seul fournisseur à porter ce champ librement
 * — Outlook, lui, ne connaît que confirmé/annulé, voir
 * `microsoft-agenda.backend.ts`). `unknown` couvre tout le reste : une valeur
 * qu'un fournisseur n'a pas encore rendue, une ligne héritée, ou l'absence de
 * statut. Une énumération FERMÉE plutôt que la chaîne libre ci-dessus : « rien
 * ne distingue un créneau proposé d'un rendez-vous confirmé » était
 * exactement le défaut — un compteur qui additionne les deux ment sur
 * l'activité commerciale.
 */
export const AGENDA_EVENT_STATUSES = ['confirmed', 'tentative', 'cancelled', 'unknown'] as const
export const agendaEventStatusSchema = z.enum(AGENDA_EVENT_STATUSES)
export type AgendaEventStatus = z.infer<typeof agendaEventStatusSchema>

/**
 * Normalise la valeur brute d'un fournisseur (ou une ligne héritée) vers
 * l'énumération fermée ci-dessus.
 *
 * Toute valeur non reconnue — y compris `null` et `undefined` — se lit
 * `unknown`, JAMAIS `confirmed` : gonfler l'activité commerciale sur une
 * valeur qu'on n'a pas su lire serait pire que de la dire inconnue.
 */
export function normalizeAgendaEventStatus(raw: string | null | undefined): AgendaEventStatus {
  return raw === 'confirmed' || raw === 'tentative' || raw === 'cancelled' ? raw : 'unknown'
}

/**
 * Seul un rendez-vous CONFIRMÉ compte comme fixé.
 *
 * Un créneau `tentative` (proposé, pas encore accepté) et une ligne dont le
 * statut est `unknown` (héritée, ou un fournisseur qui n'a pas su répondre)
 * rendent tous les deux `false` — ni l'un ni l'autre n'est un engagement pris.
 */
export function isConfirmedAgendaEvent(status: string | null | undefined): boolean {
  return normalizeAgendaEventStatus(status) === 'confirmed'
}

/**
 * #2403.13 — Laura ne s'interrompt pas PENDANT une réunion.
 *
 * `agent_docs/doctrine.md:19` (« JAMAIS de donnée fictive ») bloquait ce point
 * tel qu'écrit (« aucune intervention pendant un appel/une réunion EN COURS ») :
 * aucune source « réunion en cours » en temps réel n'existe dans ce dépôt — la
 * variante conforme lit l'agenda déjà SYNCHRONISÉ (`AgendaService.listEvents`,
 * lui-même no-op sans connecteur branché) et compare `now` au début/fin d'un
 * rendez-vous CONNU, plutôt que de détecter un « en cours » qui n'existe pas.
 *
 * Un évènement compte s'il est CONFIRMÉ (`isConfirmedAgendaEvent` — un
 * créneau `tentative` n'est pas un engagement pris), non ANNULÉ, et si `now`
 * tombe entre son début et sa fin. Une date illisible ne fait jamais taire
 * Laura : « en cours » ne se devine pas.
 */
export function isMeetingInProgress(event: AgendaEvent, now: Date): boolean {
  if (!isConfirmedAgendaEvent(event.status) || event.cancelled) return false
  if (!event.start || !event.end) return false
  const start = Date.parse(event.start)
  const end = Date.parse(event.end)
  if (Number.isNaN(start) || Number.isNaN(end)) return false
  const at = now.getTime()
  return at >= start && at <= end
}

/** Au moins un rendez-vous CONNU (agenda synchronisé) est en cours à `now`. */
export function hasMeetingInProgress(events: readonly AgendaEvent[], now: Date): boolean {
  return events.some(event => isMeetingInProgress(event, now))
}

/**
 * #2319.10 / #2319.18 — la confidentialité d'un évènement, fermée en trois
 * états qui ne viennent PAS du même vocabulaire fournisseur :
 *
 *  · Google `visibility` : `default` | `public` | `private` | `confidential` ;
 *  · Microsoft `sensitivity` : `normal` | `personal` | `private` | `confidential`.
 *
 * `private` n'atteint jamais cette fonction — {@link isPrivateAgendaEvent}
 * (`apps/api/.../agenda-backend.ts`) l'exclut avant que l'évènement n'existe
 * côté Bellum. `personal` n'existe QUE chez Microsoft : un rendez-vous
 * personnel Google n'a pas de distinction propre, il est marqué `private` et
 * donc déjà écarté en amont. Toute autre valeur — y compris `null`,
 * `undefined`, ou une ligne héritée — se lit `normal` : une confidentialité
 * ne se devine jamais à la hausse.
 */
export const AGENDA_EVENT_VISIBILITIES = ['normal', 'confidential', 'personal'] as const
export const agendaEventVisibilitySchema = z.enum(AGENDA_EVENT_VISIBILITIES)
export type AgendaEventVisibility = (typeof AGENDA_EVENT_VISIBILITIES)[number]

/** Un créneau « indisponible » seul : rien d'autre que l'heure n'est lisible (#2390.16). */
export function isBusyOnlyAgendaEvent(event: Pick<AgendaEvent, 'busyOnly'>): boolean {
  return event.busyOnly === true
}

export function normalizeAgendaEventVisibility(raw: string | null | undefined): AgendaEventVisibility {
  if (raw === 'confidential') return 'confidential'
  if (raw === 'personal') return 'personal'
  return 'normal'
}

/** Un trou dans l'agenda, exploitable pour proposer un créneau. */
export const freeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
  minutes: z.number().int().positive(),
})
export type FreeSlot = z.infer<typeof freeSlotSchema>

/** Deux évènements qui se chevauchent — la matière du déclencheur « conflits ». */
export const agendaConflictSchema = z.object({
  first: agendaEventSchema,
  second: agendaEventSchema,
  overlapMinutes: z.number().int().positive(),
})
export type AgendaConflict = z.infer<typeof agendaConflictSchema>

/**
 * Deux évènements DISTINCTS, consécutifs, sans le battement minimal entre eux
 * — #2390.5 (LAU-FINAL-104, « réunion trop proche »).
 *
 * Volontairement un type SÉPARÉ de `agendaConflictSchema` plutôt qu'un
 * quatrième cas dans son `overlapMinutes` : ce dernier est lu tel quel comme
 * un nombre de minutes de CHEVAUCHEMENT par `briefing-actions.ts` et
 * `routine-executors.ts` (« se chevauchent de X min »), et ces deux
 * évènements-ci ne se chevauchent PAS — c'est l'enchaînement trop serré qui
 * est signalé, pas l'horaire. Un champ réinterprété selon le cas aurait fait
 * mentir l'un des deux textes le jour où ce cas arrive en tête de liste.
 */
export const agendaProximityConflictSchema = z.object({
  first: agendaEventSchema,
  second: agendaEventSchema,
  /** Minutes qui séparent la fin du premier du début du second — jamais 0
   *  (deux évènements qui se touchent exactement ne sont pas signalés ici,
   *  cf. `detectConflicts` / `MIN_MEETING_GAP_MINUTES`). */
  gapMinutes: z.number().int().positive(),
})
export type AgendaProximityConflict = z.infer<typeof agendaProximityConflictSchema>

/**
 * Deux évènements au même créneau EXACT et au même titre — probablement le
 * même rendez-vous entré deux fois (double import, resynchronisation…) —
 * #2390.7 (LAU-FINAL-104, « événement en double »).
 */
export const agendaDuplicateEventSchema = z.object({
  first: agendaEventSchema,
  second: agendaEventSchema,
})
export type AgendaDuplicateEvent = z.infer<typeof agendaDuplicateEventSchema>

/**
 * Deux rendez-vous EN PRÉSENTIEL, à des lieux DIFFÉRENTS, sans le moindre
 * battement entre eux — #2390.3 (LAU-FINAL-104, « temps de déplacement
 * impossible »).
 *
 * Volontairement SANS distance ni durée de trajet : aucune carte n'est
 * branchée, et la doctrine interdit d'inventer une donnée. Le seul fait
 * affirmable sans deviner une distance est qu'un battement NUL entre deux
 * lieux différents est impossible à honorer, quelle que soit la distance
 * réelle — voir `detectTravelConflicts` (`apps/api/.../agenda/free-slots.ts`).
 */
export const agendaTravelConflictSchema = z.object({
  first: agendaEventSchema,
  second: agendaEventSchema,
})
export type AgendaTravelConflict = z.infer<typeof agendaTravelConflictSchema>

/**
 * Un rendez-vous qui chevauche un bloc où son PROPRIÉTAIRE s'est déclaré
 * indisponible — #2390.6 (épopée #2926, « intelligence calendrier »).
 *
 * `unavailability` est le bloc (`isOwnerUnavailable` — voir plus haut) ;
 * `meeting` est le rendez-vous minuté qui tombe dedans. Un type SÉPARÉ de
 * `agendaConflictSchema`, même motif que `agendaTravelConflictSchema` et
 * `agendaProximityConflictSchema` : les deux évènements ne jouent pas le même
 * rôle, et les confondre ferait dire « deux réunions se chevauchent » à un
 * cas qui n'en est pas un.
 */
export const agendaOwnerUnavailableConflictSchema = z.object({
  meeting: agendaEventSchema,
  unavailability: agendaEventSchema,
  overlapMinutes: z.number().int().positive(),
})
export type AgendaOwnerUnavailableConflict = z.infer<typeof agendaOwnerUnavailableConflictSchema>

/**
 * UN agenda parmi ceux de l'utilisateur.
 *
 * Un commercial n'a presque jamais un seul agenda : le sien, celui de l'équipe,
 * parfois un agenda partagé de rendez-vous clients — et, quand deux comptes
 * sont branchés, les deux fournisseurs à la fois. Lire toujours l'agenda par
 * défaut revient à afficher « journée vide » à quelqu'un dont la journée est
 * pleine, ailleurs.
 */
export const agendaCalendarSchema = z.object({
  /** Identifiant chez le fournisseur — opaque, jamais fabriqué ni deviné. */
  id: z.string().min(1),
  name: z.string(),
  provider: agendaProviderSchema,
  /** L'agenda par défaut du compte : celui qu'on lit tant que rien n'est choisi. */
  primary: z.boolean(),
  /** Un agenda partagé en lecture seule ne doit pas proposer « créer ». */
  canWrite: z.boolean(),
})
export type AgendaCalendar = z.infer<typeof agendaCalendarSchema>

/**
 * Une source d'agenda branchée qui n'a pas répondu, et pourquoi.
 *
 * « Rien » et « je n'ai pas pu regarder » ne sont pas la même chose : une
 * liste amputée par une panne se lit « je n'ai que ça », ce qui est faux. Toute
 * lecture multi-source du produit rend donc ses manquants À CÔTÉ de ses
 * résultats.
 */
export const agendaUnavailableSchema = z.object({
  provider: agendaProviderSchema,
  reason: z.string(),
  /** Nom de l'agenda muet quand la panne est celle d'UN agenda et pas du
   *  fournisseur entier — c'est ce qui permet de le dire à l'écran. */
  calendarName: z.string().nullable().default(null),
})
export type AgendaUnavailableSource = z.infer<typeof agendaUnavailableSchema>

/** Le couple qui désigne un agenda de façon non ambiguë entre deux fournisseurs. */
export const agendaCalendarRefSchema = z.object({
  provider: agendaProviderSchema,
  calendarId: z.string().min(1).max(1024),
})
export type AgendaCalendarRef = z.infer<typeof agendaCalendarRefSchema>

/**
 * Les agendas choisis, au PLURIEL.
 *
 * Choisir un seul agenda ne décrit aucune journée réelle : le rendez-vous
 * client est dans l'agenda partagé, le point d'équipe dans celui de l'équipe,
 * les congés dans le sien. Le contraire — tout lire — noie la journée sous
 * « Jours fériés » et « Numéros de semaine ». La bonne réponse est entre les
 * deux et personne d'autre que l'utilisateur ne la connaît.
 *
 * Borné à 50 : au-delà, chaque lecture ferait cinquante appels au fournisseur
 * pour un écran que plus personne ne lit.
 */
export const agendaSelectionSchema = z.object({
  calendars: z.array(agendaCalendarRefSchema).min(1).max(50),
})
export type AgendaSelection = z.infer<typeof agendaSelectionSchema>

export const agendaCalendarsSchema = z.object({
  calendars: z.array(agendaCalendarSchema),
  /**
   * Les agendas actuellement lus — par l'écran comme par le brief du jour.
   *
   * Liste VIDE plutôt que `null` quand rien n'est choisi : l'absence de choix
   * veut dire « l'agenda par défaut du compte », et un `null` aurait obligé
   * chaque appelant à retraduire la même chose à sa façon.
   */
  selectedCalendars: z.array(agendaCalendarRefSchema),
  /**
   * L'utilisateur lit TOUS ses agendas à la fois.
   *
   * Un commercial sous Workspace a couramment cinq agendas : le sien, celui de
   * l'équipe, un agenda de rendez-vous clients, un agenda de congés. Lui faire
   * choisir LEQUEL Bellum regarde revient à lui demander de deviner où sera son
   * prochain rendez-vous. Quand ce drapeau est levé, la lecture couvre tous les
   * agendas lisibles, chez tous les fournisseurs branchés.
   *
   * Ce n'est PAS le défaut : un agenda de jours fériés ou d'anniversaires
   * remplirait la journée d'évènements sur lesquels il n'y a rien à faire.
   * C'est un choix, et il est réversible.
   */
  readsAll: z.boolean().default(false),
  /** Fournisseurs connectés qui n'ont pas su répondre. */
  unavailable: z.array(agendaUnavailableSchema),
})
export type AgendaCalendars = z.infer<typeof agendaCalendarsSchema>

export const agendaRangeRequestSchema = z.object({
  // #4064 — `offset: true`, comme `freeSlotsRequestSchema` (#2770 Y9) : Laura
  // écrit l'heure de Paris (`…T00:00:00+02:00`). Sans lui le pont répondait 400
  // à « les personnes rencontrées ces 3 derniers mois » et l'outil disait
  // « ton agenda n'a pas répondu » sur un agenda branché.
  /** Début de la fenêtre (ISO). Défaut côté service : maintenant. */
  from: z.string().datetime({ offset: true }).optional(),
  /** Fin de la fenêtre (ISO). Défaut côté service : +7 jours. */
  to: z.string().datetime({ offset: true }).optional(),
  /** Filtre plein texte (nom de société, domaine du compte). */
  query: z.string().max(200).optional(),
  /** Fournisseur à lire quand les deux sont branchés. Défaut : l'agenda choisi. */
  provider: agendaProviderSchema.optional(),
  /** Agenda à lire chez ce fournisseur. Défaut : l'agenda choisi, sinon le principal. */
  calendarId: z.string().min(1).max(1024).optional(),
  /**
   * Lire tous les agendas lisibles d'un coup, sans tenir compte du choix
   * enregistré. Absent = on suit la préférence de l'utilisateur.
   */
  allCalendars: z.boolean().optional(),
  limit: z.number().int().min(1).max(250).default(50),
})
export type AgendaRangeRequest = z.infer<typeof agendaRangeRequestSchema>

/**
 * Une fenêtre d'agenda lue — et ce qu'on n'a PAS pu lire.
 *
 * Les deux voyagent ensemble parce qu'ils ne se déduisent pas l'un de l'autre :
 * une fenêtre vide peut vouloir dire « journée calme » ou « l'agenda qui la
 * remplissait n'a pas répondu ». Seul l'écran qui reçoit les deux peut le dire
 * honnêtement.
 */
export const agendaWindowSchema = z.object({
  events: z.array(agendaEventSchema),
  unavailable: z.array(agendaUnavailableSchema),
})
export type AgendaWindow = z.infer<typeof agendaWindowSchema>

/**
 * Recherche de créneaux libres. Les heures ouvrées sont des paramètres et non
 * des constantes : une ESN qui travaille 9h-18h et un indépendant qui bloque
 * ses matinées n'ont pas la même définition de « libre ».
 */
export const freeSlotsRequestSchema = z.object({
  // `offset: true` : les bornes d'un jour LOCAL s'écrivent `…T00:00:00+02:00`.
  // Sans lui le contrat ne lisait que `Z` et refusait chaque lecture du plan de
  // journée / de semaine de Laura (#2770, recette Y9).
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  /** Durée cherchée, en minutes (plancher 5 : le plus petit bloc d'un plan de journée). */
  durationMinutes: z.number().int().min(5).max(480).default(60),
  /** Heure de début de journée ouvrée, 0-23, fuseau `timeZone`. */
  workdayStartHour: z.number().int().min(0).max(23).default(9),
  workdayEndHour: z.number().int().min(1).max(24).default(18),
  /** Jours ouvrés retenus (1 = lundi … 7 = dimanche, ISO-8601). */
  workdays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
  timeZone: z.string().default('Europe/Paris'),
  limit: z.number().int().min(1).max(50).default(10),
  /**
   * #5 (recette prod 13/10) — rend chaque trou ENTIER (≥ `durationMinutes`) au lieu de le découper en tranches de
   * `durationMinutes`. Le plan de journée de Laura cherche à 5 min (plancher d'un bloc) : sans cela, une journée
   * VIDE rendait des tranches de 5 min où aucun bloc ne tenait. Absent = tranches, comportement d'avant.
   */
  mergeHoles: z.boolean().optional(),
})
export type FreeSlotsRequest = z.infer<typeof freeSlotsRequestSchema>

/**
 * Création d'un évènement. `addConferencing` couvre la règle n°16 (« ajouter
 * systématiquement un lien visio si supporté ») ; `inviteSelf` reste à `false`
 * et n'est là que pour rendre la règle n°15 explicite et testable.
 */
/**
 * Une RRULE au sens strict (RFC 5545), telle que Google Calendar l'attend dans
 * `event.recurrence` — une ligne complète, préfixée `RRULE:`
 * (developers.google.com/calendar/api/v3/reference/events, champ `recurrence`).
 *
 * Un contrat d'API non vérifiable ne se devine pas (CLAUDE.md) : plutôt que
 * d'accepter n'importe quelle chaîne et de la relayer telle quelle au
 * fournisseur — qui la refuserait sans qu'on sache pourquoi —, la forme est
 * vérifiée ICI, sur la ligne EXACTE que Google documente. `FREQ=` est
 * obligatoire en première position dans la RRULE elle-même (RFC 5545 §3.3.10).
 */
const RECURRENCE_RULE_PATTERN = /^RRULE:FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[^;]+)*$/

export const agendaEventDraftSchema = z.object({
  summary: z.string().min(1).max(300),
  /**
   * Nom du compte concerné, préfixé au titre (garde-fou n°17 : « Société +
   * sujet spécifique »).
   *
   * Un agenda plein de « Point » et de « Call » est illisible une semaine plus
   * tard, et c'est exactement ce qu'on relit pour préparer un rendez-vous. Le
   * préfixe n'est PAS ajouté quand le titre nomme déjà la société : « ACME —
   * ACME : cadrage » serait pire que rien.
   */
  accountName: z.string().max(200).optional(),
  description: z.string().max(8000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  attendees: z.array(z.string().email()).max(50).default([]),
  addConferencing: z.boolean().default(true),
  /** Rappel avant l'évènement, en minutes (garde-fou n°2 : rappel -1h). */
  reminderMinutes: z.number().int().min(0).max(40320).nullable().default(60),
  inviteSelf: z.literal(false).default(false),
  timeZone: z.string().default('Europe/Paris'),
  /**
   * #2101.27 — le calendrier CIBLE, chez le fournisseur connecté.
   *
   * Optionnel : absent, la création reste sur le calendrier PAR DÉFAUT du
   * compte, exactement le comportement d'avant ce champ. Un identifiant venu
   * d'ailleurs que la liste rendue par `listCalendars` n'est jamais deviné —
   * c'est `AgendaService.createEvent` qui le vérifie contre cette liste avant
   * de l'envoyer au fournisseur.
   */
  calendarId: z.string().min(1).max(1024).optional(),
  /**
   * #2101.26 — la RÉCURRENCE, en RRULE (RFC 5545), forme exacte de
   * `agenda.ts:305-326` avant ce champ : aucune occurrence de `recurrence`
   * n'existait, côté contrat ni côté fournisseur (épopée #2835).
   *
   * Seul Google sait aujourd'hui la poser sur l'évènement créé
   * (`AgendaCapabilities.recurrence`, `google-agenda.backend.ts`) — Microsoft
   * Graph n'accepte pas de RRULE brute à la création (son `recurrence` est un
   * objet structuré `pattern`/`range`, un contrat distinct, hors périmètre de
   * ce point). `AgendaService.createEvent` refuse la demande plutôt que de la
   * relayer en silence à un fournisseur qui l'ignorerait.
   */
  recurrence: z.string().regex(RECURRENCE_RULE_PATTERN).max(500).optional(),
})
export type AgendaEventDraft = z.infer<typeof agendaEventDraftSchema>

export const agendaCapabilitiesSchema = z.object({
  read: z.boolean(),
  write: z.boolean(),
  /**
   * Le fournisseur sait-il DÉPLACER un rendez-vous sans prévenir les invités ?
   *
   * La question n'est pas cosmétique. Déplacer un rendez-vous à trois envoie
   * trois vraies notifications à trois vraies personnes ; l'utilisateur doit
   * pouvoir décider, et l'écran doit dire la vérité sur ce qui va partir.
   *
   * Les deux fournisseurs ne se valent pas ici : l'un accepte de rester
   * silencieux, l'autre prévient TOUJOURS les invités d'une modification et
   * n'offre aucun moyen de l'en empêcher. Plutôt que d'afficher une case à
   * cocher qui ne serait pas honorée — la pire des deux options —, l'écran la
   * désactive et dit pourquoi.
   *
   * Optionnel : un déploiement d'API antérieur ne l'envoie pas, et son absence
   * se lit « on ne sait pas se taire », c'est-à-dire le cas prudent.
   */
  silentReschedule: z.boolean().optional(),
  /**
   * #2101.29 — le fournisseur honore-t-il un rappel CHOISI à la création ?
   *
   * `AgendaEventDraft.reminderMinutes` est envoyé aux deux fournisseurs, mais
   * seul Google le POSE réellement sur l'évènement créé
   * (`google.service.ts`, `reminders.overrides`) — Microsoft l'ignore. Un
   * champ qui se dit éditable sans être honoré serait une donnée fictive :
   * l'écran (`NewEventDialog`) ne propose donc le choix QUE si cette capacité
   * vaut `true`, exactement le motif de `silentReschedule` ci-dessus.
   *
   * Optionnel : un déploiement d'API antérieur ne l'envoie pas, et son
   * absence se lit « pas honoré », le cas prudent.
   */
  customReminder: z.boolean().optional(),
  /**
   * #2101.26 — le fournisseur sait-il créer un évènement RÉCURRENT depuis
   * `AgendaEventDraft.recurrence` ?
   *
   * Seul Google le pose réellement (`recurrence: string[]` accepté tel quel
   * par `events.insert`) — Microsoft Graph n'a pas la même forme de contrat
   * (objet `pattern`/`range`, jamais une RRULE brute) et n'est donc pas
   * honoré ici. Même motif que `customReminder` ci-dessus : l'écran
   * (`NewEventDialog`) ne propose le champ QUE si cette capacité vaut `true`.
   *
   * Optionnel : un déploiement d'API antérieur ne l'envoie pas, et son
   * absence se lit « pas honoré », le cas prudent.
   */
  recurrence: z.boolean().optional(),
})
export type AgendaCapabilities = z.infer<typeof agendaCapabilitiesSchema>

/**
 * Déplacer un rendez-vous existant.
 *
 * Le seul geste de l'agenda qui MODIFIE quelque chose que d'autres personnes
 * ont déjà dans leur propre agenda. D'où la forme : l'utilisateur dit
 * explicitement s'il veut prévenir, et la réponse dit ce qui est réellement
 * parti — les deux ne coïncident pas chez tous les fournisseurs.
 */
export const agendaRescheduleSchema = z.object({
  eventId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  /**
   * Prévenir les invités. Le défaut est `true` : un rendez-vous déplacé en
   * silence fait arriver les autres à l'ancienne heure. Le silence est un choix
   * délibéré, jamais une valeur par défaut.
   */
  notifyGuests: z.boolean().default(true),
})
export type AgendaReschedule = z.infer<typeof agendaRescheduleSchema>

export const agendaRescheduleResultSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  /**
   * Les invités ONT-ILS été prévenus ? Pas ce qu'on a demandé — ce qui s'est
   * passé. Un fournisseur qui prévient toujours rend `true` même quand la
   * demande disait `false`, et l'écran peut alors le dire au lieu de laisser
   * croire à une discrétion qui n'a pas eu lieu.
   */
  guestsNotified: z.boolean(),
})
export type AgendaRescheduleResult = z.infer<typeof agendaRescheduleResultSchema>

export const agendaStatusSchema = z.object({
  connected: z.boolean(),
  provider: agendaProviderSchema.nullable(),
  capabilities: agendaCapabilitiesSchema,
})
export type AgendaStatus = z.infer<typeof agendaStatusSchema>
