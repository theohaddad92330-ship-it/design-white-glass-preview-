import { z } from 'zod'
import type { SavedViewAlertChannel } from './governance.js'

/**
 * CE QU'UNE ALERTE DE DÉCOUVRIR SURVEILLE — #2151.14 à .25, #2166.66 à .70.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une alerte de Découvrir partait sur une HORLOGE : `isDiscoverAlertDue` regarde
 * la cadence et la dernière exécution, et rien d'autre. Un périmètre « chaque
 * jour » produisait donc une alerte chaque jour, y compris les jours où rien
 * n'était apparu. Ce n'est pas une alerte, c'est un réveil — et un réveil qui
 * sonne pour rien s'éteint au bout d'une semaine, définitivement.
 *
 * `watchlist_rules`, de son côté, est resté un CRUD pur : on y déclare un
 * secteur, une techno, un compte à suivre, et AUCUNE ligne de production ne
 * décide jamais que quelque chose vient d'apparaître.
 *
 * Ce module nomme donc les ÉVÉNEMENTS — ce dont l'apparition justifie de
 * déranger quelqu'un — et les trois questions qui décident de ce qu'on en fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Un événement SIGNALE. Il ne relance aucune analyse, n'envoie aucun message et
 * n'écrit dans aucun CRM : le commercial décide. Rien ici ne porte de
 * probabilité — pas de « chance que ce signal devienne une affaire », sous
 * aucune formulation : ce qu'on rend est un FAIT daté avec la nature de sa
 * source.
 */

/**
 * LES SEPT GENRES D'ÉVÉNEMENT — les dix déclencheurs du registre, dédoublonnés.
 *
 * `#2151.16` = `#2166.66` (nouveau signal), `#2151.17` = `#2166.67` (nouvelle
 * entreprise), `#2151.19` = `#2166.69` (nouveau besoin) : le registre les
 * compte deux fois parce que deux retours les demandent, mais un même événement
 * ne peut pas avoir deux genres — il repasserait la porte de déduplication deux
 * fois, sous deux noms, et arriverait deux fois chez la même personne.
 *
 * ⚠️ AJOUT EN FIN, jamais d'insertion au milieu (GA-08) : l'ordre est persisté
 * en base dans `discover_alert_events.kind`, et la contrainte SQL s'élargit
 * AVANT le code qui écrit (GA-11 / GA-12).
 *
 * ⚠️ `#2151.18` / `#2166.68` (« changement de poste vérifié ») n'est PAS ici, et
 * c'est une décision : aucune source du dépôt ne sait VÉRIFIER un changement de
 * poste sans se faire passer pour un navigateur humain, ce que la doctrine
 * refuse. Un genre nommé sans producteur honnête serait une promesse.
 */
export const DISCOVER_ALERT_EVENT_KINDS = [
  /** #2151.16 / #2166.66 — un signal ACTUEL est apparu sur un compte suivi. */
  'new_signal',
  /** #2151.17 / #2166.67 — une entreprise est entrée dans le périmètre. */
  'new_matching_company',
  /** #2151.19 / #2166.69 — un besoin a été CONFIRMÉ dans l'espace. */
  'new_confirmed_need',
  /** #2151.20 — une ESN a été déclarée présente sur un compte. */
  'new_relationship',
  /** #2151.21 — l'analyse d'un compte suivi a été rejouée. */
  'analysis_refreshed',
  /** #2151.22 — une mission s'est terminée : quelqu'un se libère. */
  'mission_ended',
  /** #2166.70 — une voie d'entrée neuve a été consignée sur un compte. */
  'new_access_path',
] as const
export type DiscoverAlertEventKind = (typeof DISCOVER_ALERT_EVENT_KINDS)[number]
export const discoverAlertEventKindSchema = z.enum(DISCOVER_ALERT_EVENT_KINDS)

/**
 * LA NATURE D'UNE SOURCE — #2151.9, et la doctrine de nommage du 13/09/2026.
 *
 * Une source d'événement se nomme par ce qu'elle EST, jamais par l'éditeur qui
 * nous la vend : « information publique » et non le nom du moteur qui l'a
 * ramenée, « analyse actualisée » et non le nom du modèle qui l'a écrite. Nos
 * fournisseurs ne se nomment nulle part — ni à l'écran, ni dans un prompt.
 */
export const DISCOVER_ALERT_SOURCE_KINDS = [
  /** Une collecte publique : registres, offres, publications ouvertes. */
  'public_information',
  /** Le dossier lui-même, rejoué par le produit. */
  'refreshed_analysis',
  /** Quelqu'un de l'espace l'a saisi ou confirmé. */
  'workspace_declaration',
] as const
export type DiscoverAlertSourceKind = (typeof DISCOVER_ALERT_SOURCE_KINDS)[number]

/**
 * Quelle NATURE de source produit quel genre — la table vit ici, à un seul
 * endroit (GA-26). Un écran qui la recopierait divergerait au premier genre
 * ajouté, et afficherait « information publique » sous un fait que quelqu'un
 * a saisi à la main.
 */
export const DISCOVER_ALERT_EVENT_SOURCE_KINDS: Readonly<Record<DiscoverAlertEventKind, DiscoverAlertSourceKind>> = {
  new_signal: 'public_information',
  new_matching_company: 'public_information',
  new_confirmed_need: 'workspace_declaration',
  new_relationship: 'workspace_declaration',
  analysis_refreshed: 'refreshed_analysis',
  mission_ended: 'workspace_declaration',
  new_access_path: 'workspace_declaration',
}

/**
 * LES QUATRE SURFACES OÙ UNE ALERTE PEUT APPARAÎTRE — #2151.25.
 *
 * Laura · Aujourd'hui · la notification · l'e-mail (et le SMS, qui est le même
 * geste : quitter l'application pour atteindre quelqu'un). Le retour qui a
 * produit ce point ne demande pas quatre canaux : il demande qu'un même
 * événement n'arrive pas quatre fois.
 */
export const DISCOVER_ALERT_SURFACES = ['today', 'notification', 'outbound', 'laura'] as const
export type DiscoverAlertSurface = (typeof DISCOVER_ALERT_SURFACES)[number]

/**
 * LES SURFACES QUI DÉLIVRENT — celles qu'un émetteur a le droit de choisir.
 *
 * ⚠️ Dérivé par SOUSTRACTION de `laura`, jamais recopié : une surface ajoutée
 * demain se retrouve ici par défaut, c'est-à-dire du côté qu'il faudra REGARDER.
 * C'est la même construction que `DISCOVER_ALERT_OUTBOUND_CHANNELS`.
 *
 * **Laura est une surface de LECTURE.** Elle peut mentionner un événement quand
 * on le lui demande — c'est son métier — mais elle n'en DÉLIVRE aucun : si elle
 * en délivrait, un événement déjà posé dans Aujourd'hui reviendrait dans son
 * fil sans que rien ne relie les deux, et l'utilisateur compterait deux
 * événements là où il y en a un. La contrainte ne s'écrit pas en convention :
 * elle s'écrit en ABSENCE — `decideDiscoverAlertSurface` ne peut pas la rendre.
 */
export const DISCOVER_ALERT_DELIVERY_SURFACES = DISCOVER_ALERT_SURFACES.filter(
  surface => surface !== 'laura',
) as ReadonlyArray<Exclude<DiscoverAlertSurface, 'laura'>>
export type DiscoverAlertDeliverySurface = (typeof DISCOVER_ALERT_DELIVERY_SURFACES)[number]

/**
 * LES GENRES QUI MÉRITENT « AUJOURD'HUI » — #2151.23 / #2151.61.
 *
 * « Aujourd'hui » ne montre que ce qui justifie une action AUJOURD'HUI
 * (#2166.73) : un signal d'achat frais, un besoin qu'on vient de confirmer, une
 * mission qui se termine — trois faits sur lesquels un commercial fait quelque
 * chose dans la journée. Une ESN déclarée sur un compte, une voie d'accès
 * consignée, une analyse rejouée : vrais, utiles, et qui attendent très bien la
 * notification du soir.
 *
 * ⚠️ Ce n'est PAS un score et encore moins une probabilité : c'est une liste
 * de genres, écrite une fois, qu'on peut lire et contredire.
 */
export const DISCOVER_ALERT_URGENT_KINDS = ['new_signal', 'new_confirmed_need', 'mission_ended'] as const
export type DiscoverAlertUrgentKind = (typeof DISCOVER_ALERT_URGENT_KINDS)[number]

/** Ce genre justifie-t-il d'apparaître dans Aujourd'hui ? */
export function isUrgentDiscoverAlertKind(kind: string | null | undefined): kind is DiscoverAlertUrgentKind {
  if (!kind) return false
  return (DISCOVER_ALERT_URGENT_KINDS as ReadonlyArray<string>).includes(kind)
}

/**
 * LA DÉCISION DE #2151.25 — un événement ne sort que par UNE surface.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE FONCTION, ET POURQUOI ELLE REND UNE SEULE VALEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * L'émetteur d'avant déposait une notification dans l'application PUIS, si le
 * canal était sortant, envoyait aussi l'e-mail. Un même périmètre dû produisait
 * donc deux arrivées. Rendre une LISTE de surfaces rouvrirait exactement cette
 * porte : il suffirait qu'un appelant itère. Le type rend donc UNE valeur, et
 * c'est le type qui tient la règle, pas la discipline de l'appelant.
 *
 * L'ordre des questions :
 *  1. le genre est-il URGENT ? alors « Aujourd'hui », et seulement lui — c'est
 *     l'écran que le commercial ouvre en arrivant, donc celui qui arrive à
 *     temps ; y ajouter un e-mail ne le ferait pas arriver plus tôt ;
 *  2. sinon, le canal CHOISI sur le périmètre décide — `email`/`sms` sortent,
 *     `in_app` et l'absence de canal restent dans l'application.
 *
 * ⚠️ Cette fonction ne dit PAS que l'envoi est permis : le consentement daté,
 * la clé du fournisseur et la liste bornée gardent le canal sortant, et ils
 * gardent après elle (`discover-alert-dispatch.ts`). Elle dit seulement PAR OÙ
 * l'événement a le droit d'arriver — une seule fois.
 */
export function decideDiscoverAlertSurface(input: {
  kind: DiscoverAlertEventKind
  channel: SavedViewAlertChannel | null
}): DiscoverAlertDeliverySurface {
  if (isUrgentDiscoverAlertKind(input.kind)) return 'today'
  if (input.channel === 'email' || input.channel === 'sms') return 'outbound'
  return 'notification'
}

/**
 * LA CLÉ DE DÉDUPLICATION — la seconde moitié de #2151.25.
 *
 * Choisir une surface unique empêche un événement d'arriver par deux chemins.
 * Il reste l'autre doublon, celui que ce dépôt a déjà payé ailleurs : le MÊME
 * événement, re-détecté au passage suivant, qui repart comme s'il était neuf.
 * Le balayage quotidien relit des tables où la ligne d'hier est toujours là.
 *
 * La clé est donc déterministe et porte les trois choses qui font qu'un
 * événement est LUI : son genre, son sujet, et le jour où il a eu lieu. Elle est
 * posée en index UNIQUE sur `(workspace_id, event_key)` — c'est la base qui
 * refuse le doublon, pas une lecture préalable qui pourrait courir.
 *
 * ⚠️ Chaque partie est encodée (`encodeURIComponent`) avant d'être jointe : un
 * identifiant contenant le séparateur pourrait sinon fabriquer la clé d'un autre
 * événement, et faire TAIRE une alerte légitime. Le test le vérifie.
 */
export function discoverAlertEventKey(input: {
  kind: DiscoverAlertEventKind | string
  subjectId: string
  /** Le JOUR de l'événement (`YYYY-MM-DD`), pas l'instant : deux détections du
   *  même fait à quatre heures d'intervalle sont le même fait. */
  occurredOn: string
}): string {
  return [input.kind, input.subjectId, input.occurredOn].map(part => encodeURIComponent(part)).join(':')
}

/**
 * #2151.8 — COMBIEN de nouveaux éléments depuis la dernière exécution.
 *
 * ⚠️ `null` quand le périmètre n'a JAMAIS été rejoué, et quand sa dernière
 * exécution est illisible. Rendre `0` dirait « nous avons regardé, il n'y a
 * rien » — une affirmation sur le marché — alors que la vérité est « nous
 * n'avons pas encore regardé ». C'est « non mesuré rendu 0 », appliqué à ce
 * qu'un commercial lit avant de décider d'ouvrir un compte.
 */
export function newItemsSince(eventCount: number, lastRunAt: string | Date | null | undefined): number | null {
  if (lastRunAt === null || lastRunAt === undefined) return null
  const parsed = lastRunAt instanceof Date ? lastRunAt : new Date(lastRunAt)
  if (Number.isNaN(parsed.getTime())) return null
  return eventCount
}

/**
 * #2151.9 — LA SOURCE d'une recherche enregistrée : les natures, dédoublonnées.
 *
 * L'ordre suit `DISCOVER_ALERT_SOURCE_KINDS` plutôt que celui des genres reçus :
 * deux périmètres qui surveillent les mêmes choses dans un ordre différent
 * doivent afficher la même phrase, sinon l'écran a l'air de dire autre chose.
 *
 * Une liste VIDE se lit « source non qualifiée », jamais « aucune source » :
 * un périmètre qui ne surveille encore rien n'affirme rien sur ce qui existe.
 */
export function discoverAlertSourceKindsOf(
  kinds: readonly DiscoverAlertEventKind[],
): readonly DiscoverAlertSourceKind[] {
  const present = new Set(kinds.map(kind => DISCOVER_ALERT_EVENT_SOURCE_KINDS[kind]))
  return DISCOVER_ALERT_SOURCE_KINDS.filter(source => present.has(source))
}

/**
 * Un événement tel qu'il est RENDU — à Aujourd'hui, au panneau de Découvrir, à
 * qui le demande. Ce qu'il porte, et rien de plus.
 */
export const discoverAlertEventSchema = z.object({
  id: z.string(),
  kind: discoverAlertEventKindSchema,
  /** L'objet concerné, pour y aller. `null` quand l'objet n'a pas d'écran. */
  subjectId: z.string().nullable(),
  /** Ce que la ligne DIT — un nom de compte, de besoin, de mission. */
  subjectLabel: z.string(),
  /** La NATURE de la source, jamais l'éditeur. */
  sourceKind: z.enum(DISCOVER_ALERT_SOURCE_KINDS),
  /**
   * QUAND l'événement a eu lieu (ISO 8601). On archive, on ne supprime pas :
   * un événement qui n'est plus « nouveau » reste consultable AVEC sa date.
   */
  occurredAt: z.string(),
  /** Par où il a été délivré — une seule surface (#2151.25). */
  surface: z.enum(
    DISCOVER_ALERT_DELIVERY_SURFACES as ReadonlyArray<DiscoverAlertDeliverySurface> as [
      DiscoverAlertDeliverySurface,
      ...DiscoverAlertDeliverySurface[],
    ],
  ),
  /** La recherche enregistrée qui l'a demandé, ou `null` (événement d'espace). */
  savedViewId: z.string().nullable(),
  /** La route SPA où le détail vit. `null` = pas d'écran, donc un constat. */
  href: z.string().nullable(),
  /**
   * #2097.21 (correctif) — LE LOGO ET LE SITE DU COMPTE, quand le sujet EN
   * EST un. Aujourd'hui seul `new_signal` (le genre urgent produit par
   * `WatchlistRefreshWorker`) a un compte pour sujet — les autres genres
   * urgents (`new_confirmed_need`, `mission_ended`) portent un besoin ou une
   * mission, qui n'ont ni logo ni site (même doctrine que
   * `businessObject.logoUrl` pour une mission : « aucun ici »). `null` par
   * défaut, jamais deviné pour un sujet dont on ne sait pas que c'est un
   * compte.
   */
  logoUrl: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
})
export type DiscoverAlertEvent = z.infer<typeof discoverAlertEventSchema>
