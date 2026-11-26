import type {
  AgendaCalendar,
  AgendaEvent,
  AgendaEventDraft,
  AgendaProvider,
  AgendaReschedule,
  AgendaRescheduleResult,
  AgendaStatus,
} from '@bellum/contracts'

/**
 * Ce qu'un agenda doit savoir faire pour le socle exécutif : rendre les
 * évènements d'une fenêtre, et en créer un. Créneaux libres et conflits ne sont
 * PAS ici — ce sont des calculs sur la fenêtre rendue, identiques pour Google
 * et pour Microsoft, et les dupliquer par fournisseur serait la meilleure façon
 * d'obtenir deux définitions différentes de « libre ».
 */

export type AgendaCreateResult = {
  id: string
  webUrl: string | null
  conferenceUrl: string | null
  /** Invités réellement transmis (l'organisateur en a été retiré). */
  attendees: string[]
}

export interface AgendaBackend {
  status(userId: string): Promise<AgendaStatus | null>

  /**
   * Les agendas lisibles de l'utilisateur chez ce fournisseur.
   *
   * Un commercial en a plusieurs — le sien, celui de l'équipe, un agenda de
   * rendez-vous partagé — et n'a aucune raison de ne voir que le principal.
   */
  listCalendars(userId: string): Promise<AgendaCalendar[]>

  listEvents(
    userId: string,
    window: { from: string; to: string; query?: string; limit: number; calendarId?: string },
  ): Promise<AgendaEvent[]>

  createEvent(userId: string, draft: AgendaEventDraft): Promise<AgendaCreateResult>

  /**
   * Déplacer un rendez-vous existant.
   *
   * Le seul geste de l'agenda qui touche à quelque chose que d'AUTRES personnes
   * ont déjà dans leur propre agenda. Chaque implémentation doit renvoyer ce
   * qui s'est réellement passé du côté des invités (`guestsNotified`), et non
   * ce que l'appelant a demandé : les fournisseurs ne se valent pas sur ce
   * point, et l'écran ne peut être honnête que si le backend l'est.
   */
  rescheduleEvent(userId: string, input: AgendaReschedule): Promise<AgendaRescheduleResult>

  /**
   * Annuler un évènement que Bellum a réellement créé.
   *
   * #2770.52 — la primitive que six lots précédents avaient constatée absente
   * (`git grep -in "deleteEvent|cancelEvent|removeAgendaEvent"` rendait vide
   * sur ce module) : sans elle, un bloc de plan de journée confirmé par erreur
   * ne pouvait plus être retiré de l'agenda réel, seulement de la carte qui
   * l'a proposé. Idempotente : un évènement déjà absent chez le fournisseur
   * (404/410 — supprimé ailleurs, ou double clic) est un succès, pas une
   * erreur, car l'état voulu (l'évènement n'existe plus) est déjà atteint.
   */
  deleteEvent(userId: string, eventId: string): Promise<void>
}

export const AGENDA_BACKENDS = Symbol('AGENDA_BACKENDS')

/**
 * #3973 — l'identifiant, au registre des outils (`tool-catalog.ts`), de l'outil
 * qui sert chaque agenda. C'est ce que « Outils et sources » décoche pour un fil
 * (`excludedToolProviders`). Microsoft 365 sert la messagerie ET l'agenda sous
 * UN seul outil : le décocher retire les deux. Recopié et non importé (GA-07),
 * la divergence est gardée par `agenda.service.spec.ts`.
 */
export const AGENDA_TOOL_PROVIDERS: Readonly<Record<AgendaProvider, string>> = {
  google: 'google-calendar',
  microsoft: 'microsoft',
}

/** Les agendas que ces outils décochés désignent ; tout autre identifiant est ignoré. */
export function agendaProvidersExcludedBy(toolProviders: readonly string[] | null | undefined): AgendaProvider[] {
  const excluded = new Set(toolProviders ?? [])
  return (Object.keys(AGENDA_TOOL_PROVIDERS) as AgendaProvider[]).filter(provider =>
    excluded.has(AGENDA_TOOL_PROVIDERS[provider]),
  )
}

/** Ce que le copilote a le droit de lire pour CE fil : sans exclusion, tous les agendas branchés. */
export type AgendaReadScope = { excludedProviders?: readonly AgendaProvider[] }

/**
 * Un participant est-il externe à l'organisation de l'utilisateur ?
 *
 * Le test porte sur le domaine, seul signal disponible sans annuaire. Il sert à
 * distinguer un vrai rendez-vous client d'un point interne — donc à décider
 * quels évènements méritent un brief, un compte rendu et une trace CRM. Sans
 * adresse connue pour l'utilisateur, on répond `false` : mieux vaut manquer un
 * brief que d'en fabriquer un pour la réunion d'équipe du lundi.
 */
export function isExternalAddress(address: string, ownAddress: string | null): boolean {
  const ownDomain = ownAddress?.split('@').pop()?.toLowerCase()
  if (!ownDomain) return false
  const domain = address.split('@').pop()?.toLowerCase()
  return Boolean(domain) && domain !== ownDomain
}

/**
 * #2388.23 — un évènement marqué privé par son propriétaire (Google
 * `visibility: "private"`, Microsoft Graph `sensitivity: "private"`) n'entre
 * JAMAIS dans la synchronisation Bellum.
 *
 * C'est un choix de confidentialité explicite posé par la personne elle-même
 * dans son agenda — la doctrine « on collecte largement, tant que c'est
 * propre » (c79) ne s'étend pas à ce qu'elle a marqué vouloir garder pour
 * elle. Comparaison insensible à la casse : les deux fournisseurs documentent
 * la valeur en minuscules, mais rien ne garantit qu'elle le restera partout.
 */
export function isPrivateAgendaEvent(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'private'
}

/**
 * #2390.16 — un évènement privé se réduit à un créneau « indisponible » :
 * l'heure (et l'annulation) restent, tout le reste est vidé ICI, à la source,
 * avant qu'un écran, une routine ou Laura ne puisse le lire.
 *
 * Remplace l'exclusion pure de #2388.23 : un créneau absent laissait croire
 * l'utilisateur libre à quiconque planifiait par-dessus (et un conflit avec un
 * rendez-vous privé ne se voyait jamais). Le contenu, lui, reste aussi secret
 * qu'avant — `isExternal: false` et zéro invité empêchent en outre toute
 * routine (brief, tâche de préparation) de s'y accrocher.
 *
 * tranché sans Louis : masqué plutôt qu'exclu — c'est la demande de #2390.16, et
 * aucune règle de CLAUDE.md n'exige le contraire (le choix privé de la personne
 * est respecté : rien de son contenu ne sort).
 */
export function maskPrivateAgendaEvent(event: AgendaEvent): AgendaEvent {
  return {
    id: event.id,
    summary: null,
    description: null,
    location: null,
    start: event.start,
    end: event.end,
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: event.status,
    isExternal: false,
    cancelled: event.cancelled,
    visibility: 'private',
    busyOnly: true,
    recurring: false,
    providerEventType: null,
    showAs: 'busy',
  }
}
