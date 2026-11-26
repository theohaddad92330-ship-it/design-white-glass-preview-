import { z } from 'zod'
import type { BriefingBlockState } from './daily-briefing.js'

/**
 * LE CONTRAT D'ÉTAT COMMUN DES TROIS PAGES DU JOUR (#2111).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SECOND VOCABULAIRE D'ÉTATS, ET POURQUOI CE N'EN EST PAS UN
 * ─────────────────────────────────────────────────────────────────────────────
 * `briefingBlockStateSchema` (voir `daily-briefing.ts`) porte cinq valeurs :
 * ce sont les cinq que l'API sait PROUVER sur un fil — servi, servi à moitié,
 * pas connecté, portée manquante, source muette. Ce fichier n'en écrit pas une
 * sixième version : il nomme les onze situations que l'ÉCRAN doit savoir dire,
 * et il les DÉRIVE de l'état de fil (`briefingSurfaceStateOf`). Un réglage vit
 * à un seul endroit (GA-26) — l'état de fil reste la vérité, la surface en est
 * la lecture.
 *
 * La différence qui justifie les onze : « servi » ne dit pas si la journée est
 * VIDE. Le même `ready` couvrait « j'ai regardé, il n'y a rien » et « j'ai
 * regardé, voilà ». Une page qui rend la même carte blanche dans les deux cas
 * est exactement ce que le retour refuse en premier (#2111.1) : l'utilisateur
 * ne peut pas distinguer un produit qui n'a rien trouvé d'un produit qui n'a
 * rien regardé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE ÉTAT DOIT PORTER — SEPT FACETTES, PAS UNE PHRASE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2111.13 à #2111.19 : un titre compréhensible, sa raison exacte, ce que le
 * produit peut ENCORE faire, ce que la donnée DÉBLOQUERAIT, une action
 * principale, une alternative, et la dernière synchro si elle est connue.
 * Un état vide qui ne porte que la première facette est une impasse polie.
 *
 * ⚠️ Ce fichier ne contient AUCUNE phrase : seulement des clés de locale. Le
 * texte vit dans `briefing.json` des deux langues, et la copie exacte du
 * retour (#2111.20, #2111.42, #2111.44, #2111.50, #2111.52) s'y écrit. Un
 * contrat qui portait sa copie en dur ne serait traduisible dans aucune autre
 * langue, et la garde `une-garde-monolingue-est-aveugle` du dépôt existe
 * précisément pour ça.
 */

/**
 * Les ONZE états nommés (#2111.2 à #2111.12).
 *
 * L'ordre suit le parcours réel : de « rien n'est branché » à « ça a cassé ».
 * Ce n'est pas cosmétique — c'est l'ordre dans lequel un état remplace le
 * précédent quand l'utilisateur avance, et il se lit donc comme une progression.
 */
export const BRIEFING_SURFACE_STATES = [
  /** Aucun outil branché dans cet espace. Ce n'est PAS « vide ». */
  'not_connected',
  /** Branché, jamais lu : la première synchronisation n'a pas eu lieu (#2111.50). */
  'connected_not_synced',
  /** La lecture est EN COURS. Un écran qui l'ignore affiche un vide provisoire. */
  'syncing',
  /** Lu, et il y a de quoi travailler. Le seul état qui ne rend aucun avis. */
  'ready_with_data',
  /** Lu, et il n'y a RIEN — un fait, pas une panne (#2111.54). */
  'ready_empty',
  /** Une source a répondu, une autre non : on montre ce qu'on a et on le DIT. */
  'partial',
  /** Branché mais la portée manque : reconnexion requise. */
  'missing_scope',
  /** L'espace REFUSE cet accès à cette personne — un droit, pas une panne. */
  'permission_denied',
  /** Lu, mais il y a longtemps : la donnée affichée peut être fausse aujourd'hui. */
  'stale',
  /** La source n'a pas répondu maintenant. Rien n'est perdu. */
  'unavailable',
  /** Quelque chose a cassé de notre côté, et on ne le déguise pas en vide. */
  'error',
] as const
export const briefingSurfaceStateSchema = z.enum(BRIEFING_SURFACE_STATES)
export type BriefingSurfaceState = z.infer<typeof briefingSurfaceStateSchema>

/**
 * Les SEPT facettes qu'un état porte (#2111.13 à #2111.19).
 *
 * La liste est exportée parce qu'elle se VÉRIFIE : une huitième facette ajoutée
 * au contrat sans être nommée ici fait rougir le test, donc oblige à décider
 * comment elle se rend. C'est la même mécanique que `BRIEFING_CARD_FIELDS`.
 */
export const BRIEFING_SURFACE_STATE_FACETS = [
  'title',
  'reason',
  'stillPossible',
  'unlocks',
  'primaryAction',
  'alternative',
  'lastSync',
] as const
export type BriefingSurfaceStateFacet = (typeof BRIEFING_SURFACE_STATE_FACETS)[number]

/**
 * Les GESTES qu'un état vide peut proposer. Liste fermée, et fermée à dessein.
 *
 * ⚠️ Aucun geste n'ENVOIE : le copilote prépare, le commercial envoie
 * (doctrine, non négociable). `prepareMessage` prépare, il ne poste pas. Un
 * geste ajouté ici doit exister comme écran ou comme action déjà exécutable —
 * proposer un bouton qui n'atterrit nulle part est la forme la plus coûteuse
 * d'état vide « utile ».
 */
export const BRIEFING_SURFACE_GESTURES = [
  /** Brancher un outil — `/integrations`. */
  'connect',
  /** Rebrancher : la portée manque ou le jeton a expiré. */
  'reconnect',
  /** Lancer la première lecture, ou la relancer (#2111.51). */
  'sync',
  /** Réessayer la lecture qui vient d'échouer. */
  'retry',
  /** Demander l'accès à qui l'administre — jamais le contourner. */
  'requestAccess',
  /** Valider ou mettre à jour l'audit commercial (#2111.45). */
  'audit',
  /** Analyser un premier compte (#2111.47). */
  'analyseAccount',
  /** Travailler à partir d'un import (#2111.24). */
  'import',
  /** Ouvrir Découvrir (#2111.25). */
  'discover',
  /** Préparer un message depuis un compte (#2111.42) — préparer, pas poster. */
  'prepareMessage',
] as const
export type BriefingSurfaceGesture = (typeof BRIEFING_SURFACE_GESTURES)[number]

/** Ce qu'un état DIT, en clés de locale — jamais en phrases. */
export type BriefingSurfaceStateEditorial = {
  /** #2111.13 — un titre compréhensible, propre à cet état. */
  titleKey: string
  /** #2111.14 — la raison exacte, pas « une erreur est survenue ». */
  reasonKey: string
  /** #2111.15 — ce que le produit peut ENCORE faire sans cette donnée. */
  stillPossibleKey: string
  /** #2111.16 — ce que la donnée débloquerait si elle arrivait. */
  unlocksKey: string
  /** #2111.17 — l'action principale, celle qui répare ou qui avance. */
  primary: BriefingSurfaceGesture
  /** #2111.18 — l'alternative, pour qui ne veut pas du geste principal. */
  alternative: BriefingSurfaceGesture
  /** #2111.19 — l'écran affiche la dernière synchro QUAND elle est connue. */
  showsLastSync: boolean
}

/**
 * LA RÉPONSE ÉCRITE DE CHAQUE ÉTAT.
 *
 * `ready_with_data` vaut `null` : c'est le seul état qui ne rend AUCUN avis —
 * la donnée est là, la page parle d'elle-même. Tous les autres en rendent un,
 * et deux d'entre eux ne peuvent pas partager leur titre : ce serait la carte
 * blanche de #2111.1, celle qui se lit « il n'y a rien » quand la vérité est
 * « je n'ai pas pu regarder ».
 *
 * ⚠️ Le type `Record<BriefingSurfaceState, …>` est TOTAL : ajouter un douzième
 * état ne compile plus tant qu'il n'a pas sa réponse. C'est exactement ce qu'on
 * veut d'un contrat d'état — l'oubli est impossible, pas seulement découragé.
 */
export const BRIEFING_SURFACE_STATE_CONTRACT: Record<BriefingSurfaceState, BriefingSurfaceStateEditorial | null> = {
  not_connected: {
    titleKey: 'surfaceState.notConnected.title',
    reasonKey: 'surfaceState.notConnected.reason',
    stillPossibleKey: 'surfaceState.notConnected.stillPossible',
    unlocksKey: 'surfaceState.notConnected.unlocks',
    primary: 'connect',
    alternative: 'audit',
    showsLastSync: false,
  },
  connected_not_synced: {
    titleKey: 'surfaceState.connectedNotSynced.title',
    reasonKey: 'surfaceState.connectedNotSynced.reason',
    stillPossibleKey: 'surfaceState.connectedNotSynced.stillPossible',
    unlocksKey: 'surfaceState.connectedNotSynced.unlocks',
    primary: 'sync',
    alternative: 'audit',
    showsLastSync: false,
  },
  syncing: {
    titleKey: 'surfaceState.syncing.title',
    reasonKey: 'surfaceState.syncing.reason',
    stillPossibleKey: 'surfaceState.syncing.stillPossible',
    unlocksKey: 'surfaceState.syncing.unlocks',
    // Pendant la lecture, le geste utile n'est pas de la relancer : c'est de
    // travailler ailleurs. « Annuler » vit sur le job lui-même (#2110.37), pas
    // dans l'avis d'un bloc.
    primary: 'analyseAccount',
    alternative: 'discover',
    showsLastSync: true,
  },
  // La donnée est là : la page parle d'elle-même. Un avis de plus serait la
  // ligne de bruit que chaque bloc paierait.
  ready_with_data: null,
  ready_empty: {
    titleKey: 'surfaceState.readyEmpty.title',
    reasonKey: 'surfaceState.readyEmpty.reason',
    stillPossibleKey: 'surfaceState.readyEmpty.stillPossible',
    unlocksKey: 'surfaceState.readyEmpty.unlocks',
    primary: 'discover',
    alternative: 'prepareMessage',
    showsLastSync: true,
  },
  partial: {
    titleKey: 'surfaceState.partial.title',
    reasonKey: 'surfaceState.partial.reason',
    stillPossibleKey: 'surfaceState.partial.stillPossible',
    unlocksKey: 'surfaceState.partial.unlocks',
    primary: 'retry',
    alternative: 'reconnect',
    showsLastSync: true,
  },
  missing_scope: {
    titleKey: 'surfaceState.missingScope.title',
    reasonKey: 'surfaceState.missingScope.reason',
    stillPossibleKey: 'surfaceState.missingScope.stillPossible',
    unlocksKey: 'surfaceState.missingScope.unlocks',
    primary: 'reconnect',
    alternative: 'import',
    showsLastSync: true,
  },
  permission_denied: {
    titleKey: 'surfaceState.permissionDenied.title',
    reasonKey: 'surfaceState.permissionDenied.reason',
    stillPossibleKey: 'surfaceState.permissionDenied.stillPossible',
    unlocksKey: 'surfaceState.permissionDenied.unlocks',
    // On ne contourne JAMAIS un droit : le geste est de le demander à qui
    // l'administre. Proposer « reconnecter » ferait tourner l'utilisateur en
    // rond sur un refus qui n'est pas technique.
    primary: 'requestAccess',
    alternative: 'audit',
    showsLastSync: true,
  },
  stale: {
    titleKey: 'surfaceState.stale.title',
    reasonKey: 'surfaceState.stale.reason',
    stillPossibleKey: 'surfaceState.stale.stillPossible',
    unlocksKey: 'surfaceState.stale.unlocks',
    primary: 'sync',
    alternative: 'prepareMessage',
    showsLastSync: true,
  },
  unavailable: {
    titleKey: 'surfaceState.unavailable.title',
    reasonKey: 'surfaceState.unavailable.reason',
    stillPossibleKey: 'surfaceState.unavailable.stillPossible',
    unlocksKey: 'surfaceState.unavailable.unlocks',
    primary: 'retry',
    alternative: 'analyseAccount',
    showsLastSync: true,
  },
  error: {
    titleKey: 'surfaceState.error.title',
    reasonKey: 'surfaceState.error.reason',
    stillPossibleKey: 'surfaceState.error.stillPossible',
    unlocksKey: 'surfaceState.error.unlocks',
    primary: 'retry',
    alternative: 'import',
    showsLastSync: true,
  },
}

/**
 * L'ÉTAT DE SURFACE D'UN BLOC, DÉRIVÉ DE CE QUE L'API A PROUVÉ.
 *
 * ⚠️ TOTAL et sans branche par défaut : les cinq états de fil sont traités un
 * par un. Un `default` silencieux est précisément ce qui fait qu'un sixième
 * état de fil, le jour où il arrive, s'affiche comme « vide » — la carte
 * blanche que ce contrat existe pour empêcher.
 *
 * `hasData` ne se devine pas côté surface : c'est l'appelant qui sait si SON
 * bloc porte quelque chose (des rendez-vous, des fils, des tâches). Le passer
 * plutôt que de le calculer ici évite un second verdict sur la même donnée.
 *
 * Cinq des onze états — `connected_not_synced`, `syncing`, `permission_denied`,
 * `stale`, `error` — ne sont PAS produits par cette dérivation : l'API ne les
 * prouve pas encore. Ils sont déclarés, pas servis, et le test le dit noir sur
 * blanc pour que personne ne les croie branchés.
 */
export function briefingSurfaceStateOf({
  state,
  hasData,
}: {
  state: BriefingBlockState
  hasData: boolean
}): BriefingSurfaceState {
  switch (state) {
    case 'ready':
      // LA distinction qui justifie ce fichier (#2111.1) : « j'ai regardé et
      // il n'y a rien » n'est pas « j'ai regardé et voilà ».
      return hasData ? 'ready_with_data' : 'ready_empty'
    case 'partial':
      // Rempli ou non : une source muette peut cacher exactement ce qui aurait
      // rempli la journée. Le bloc montre ce qu'il a ET dit qu'il lui manque
      // une source — il ne se déclare jamais complet.
      return 'partial'
    case 'not_connected':
      return 'not_connected'
    case 'missing_scope':
      return 'missing_scope'
    case 'unavailable':
      return 'unavailable'
  }
}
