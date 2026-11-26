import { z } from 'zod'

/**
 * Registre par route — épopée #2924 (#2143.21/.22/.23, chantier ARCHITECTURE
 * PRODUIT). L'issue demandait un artefact VERSIONNÉ qui n'existait nulle part :
 * neuf champs obligatoires par route, six statuts de cycle de vie normalisés,
 * une checklist avant tout retrait. Ce fichier EST cet artefact — pas une
 * doctrine en prose, un registre qu'une garde peut lire et faire échouer.
 *
 * Il ne remplace ni `sections.ts` (la navigation RENDUE) ni
 * `doctrine-registry.ts` (les arbitrages) : `sections.ts` dit CE QUI S'AFFICHE
 * aujourd'hui, celui-ci dit CE QUE DEVIENT chaque route et POURQUOI — les deux
 * peuvent diverger le temps d'une migration (#2143.22, `ARCHIVE_ROUTE`).
 */

/**
 * #2143.22 — les SIX statuts, verbatim de l'issue #2143. Un enum ne perd
 * jamais de valeur et n'en insère jamais au milieu (GA-08) : l'ordre ci-dessous
 * est celui de l'issue, à conserver tel quel pour toute extension future.
 */
export const ROUTE_STATUSES = [
  'KEEP_PRIMARY',
  'KEEP_CONTEXTUAL',
  'MERGE',
  'ADMIN_ONLY',
  'ARCHIVE_ROUTE',
  'REMOVE_AFTER_MIGRATION',
] as const
export const routeStatusSchema = z.enum(ROUTE_STATUSES)
export type RouteStatus = z.infer<typeof routeStatusSchema>

/** Le sens de chaque statut, verbatim de l'issue #2143 — un vocabulaire à UN
 *  seul endroit (GA-26) : une garde ou un écran qui l'affiche le lit ICI. */
export const ROUTE_STATUS_MEANING: Readonly<Record<RouteStatus, string>> = {
  KEEP_PRIMARY: 'Surface principale conservée.',
  KEEP_CONTEXTUAL: 'Surface conservée, accessible depuis un objet ou Laura, mais retirée de la navigation principale.',
  MERGE: 'Fonctions absorbées dans une surface plus claire.',
  ADMIN_ONLY: 'Fonction technique ou administrative hors navigation commerciale.',
  ARCHIVE_ROUTE: 'Route conservée pour les anciens liens, mais redirigée vers la nouvelle maison.',
  REMOVE_AFTER_MIGRATION: 'Composant supprimable uniquement après migration de ses données, liens et capacités.',
}

/**
 * #2143.21 — les NEUF champs obligatoires par route, verbatim de l'issue :
 * nom actuel, rôle actuel, données utilisées, actions possibles, maison
 * canonique de ses objets, trafic ou usage si mesurable, doublons, destination
 * cible, statut futur. `trafficNote`/`duplicates` sont NULLABLES : « si
 * mesurable » dans l'issue elle-même reconnaît que la mesure n'existe pas
 * toujours — `null` dit « non mesuré », jamais un texte inventé (doctrine
 * « jamais de donnée fictive »).
 */
export const routeRegistryEntrySchema = z.object({
  /** Le chemin réel, tel qu'il route aujourd'hui — vérifiable par un humain. */
  path: z.string().min(1),
  currentName: z.string().min(1),
  currentRole: z.string().min(1),
  dataUsed: z.array(z.string().min(1)).min(1),
  possibleActions: z.array(z.string().min(1)),
  /** #2143.25/#2143.26 — l'objet dont CETTE route est la maison canonique,
   *  `null` quand elle n'en possède aucune en propre (une page dérivée). */
  canonicalHomeOf: z.string().min(1).nullable(),
  trafficNote: z.string().min(1).nullable(),
  duplicates: z.array(z.string().min(1)),
  targetDestination: z.string().min(1),
  status: routeStatusSchema,
})
export type RouteRegistryEntry = z.infer<typeof routeRegistryEntrySchema>

/**
 * #2143.23 — la checklist de SIX vérifications avant de retirer un écran,
 * verbatim de l'issue #2143 (« RÈGLE DE NON-DESTRUCTION »). Une fonction utile
 * peut quitter la navigation (`KEEP_CONTEXTUAL`) sans jamais être retirée
 * (`REMOVE_AFTER_MIGRATION`) tant qu'une case reste sans réponse écrite.
 */
export const ROUTE_REMOVAL_CHECKLIST = [
  'unique_capability',
  'inbound_links',
  'used_by_notifications',
  'particular_object_shape',
  'carries_control_permission_or_history',
  'data_truly_equivalent_elsewhere',
] as const
export type RouteRemovalCheck = (typeof ROUTE_REMOVAL_CHECKLIST)[number]

export const ROUTE_REMOVAL_CHECK_QUESTION: Readonly<Record<RouteRemovalCheck, string>> = {
  unique_capability: "S'il contient une capacité unique.",
  inbound_links: "S'il possède des liens entrants.",
  used_by_notifications: "S'il est utilisé par des notifications.",
  particular_object_shape: "S'il représente une forme particulière d'un objet.",
  carries_control_permission_or_history: 'Un contrôle, une permission ou un historique.',
  data_truly_equivalent_elsewhere: 'Si sa donnée existe ailleurs de manière réellement équivalente.',
}

/**
 * Une route n'est retirable (`REMOVE_AFTER_MIGRATION`) que si les SIX
 * vérifications ont été répondues — jamais devinées. `answers` ne porte que
 * les cases déjà répondues : une case ABSENTE reste « non vérifiée », jamais
 * un `false` supposé (même discipline que #2143.21 : non mesuré ≠ faux).
 */
export function routeRemovalIsSafe(answers: Partial<Record<RouteRemovalCheck, boolean>>): boolean {
  return ROUTE_REMOVAL_CHECKLIST.every(check => answers[check] === false)
}

/**
 * #2143.2 (épopée #2924) — classification MESURÉE sur le code réel
 * (`apps/web/src/components/navigation/sections.ts`, les entités TypeORM
 * derrière chaque écran), jamais inventée. Un début, pas l'exhaustif : les
 * ~29 routes que le registre du 18/09 dénombrait
 * (`registre-2026-09-18-architecture-produit-chat.md`, #2143.21) ne sont pas
 * toutes ici — chaque ligne ajoutée est une ligne VÉRIFIÉE, jamais une case
 * remplie pour faire nombre (#2143.5, même doctrine que les horizons du
 * plan). Premier lot (25/09, nuit) : briefing/accounts/actions/settings/
 * bak-home/chat. Second lot (26/09, nuit) : les quatre autres sections de
 * NIVEAU SUPÉRIEUR de `sections.ts` — projects/consultants/missions/pilotage
 * — chacune déjà `KEEP_PRIMARY` (visible en barre principale, aucune n'est
 * absorbée ni administrative). Restent HORS de ce lot, faute de temps pour
 * une vérification aussi soignée : les onglets INTERNES de chaque section
 * (`/projects/needs`, `/missions/cra`, `/pilotage/finance`…) et `/rfp`.
 */
export const ROUTE_REGISTRY: readonly RouteRegistryEntry[] = [
  {
    path: '/briefing',
    currentName: 'Ma journée',
    currentRole: 'Quoi faire maintenant — section `today` de `sections.ts`.',
    dataUsed: ['action_plan_items', 'notifications'],
    possibleActions: ['ouvrir un compte', 'traiter une relance'],
    canonicalHomeOf: null,
    trafficNote: null,
    duplicates: [],
    targetDestination: '/briefing',
    status: 'KEEP_PRIMARY',
  },
  {
    path: '/accounts',
    currentName: 'Comptes',
    currentRole: "Où l'utilisateur a décidé d'investir son temps — section `accounts`.",
    dataUsed: ['accounts', 'contacts', 'action_plans'],
    possibleActions: ['analyser un compte', 'ouvrir une fiche', 'demander à Laura'],
    canonicalHomeOf: 'account',
    trafficNote: null,
    duplicates: [],
    targetDestination: '/accounts',
    status: 'KEEP_PRIMARY',
  },
  {
    path: '/actions',
    currentName: 'Actions',
    currentRole: 'Ce qui attend une validation, une exécution ou un suivi — section `actions`.',
    dataUsed: ['action_plan_items'],
    possibleActions: ['valider', 'exécuter', 'suivre'],
    canonicalHomeOf: 'action',
    trafficNote: null,
    duplicates: [],
    targetDestination: '/actions',
    status: 'KEEP_PRIMARY',
  },
  {
    path: '/settings',
    currentName: 'Paramètres',
    currentRole: 'Configuration durable — jamais masquable (`ALWAYS_VISIBLE_NAV`, `items.ts`).',
    dataUsed: ['profiles', 'user_credits'],
    possibleActions: ['modifier un réglage'],
    canonicalHomeOf: null,
    trafficNote: null,
    duplicates: [],
    targetDestination: '/settings',
    status: 'KEEP_PRIMARY',
  },
  {
    path: '/bak/home',
    currentName: 'Back-office',
    currentRole: 'Opérations BellumAI — `BACKOFFICE_SECTION` (`sidebar/items.ts`, D34).',
    dataUsed: ['workspaces', 'billing'],
    possibleActions: ['administrer un espace'],
    canonicalHomeOf: null,
    trafficNote: null,
    duplicates: [],
    targetDestination: '/bak/home',
    status: 'ADMIN_ONLY',
  },
  {
    path: '/chat',
    currentName: 'Laura',
    currentRole: 'Conseiller, décider, orchestrer plusieurs capacités — `AskLaura.tsx`, D44.',
    dataUsed: ['chat_messages', 'action_plan_items', 'accounts'],
    possibleActions: ['poser une question', 'lancer une recherche', 'préparer une action'],
    canonicalHomeOf: null,
    trafficNote: null,
    duplicates: [],
    targetDestination: '/chat',
    status: 'KEEP_PRIMARY',
  },
  /**
   * #2143.2 (épopée #2924) — SECOND lot, même discipline que le premier :
   * MESURÉ sur le code réel (`sections.ts`, les entités TypeORM derrière
   * chaque écran), jamais inventé. `opportunities`/`project_needs` (et non
   * « projects »/« needs ») car c'est le nom RÉEL de la table
   * (`project.entity.ts:9`, `project-need.entity.ts:15`) — le mot d'écran
   * (« Opportunités », #2152.1) n'est pas le nom de la table.
   */
  {
    path: '/projects',
    currentName: 'Opportunités',
    currentRole: 'Le pipe commercial et les besoins ouverts — section `projects`, `sections.ts:315`.',
    dataUsed: ['opportunities', 'project_needs'],
    possibleActions: ['ouvrir une opportunité', 'ouvrir un besoin', 'préparer une proposition'],
    canonicalHomeOf: 'opportunity',
    trafficNote: null,
    duplicates: [],
    targetDestination: '/projects',
    status: 'KEEP_PRIMARY',
  },
  {
    path: '/consultants',
    currentName: 'Vivier',
    currentRole: 'Le vivier de consultants, page unique à vues — section `talents`, `sections.ts:363`.',
    dataUsed: ['consultants', 'submissions'],
    possibleActions: ['ouvrir un consultant', 'positionner sur un besoin', 'consulter les candidatures'],
    canonicalHomeOf: 'consultant',
    trafficNote: null,
    duplicates: [],
    targetDestination: '/consultants',
    status: 'KEEP_PRIMARY',
  },
  {
    path: '/missions',
    currentName: 'Missions',
    currentRole: 'Le suivi de ce qui tourne, quatre moments — section `missions`, `sections.ts:396`.',
    dataUsed: ['missions', 'mission_assignments'],
    possibleActions: ['ouvrir une mission', 'lancer une nouvelle mission', 'saisir un relevé d’activité'],
    canonicalHomeOf: 'mission',
    trafficNote: null,
    duplicates: [],
    targetDestination: '/missions',
    status: 'KEEP_PRIMARY',
  },
  /**
   * `dataUsed` liste ici des sources AGRÉGÉES, jamais une table propre : le
   * cockpit ne possède aucune ligne, il relit missions/opportunities/accounts
   * (même nature que `/briefing` plus haut, qui relit `action_plan_items` sans
   * les posséder).
   */
  {
    path: '/pilotage',
    currentName: 'Pilotage',
    currentRole:
      'Le cockpit manager — finance, marché, qualité des données — section `pilotage`, `sections.ts:753`, réservée aux responsables.',
    dataUsed: ['missions', 'opportunities', 'accounts'],
    possibleActions: ['consulter la finance', 'consulter la veille marché', 'corriger une donnée signalée'],
    canonicalHomeOf: null,
    trafficNote: null,
    duplicates: [],
    targetDestination: '/pilotage',
    status: 'KEEP_PRIMARY',
  },
]
