import { DEAL_STAGE_SLA_BOUNDS, type NotificationPreferences, type PipelineStage } from '@bellum/contracts'
// GA-07 — le PORT étroit de ce module, jamais `../crm-core/deal-stage-sla.service`
// directement : voir la doc de `deal-stage-sla.port.ts`.
import type { PipelineStageSlaRow } from './deal-stage-sla.port'

/**
 * LOT 16 (#1822) — L'INVENTAIRE DES VINGT ÉCRANS DE RÉGLAGES, ET LA POSTURE DE
 * LAURA SUR CHACUN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, TRANCHÉE PAR LOUIS : « IL FAUT QU'ELLE PUISSE ÉCRIRE OU RENVOYER »
 * ─────────────────────────────────────────────────────────────────────────────
 * Donc les deux, et c'est l'ÉCRAN qui décide — pas l'humeur du moment :
 *
 *  · **Laura ÉCRIT** quand le réglage est réversible d'un clic et ne sort pas
 *    du produit ;
 *  · **Laura RENVOIE** quand le geste ENGAGE — et le renvoi n'est pas un repli :
 *    c'est `propose_guided_action` avec la route, et il DIT ce qu'on va y faire
 *    (`highlight`, désormais EXIGÉ côté IA pour toute route de réglages) ;
 *  · le principe qui résume les deux : **une écriture qui sort du produit ou
 *    qui change les droits de quelqu'un passe par une porte visible, où le clic
 *    EST la décision.**
 *
 * ⚠️ Dans TOUS les cas — écriture comprise — rien n'est écrit avant le clic :
 * `_proposal()` côté IA rend `status: "pending_confirmation"`, et c'est la carte
 * de `PendingActions.tsx` qui appelle la route authentifiée. « Laura écrit »
 * veut dire « Laura prépare l'écriture à un clic », jamais « Laura écrit seule ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INVENTAIRE — les vingt-deux écrans, leur posture, et sa raison en une ligne
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ La SOURCE est {@link LAURA_SETTINGS_SCREENS} ci-dessous, PAS ce tableau :
 * une garde qui lirait un commentaire resterait verte pendant que le code
 * diverge — ce dépôt a déjà payé cette espèce-là. Le tableau est ici pour se
 * relire d'un coup d'œil ; `laura-settings-catalog.spec.ts` croise le tableau
 * TYPÉ avec `items.settings.ts` lu SUR LE DISQUE.
 *
 * | Écran                      | Posture  | Raison                                                            |
 * | -------------------------- | -------- | ----------------------------------------------------------------- |
 * | `/settings`                | RENVOIE  | ces réglages vivent dans le navigateur, pas sur le serveur         |
 * | `/settings/profile`        | RENVOIE  | ce que la personne DÉCLARE d'elle-même, en texte libre             |
 * | `/settings/profile/audit`  | RENVOIE  | une RESTITUTION : rien à y écrire, on corrige à la source          |
 * | `/settings/notifications`  | ÉCRIT    | des interrupteurs et un plafond borné, réversibles d'un clic       |
 * | `/settings/routines`       | ÉCRIT    | catalogue FERMÉ, abonnement (état, heure, jour, canal) réversible  |
 * | `/settings/security`       | INTERDIT | sécurité — doctrine, non re-litigable                              |
 * | `/settings/mes-donnees`    | INTERDIT | export et suppression RGPD : irréversible, et ça sort du produit   |
 * | `/settings/mes-signalements` | ÉCRIT  | Laura PRÉPARE un signalement depuis une capture ; le clic l'envoie par le MÊME formulaire (#2433.7) |
 * | `/settings/shortcuts`      | RENVOIE  | page de RÉFÉRENCE : il n'y a aucun réglage à écrire                |
 * | `/settings/mcp`            | RENVOIE  | brancher un client MCP délivre un accès à un outil TIERS           |
 * | `/settings/memory`         | ÉCRIT    | épingler AJOUTE une ligne, visible et retirable d'un clic          |
 * | `/settings/knowledge`      | RENVOIE  | déposer un document suppose de transporter un FICHIER              |
 * | `/integrations`            | RENVOIE  | autoriser l'accès à un outil tiers SORT du produit                 |
 * | `/settings/import`         | RENVOIE  | reprendre une base suppose de transporter un FICHIER               |
 * | `/settings/team`           | INTERDIT | droits — doctrine, non re-litigable                                |
 * | `/settings/business-units` | RENVOIE  | capacité et objectif d'un périmètre : aucune porte n'écrit encore  |
 * | `/settings/legal-entities` | INTERDIT | entités juridiques — doctrine, non re-litigable                    |
 * | `/settings/finance`        | INTERDIT | seuil de marge — donnée financière, doctrine, non re-litigable     |
 * | `/settings/activity`       | RENVOIE  | un journal se LIT : il n'y a aucun réglage à écrire                |
 * | `/settings/catalogues`     | RENVOIE  | un libellé LIBRE que le modèle écrirait à la place de l'ESN        |
 * | `/settings/lexicon`        | RENVOIE  | un mot LIBRE, et il change ce que TOUTE l'équipe lit               |
 * | `/settings/pipeline`       | ÉCRIT    | quatre étapes NOMMÉES et une durée bornée                          |
 * | `/settings/reverse-market` | RENVOIE  | aucune porte de conversation ne l'écrit encore (#2035.10)          |
 * | `/settings/commercial-load`| RENVOIE  | aucune porte de conversation ne l'écrit encore (#2035.11)          |
 * | `/settings/branding`       | RENVOIE  | le nom, le logo et le domaine changent ce que les CLIENTS voient   |
 * | `/settings/vivier-export`  | ÉCRIT    | LANCER l'export (ATS, en lot) est un geste fermé et réversible — le fichier produit SORT du produit comme `/settings/mes-donnees`, mais Laura ne le prépare ni ne le choisit : elle appuie sur le MÊME bouton (#3950.1, décision Louis 09/10/2026) |
 * | `/billing`                 | INTERDIT | argent — doctrine, non re-litigable                                |
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX CRITÈRES D'UNE ÉCRITURE, ET LES TROIS PORTES QUI LA PORTENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un écran n'est écrivable que s'il est à la fois :
 *  1. SÛR — hors des familles interdites (argent, droits, cloisonnement,
 *     sécurité, entités juridiques, données & exports). Voir
 *     {@link FORBIDDEN_SETTINGS_WRITE_SCREENS} et
 *     {@link assertNoForbiddenWritableSettingsScreen} ;
 *  2. VÉRIFIABLE — un vocabulaire FERMÉ, un booléen ou un entier borné, jamais
 *     du texte libre que le modèle écrirait lui-même.
 *
 * C'est le critère 2 — pas le premier — qui range `/settings/lexicon` et
 * `/settings/catalogues` du côté du RENVOI : « Affaire », « concurrent
 * installé » sont les mots de l'ESN, et un modèle qui les propose les INVENTE.
 * Et c'est une MESURE, pas une opinion, qui y range `/settings` : ses
 * préférences vivent dans `localStorage`
 * (`apps/web/src/features/preferences/preferences-provider.tsx`) — Laura ne peut
 * ni lire la valeur de départ, ni promettre que le changement suive la personne
 * sur son autre poste.
 *
 * Cinq portes EXISTANTES portent les écritures, et `via` nomme laquelle
 * (#3950.1, décision Louis 09/10/2026, ouvre la quatrième ; #2433.7, lot M10
 * 09/10, la cinquième — les trois premières restent celles du LOT 16) :
 *  · `settings_overview`     → `propose_settings_update`, pour un CHAMP d'écran ;
 *  · `toggle_routine`        → l'abonnement à une routine (état, heure, jour, canal) ;
 *  · `pin_memory_fact`       → un fait AJOUTÉ à la mémoire ;
 *  · `launch_vivier_export`  → LANCE l'export du vivier (ATS, en lot), par le
 *    MÊME service que le bouton de l'écran — jamais un second chemin ;
 *  · `prepare_bug_report`    → PRÉPARE un signalement de bug ; le clic l'envoie par
 *    `POST /feedback`, la porte du formulaire de signalement.
 *
 * ⚠️ Chaque route ici doit AUSSI exister dans le catalogue des écrans de
 * réglages que Laura connaît côté IA (`SETTINGS_SCREENS`,
 * `apps/ia/app/services/chat_tools.py`, lui-même dérivé de
 * `items.settings.ts`) — sinon `propose_guided_action` refuserait une route
 * que cette écriture accepte, ce qui serait absurde. Vérifié par
 * `test_settings_write_screens_are_known.py` ; les outils nommés par `via` et
 * `readVia` sont croisés avec les outils RÉELS par
 * `test_settings_screens_posture.py`.
 */
type LauraSettingsPosture = 'write' | 'redirect' | 'forbidden'

/**
 * La porte d'écriture EXISTANTE qui porte l'écriture de cet écran. `null` quand
 * Laura n'y écrit pas — et il n'y a pas d'autre valeur possible : ouvrir une
 * quatrième porte demanderait de l'ajouter ici, donc d'en écrire la raison.
 */
type LauraSettingsWriteGate =
  | 'settings_overview'
  | 'toggle_routine'
  | 'pin_memory_fact'
  | 'launch_vivier_export'
  // #2433.7 (lot M10, 09/10) — la cinquième porte : le signalement préparé.
  | 'prepare_bug_report'

type LauraSettingsScreen = {
  /** La route, telle que `items.settings.ts` la déclare. */
  route: string
  posture: LauraSettingsPosture
  /** L'outil d'ÉCRITURE, quand il y en a un. */
  via: LauraSettingsWriteGate | null
  /** L'outil de LECTURE dédié, quand il y en a un. `null` dit une ABSENCE, pas
   *  « rien à lire » : c'est la liste de ce qui reste à ouvrir. */
  readVia: string | null
  /** La raison, en une ligne. Texte de MAINTENANCE, jamais affiché — aucun
   *  libellé d'interface ne s'écrit dans un catalogue. */
  reason: string
}

/**
 * L'INVENTAIRE. Ordre de `items.settings.ts` — Personnel, puis Espace de
 * travail — pour que les deux listes se relisent côte à côte.
 */
export const LAURA_SETTINGS_SCREENS = [
  {
    route: '/settings',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'Préférences d’interface : elles vivent dans le navigateur (localStorage), pas sur le serveur. Laura ne peut ni lire la valeur actuelle ni promettre que le changement suive la personne sur un autre poste.',
  },
  {
    route: '/settings/profile',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'Le poste, les secteurs suivis et le contexte sont ce que la personne DÉCLARE d’elle-même, en texte libre : Laura l’écrirait à sa place.',
  },
  {
    route: '/settings/profile/audit',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'L’audit commercial est une RESTITUTION : il n’y a rien à y écrire, il montre ce que le produit a compris du questionnaire. Une correction se fait à la SOURCE (`/settings/profile`), sinon l’écran et les réponses divergeraient. Laura y renvoie donc, et n’y écrit jamais.',
  },
  {
    route: '/settings/notifications',
    posture: 'write',
    via: 'settings_overview',
    readVia: 'get_settings_overview',
    reason:
      'Des interrupteurs et un plafond borné 1-5 : vocabulaire fermé, réversible d’un clic, n’engage personne d’autre.',
  },
  {
    route: '/settings/routines',
    posture: 'write',
    via: 'toggle_routine',
    readVia: 'get_routines',
    reason:
      'Catalogue FERMÉ de routines : l’abonnement (état, heure, jour, canal) est personnel, borné par le contrat, et se rebascule d’un clic.',
  },
  {
    route: '/settings/security',
    posture: 'forbidden',
    via: null,
    readVia: null,
    reason: 'Sécurité — mot de passe, double authentification, sessions actives. Doctrine, non re-litigable.',
  },
  {
    route: '/settings/mes-donnees',
    posture: 'forbidden',
    via: null,
    readVia: null,
    reason:
      'Export et suppression des données personnelles (RGPD) : irréversible, et le résultat SORT du produit. Doctrine, non re-litigable.',
  },
  {
    // #3950.1 (décision Louis 09/10/2026, QCM, lot G01) — « Laura peut tout
    // faire » sur cet écran : elle peut LANCER l'export (toutes les options de
    // la modale — ATS, en lot) sur demande (« exporte mon vivier », « exporte
    // les dispos pour l'ATS »). Le résultat SORT bien du produit, mais Laura ne
    // choisit rien et ne prépare rien : elle appuie sur le MÊME bouton que
    // l'écran (`VivierExportMenu`), jamais un second chemin d'export — ce qui
    // la distingue de `/settings/mes-donnees` (RGPD, où le geste reste humain
    // parce qu'il est IRRÉVERSIBLE). La règle d'espace « qui peut exporter »
    // (`/settings/workspace-rules`) continue de tenir le clic : un refus se
    // NOMME (`workspaceRules:refusal.exportPolicy`), jamais un échec muet.
    route: '/settings/vivier-export',
    posture: 'write',
    via: 'launch_vivier_export',
    readVia: null,
    reason:
      'Lancer l’export (ATS, en lot) est un geste fermé et réversible pour Laura — deux options NOMMÉES, aucun choix inventé — par le MÊME service que le bouton de l’écran. La règle d’espace « qui peut exporter » reste la porte (#3950.1, décision Louis 09/10/2026, ratifie #3950).',
  },
  {
    // #2433.7 (épopée #2876, lot M10 09/10) — la règle CAPTURE INTERFACE
    // promettait « tu prépares un signalement » sans outil derrière. Laura
    // PRÉPARE (`prepare_bug_report`), le clic de la personne ENVOIE par
    // `POST /feedback` — la porte du formulaire, refusée en salle de
    // démonstration. Un signalement ne part toujours que d'un clic humain.
    route: '/settings/mes-signalements',
    posture: 'write',
    via: 'prepare_bug_report',
    readVia: null,
    reason:
      'Laura PRÉPARE un signalement depuis une capture de l’application (le constat visible, jamais une cause serveur) ; il ne part que du clic de la personne sur la carte, par le MÊME formulaire (`POST /feedback`). La page elle-même se lit : les signalements et leur état.',
  },
  {
    route: '/settings/shortcuts',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason: 'Page de RÉFÉRENCE : elle liste les raccourcis clavier, elle n’en règle aucun — il n’y a rien à écrire.',
  },
  {
    route: '/settings/do-not-contact',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'La liste « ne pas contacter » est PARTAGÉE par toute l’équipe (#4158.22) : ajouter ou lever une exclusion change ce que chaque collègue peut écrire à un prospect. Laura y renvoie, et n’y écrit jamais.',
  },
  {
    route: '/settings/mcp',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason: 'Brancher un client MCP délivre un ACCÈS à un outil tiers : le clic sur l’écran EST la décision.',
  },
  {
    route: '/settings/memory',
    posture: 'write',
    via: 'pin_memory_fact',
    readVia: 'get_memory',
    reason:
      'Épingler AJOUTE une ligne, visible dans l’écran et retirable d’un clic. Oublier, lui, reste à l’écran : une ligne effacée ne revient pas.',
  },
  {
    route: '/settings/knowledge',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'Déposer un document suppose de transporter un FICHIER, et la conversation ne sait pas le faire aujourd’hui.',
  },
  {
    route: '/integrations',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'Autoriser l’accès à un outil tiers SORT du produit : c’est la personne qui autorise, sur l’écran, en connaissant ce qu’elle donne.',
  },
  {
    route: '/settings/import',
    posture: 'redirect',
    via: null,
    readVia: 'get_import_overview',
    reason:
      'Reprendre une base suppose de transporter un FICHIER — et un import mal réglé touche TOUT l’espace, pas seulement celui qui le lance.',
  },
  {
    route: '/settings/team',
    posture: 'forbidden',
    via: null,
    readVia: null,
    reason: 'Droits — membres, rôles, permissions, sièges. Doctrine, non re-litigable.',
  },
  {
    // #2081.14 — les règles d'espace : visibilité des comptes d'une unité, qui
    // peut exporter. Posées par un administrateur, elles priment sur les
    // réglages de chacun.
    route: '/settings/workspace-rules',
    posture: 'forbidden',
    via: null,
    readVia: null,
    reason:
      'Droits — des règles qui priment sur les réglages de toute l’équipe, posées par un administrateur. Doctrine, non re-litigable.',
  },
  {
    // #2005.5 — la fiche d'un périmètre de travail (BU, agence, équipe).
    route: '/settings/business-units',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'La capacité disponible et l’objectif de trimestre d’un périmètre changent ce que le moteur cite pour TOUTE l’équipe qui le porte. Aucune porte de conversation ne les écrit aujourd’hui : Laura y renvoie.',
  },
  {
    // #2451.9 — le mode par défaut d'un fil neuf pour TOUT l'espace.
    route: '/settings/laura-mode',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'Le mode de contexte PAR DÉFAUT de l’espace (#2451.9) : il vaut pour toute l’équipe et seuls le propriétaire ou l’administrateur le changent. Aucune porte de conversation ne l’écrit aujourd’hui : Laura y renvoie ; le mode d’UNE conversation se choisit, lui, sous le composeur.',
  },
  {
    route: '/settings/legal-entities',
    posture: 'forbidden',
    via: null,
    readVia: null,
    reason: 'Entités juridiques — les raisons sociales qui facturent. Doctrine, non re-litigable.',
  },
  {
    // #2420.17 — le seuil d'alerte de marge de l'espace.
    route: '/settings/finance',
    posture: 'forbidden',
    via: null,
    readVia: null,
    reason:
      'Le seuil d’alerte de marge est une donnée financière de l’espace, comme les crédits et l’abonnement : argent — doctrine, non re-litigable.',
  },
  {
    route: '/settings/activity',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'Un journal d’activité se LIT : il n’y a aucun réglage à écrire, et il porte l’activité de tout l’espace, pas la sienne.',
  },
  {
    route: '/settings/catalogues',
    posture: 'redirect',
    via: null,
    readVia: 'get_workspace_vocabulary',
    reason:
      'Un motif se saisit en texte LIBRE et change les sélecteurs de TOUT LE MONDE : un modèle qui le propose l’invente.',
  },
  {
    route: '/settings/lexicon',
    posture: 'redirect',
    via: null,
    readVia: 'get_workspace_vocabulary',
    reason:
      'Les mots de l’ESN sont du texte LIBRE, et renommer un objet du produit change ce que TOUTE l’équipe lit à l’écran.',
  },
  {
    route: '/settings/pipeline',
    posture: 'write',
    via: 'settings_overview',
    readVia: 'get_settings_overview',
    reason:
      'Quatre étapes NOMMÉES et une durée bornée (DEAL_STAGE_SLA_BOUNDS) : vocabulaire fermé, réversible d’un clic.',
  },
  {
    // #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations
    // concurrentes. Cet écran porte TOUT le sujet du marché inversé, y compris
    // le nombre de recruteurs affichés que « Priorisation commerciale »
    // réglait ailleurs — cette entrée-là a donc disparu du catalogue, son
    // sujet étant couvert ici et par `/settings/commercial-load`.
    // Un booléen et deux entiers bornés : même forme fermée que le SLA du pipe
    // juste au-dessus. Mais ce lot n'a touché ni `chat_tools.py` ni
    // `settings_overview` : aucune des trois portes n'écrit ces champs
    // aujourd'hui — l'ouvrir serait une écriture NOUVELLE que cette fusion n'a
    // pas mesurée. Laura y renvoie, comme les Périmètres.
    route: '/settings/reverse-market',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'Activer le marché inversé et déclarer une capacité changent ce que TOUTE l’équipe accepte de traiter. Aucune porte de conversation ne les écrit aujourd’hui : Laura y renvoie.',
  },
  {
    // #2035.11 — la charge commerciale et la priorisation des besoins, les
    // DEUX plafonds du sujet depuis la fusion du 21/09. Même raison que
    // ci-dessus : des entiers bornés sur des colonnes déjà réelles, mais
    // aucune porte conversationnelle ne les sert encore.
    route: '/settings/commercial-load',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'Les deux plafonds changent la file de priorisation de TOUTE l’équipe. Aucune porte de conversation ne les écrit aujourd’hui : Laura y renvoie.',
  },
  {
    route: '/settings/branding',
    posture: 'redirect',
    via: null,
    readVia: null,
    reason:
      'Le nom, le logo et le domaine d’envoi changent ce que les CLIENTS de l’espace voient : le geste sort du produit.',
  },
  {
    route: '/billing',
    posture: 'forbidden',
    via: null,
    readVia: null,
    reason: 'Argent — abonnement, crédits, sièges facturés. Doctrine, non re-litigable.',
  },
] as const satisfies readonly LauraSettingsScreen[]

/** Les entrées écrivables PAR CHAMP — celles que `laura/settings-overview` sert. */
type FieldWriteScreen = Extract<(typeof LAURA_SETTINGS_SCREENS)[number], { posture: 'write'; via: 'settings_overview' }>

/**
 * Les écrans que `propose_settings_update` peut écrire, CHAMP par champ —
 * DÉRIVÉS de l'inventaire, jamais recopiés. Un réglage vit à un seul endroit
 * (GA-26) : la liste et sa raison ne peuvent plus diverger puisqu'il n'y a plus
 * qu'une liste.
 *
 * `/settings/routines` et `/settings/memory` sont écrivables EUX AUSSI, mais par
 * leur propre porte (`toggle_routine`, `pin_memory_fact`) : cette constante-ci
 * ne nomme que ce que `laura/settings-overview` SERT, c'est-à-dire des champs.
 */
export const WRITABLE_SETTINGS_SCREENS: readonly FieldWriteScreen['route'][] = LAURA_SETTINGS_SCREENS.filter(
  (screen): screen is FieldWriteScreen => screen.posture === 'write' && screen.via === 'settings_overview',
).map(screen => screen.route)
type WritableSettingsScreen = FieldWriteScreen['route']

/**
 * Les familles que la doctrine refuse d'ouvrir à une écriture conversationnelle
 * — Laura les NOMME et y emmène (`propose_guided_action`), elle n'y écrit
 * jamais : argent, droits, cloisonnement, sécurité, entités juridiques,
 * données & exports (CLAUDE.md § Doctrine, « ce qui n'écrit pas tout seul »).
 *
 * DÉRIVÉES de l'inventaire, pour la même raison que la liste écrivable. Corpus
 * volontairement NOMMÉ écran par écran plutôt que déduit de `manager_only` : un
 * écran réservé aux gestionnaires (`/settings/catalogues`) n'est pas forcément
 * une question d'argent ou de sécurité, et l'inverse serait un faux négatif —
 * la garde protège une règle PRÉCISE, elle n'en invente pas une plus large.
 */
export const FORBIDDEN_SETTINGS_WRITE_SCREENS: readonly string[] = LAURA_SETTINGS_SCREENS.filter(
  screen => screen.posture === 'forbidden',
).map(screen => screen.route)

/**
 * Lève si un écran d'une famille interdite s'est glissé dans une liste
 * écrivable. Extraite en fonction PURE (plutôt qu'un simple `.every` inline)
 * pour être testable indépendamment de NestJS — et pour qu'une garde puisse
 * prouver qu'elle sait dire NON en lui passant une liste empoisonnée.
 */
export function assertNoForbiddenWritableSettingsScreen(screens: readonly string[]): void {
  const forbidden = new Set<string>(FORBIDDEN_SETTINGS_WRITE_SCREENS)
  const leaked = screens.filter(screen => forbidden.has(screen))
  if (leaked.length > 0) {
    throw new Error(
      `Réglage(s) d'une famille interdite (argent, droits, cloisonnement, sécurité) rendu(s) ` +
        `écrivable(s) depuis la conversation : ${leaked.join(', ')}`,
    )
  }
}

/** Une valeur de réglage que Laura peut PROPOSER de changer — jamais du texte
 *  libre : un booléen, ou un entier borné dans un vocabulaire fermé de clés. */
type SettingsOverviewField =
  | { field: string; label: string; type: 'bool'; value: boolean }
  | { field: string; label: string; type: 'int'; value: number; min: number; max: number }

export type SettingsOverviewScreen = { screen: WritableSettingsScreen; fields: SettingsOverviewField[] }

/** Les clés BOOLÉENNES de `NotificationPreferences` — même filtre que
 *  `PrefKey` dans `NotificationsView.tsx` : `email_language` (une chaîne) et
 *  `proactivity_cap` (un entier) en sont exclus par construction, pas par une
 *  liste qu'on pourrait oublier de tenir à jour. */
type BoolPreferenceKey = {
  [K in keyof NotificationPreferences]: NotificationPreferences[K] extends boolean ? K : never
}[keyof NotificationPreferences]

/**
 * Les interrupteurs de `/settings/notifications` que la conversation peut
 * basculer. `email_language` est EXCLU : ce n'est pas un choix de la personne,
 * c'est la langue d'interface REPORTÉE par le client
 * (`useNotificationPreferences`) — l'exposer laisserait croire qu'on peut le
 * changer ici, et le clic n'aurait aucun effet durable (le rapport écraserait
 * la valeur au prochain chargement de l'écran).
 */
const NOTIFICATION_BOOL_FIELDS: { field: BoolPreferenceKey; label: string }[] = [
  { field: 'buy_signals', label: 'Alerte de signaux d’achat détectés' },
  { field: 'relance_reminders', label: 'Rappels de relance' },
  { field: 'weekly_summary', label: 'Résumé hebdomadaire' },
  { field: 'weekly_digest', label: 'Digest hebdomadaire de veille' },
  { field: 'credit_low', label: 'Alerte de solde de crédits bas' },
  { field: 'action_overdue', label: 'Digest quotidien des actions en retard' },
  { field: 'watchlist_daily_digest', label: 'Digest quotidien de veille' },
  { field: 'sidebar_changelog', label: 'Indicateur de nouveautés dans la barre latérale' },
  { field: 'newsletter_changelog', label: 'Newsletter des nouveautés' },
  { field: 'laura_enabled', label: 'Laura peut parler en premier' },
]

/** Bornes du plafond de messages proactifs (PDF 6 §7, D40) — un réglage vit à
 *  un seul endroit : ces bornes SONT celles de `notificationPreferencesSchema`
 *  (`z.number().int().min(1).max(5)`), recopiées ici faute d'export dédié. */
const PROACTIVITY_CAP_BOUNDS = { min: 1, max: 5 } as const

export function buildNotificationsOverviewFields(prefs: NotificationPreferences): SettingsOverviewField[] {
  const toggles: SettingsOverviewField[] = NOTIFICATION_BOOL_FIELDS.map(spec => ({
    field: spec.field,
    label: spec.label,
    type: 'bool',
    value: prefs[spec.field],
  }))
  return [
    ...toggles,
    {
      field: 'proactivity_cap',
      label: 'Plafond de messages proactifs par jour',
      type: 'int',
      value: prefs.proactivity_cap,
      min: PROACTIVITY_CAP_BOUNDS.min,
      max: PROACTIVITY_CAP_BOUNDS.max,
    },
  ]
}

/** Libellés des quatre étapes RÉGLABLES (`won` n'a pas de durée cible — voir
 *  {@link buildPipelineOverviewFields}, qui l'exclut par construction). */
const PIPELINE_STAGE_LABELS: Partial<Record<PipelineStage, string>> = {
  qualified: 'Qualification',
  confirmed: 'Besoin confirmé',
  profiles_submitted: 'Profils envoyés',
  negotiation: 'Négociation',
}

/**
 * Les étapes du pipe qui ont une durée cible à régler. `won` en est exclu par
 * CONSTRUCTION — via `slaDays !== null`, pas via une liste de stades recopiée —
 * parce que c'est `effectiveStageSla` (contracts) qui décide déjà que « gagnée »
 * n'a pas de durée cible. Un réglage vit à un seul endroit (GA-26).
 */
export function buildPipelineOverviewFields(rows: readonly PipelineStageSlaRow[]): SettingsOverviewField[] {
  return rows
    .filter((row): row is PipelineStageSlaRow & { slaDays: number } => row.slaDays !== null)
    .map(row => ({
      field: row.stage,
      label: PIPELINE_STAGE_LABELS[row.stage] ?? row.stage,
      type: 'int',
      value: row.slaDays,
      min: DEAL_STAGE_SLA_BOUNDS.min,
      max: DEAL_STAGE_SLA_BOUNDS.max,
    }))
}
