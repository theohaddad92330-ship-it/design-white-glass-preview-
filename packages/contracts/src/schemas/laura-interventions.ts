import { z } from 'zod'
import { ACCOUNT_CONTEXT_SCREEN } from './laura-account-context.js'
import { isRefusal } from './interruption-budget.js'

/**
 * LES INTERVENTIONS PROACTIVES DE LAURA PRODUIT — §5.4 du PDF 10, puis §5.2 du PDF 2.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CATALOGUE VIT DANS LE CODE
 * ─────────────────────────────────────────────────────────────────────────
 * Comme `workflow-catalog.ts` et `routine-catalog.ts` avant lui, et pour la même
 * raison : une intervention éditable en base serait un chemin d'écriture non
 * gouverné vers l'attention de l'utilisateur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES QUE CE FICHIER FAIT TENIR
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **`condition` est une PHRASE, pas du code.** Ce qui déclenche vraiment vit
 *    dans le service qui sait lire la base ; ici on écrit ce que l'intervention
 *    prétend détecter, pour que quelqu'un puisse le contredire en le lisant.
 *    C'est la leçon des douze attributs de routine du PDF 6 : un catalogue qui
 *    ne porte que des clés ne se relit pas.
 * 2. **Chaque intervention nomme son ÉCRAN.** Le §5.3 en autorise une par
 *    écran ; sans ce champ, la règle n'aurait rien à comparer.
 * 3. **`route` désigne un écran qui EXISTE.** Une intervention qui ouvrirait un
 *    écran absent est le « livré mais jamais appelé » que le dépôt corrige
 *    depuis six chantiers — d'où la garde qui vérifie chaque route.
 *
 * ⚠️ **Laura Produit n'écrit JAMAIS** (D48). Elle guide et pré-remplit ;
 * l'exécution passe par l'Action OS, qui porte les approbations et les
 * réservations de crédits. Aucune entrée ne contient de verbe d'écriture, et un
 * test le vérifie.
 */

/** Les quatre familles du §5.4. */
export const INTERVENTION_FAMILIES = ['onboarding', 'adoption', 'churn_risk', 'business_value'] as const
export const interventionFamilySchema = z.enum(INTERVENTION_FAMILIES)
export type InterventionFamily = (typeof INTERVENTION_FAMILIES)[number]

/**
 * LES FORMATS — la FORME que l'intervention demande, et qu'un rendu applique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ILS SONT TROIS ET NON CINQ (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §5.5 en énumère cinq — `bubble`, `card`, `panel`, `launcher_dot`, `none`.
 * Deux d'entre eux ne désignaient rien :
 *
 *  · **`launcher_dot`** — la pastille sur la barre de commande. La barre de
 *    commande n'existe pas (`⌘K` NAVIGUE vers `/chat`, il n'ouvre aucune
 *    modale), donc la pastille non plus.
 *  · **`none`** — « se taire ». Le format le plus important du document, et
 *    celui qu'aucune ligne ne peut porter : quand Laura n'a rien à dire, le
 *    service rend `{ speaks: false }` et **n'écrit AUCUNE trace**
 *    (`laura.service.ts`, le `return` précède le `save`). Une valeur qui ne
 *    peut par construction jamais être écrite ne compte rien. Le silence reste
 *    une décision de produit — il est dit en toutes lettres à l'écran de
 *    réglages (`catalogue.silenceMatters`) — mais ce n'est pas une valeur de
 *    colonne.
 *
 * Aucune des deux n'était portée par une seule des 35 interventions, donc
 * aucune n'a jamais été écrite en base. Les retirer est un retrait de QUEUE :
 * l'ordre des trois qui restent ne bouge pas, et rien ne s'insère au milieu.
 *
 * ⚠️ **La contrainte SQL `laura_interventions_format_check` garde ses cinq
 * valeurs, volontairement.** GA-11 interdit à une contrainte de RÉTRÉCIR, et
 * GA-12 ne vérifie que le sens qui compte : la contrainte doit COUVRIR
 * l'énumération. Une contrainte plus large que le TypeScript est sans danger ;
 * la rétrécir pour « faire propre » casserait des lignes historiques et
 * rendrait un retour en arrière impossible.
 *
 * ⚠️ **Un format qui n'a pas de rendu est un levier qui n'existe pas.** C'est
 * la leçon de `MAX_PER_SCREEN` (voir `interruption-budget.ts`) : un réglage
 * qu'on peut changer sans que rien ne bouge est pire qu'un réglage absent. Les
 * trois qui restent sont appliqués par `presentationFor`
 * (`apps/web/src/features/laura/presentation.ts`) — et l'écran de réglages
 * annonce à l'utilisateur, format par format, la forme qu'il recevra.
 */
export const INTERVENTION_FORMATS = ['bubble', 'card', 'panel'] as const
export const interventionFormatSchema = z.enum(INTERVENTION_FORMATS)
export type InterventionFormat = (typeof INTERVENTION_FORMATS)[number]

export const interventionDefinitionSchema = z.object({
  key: z.string().min(1),
  family: interventionFamilySchema,
  /** Ce que l'intervention prétend détecter, en français. */
  condition: z.string().min(10),
  /** Le geste proposé, côté utilisateur. Jamais un verbe d'écriture. */
  action: z.string().min(3),
  /** L'écran où elle se pose — la clé de la règle « une par écran » du §5.3. */
  screen: z.string().min(1),
  /** Où mène le geste. `null` = l'intervention informe et ne mène nulle part. */
  route: z.string().nullable(),
  format: interventionFormatSchema,
  /** Les trois facteurs de priorité du PDF 6 §7, chacun sur 0-10. Le PRODUIT
   *  décide : un facteur à zéro suffit à ne pas déranger. */
  impact: z.number().int().min(0).max(10),
  urgency: z.number().int().min(0).max(10),
  actionability: z.number().int().min(0).max(10),
  /**
   * #2875 (décision Louis 11/10/2026, « pas de budget, fais ce que tu veux ») —
   * RAPPEL D'HYGIÈNE : un compte rendu qui aurait dû suivre un événement PASSÉ
   * manque (débrief d'appel, retour d'expérience de mission). Il ne consomme
   * PAS le budget d'interruption partagé (plafond du jour, une par écran,
   * vingt minutes) et n'en est pas bloqué. Son garde-fou propre est le
   * cooldown par clé de `LauraService` (24 h : une fois par jour et par sujet) ;
   * la volonté de la personne (coupée, en retrait, occupée) le fait taire
   * comme les autres. Absent = intervention ordinaire, dans le budget.
   * La SEULE déclaration (GA-26) : lire via {@link isHygieneReminder}.
   */
  hygiene: z.boolean().optional(),
})
export type InterventionDefinition = z.infer<typeof interventionDefinitionSchema>

/**
 * #2409.8 — la clé de l'annonce d'un démarrage incomplet : la seule à laquelle
 * le serveur attache les manques NOMMÉS de la mission (`MissionStartAnnouncement`).
 */
export const MISSION_START_NOT_READY_KEY = 'mission_start_not_ready'

/**
 * #3398.4a (recette salle démo 03/10) — la clé de la relance en retard : la seule
 * à laquelle le serveur attache la relance NOMMÉE (`OverdueFollowUp`). Sans elle,
 * la bulle disait « des relances ont dépassé leur échéance » sans dire laquelle.
 */
/**
 * #3398.1 / #3398.4 — au-delà de ce nombre de comptes ACTIFS dans SON
 * portefeuille, une personne ne travaille plus sérieusement chaque compte. Un
 * seul endroit (GA-26) ; tranché sans Louis : cinquante.
 */
export const PORTFOLIO_TOO_WIDE_ACCOUNTS = 50

export const FOLLOW_UP_OVERDUE_KEY = 'follow_up_overdue'

/**
 * #3398.4a — la relance la plus en retard : son titre (saisi par la personne),
 * son compte, ses jours de retard, et combien d'AUTRES attendent. Le RÉSULTAT,
 * jamais une phrase : l'écran compose dans la langue active (même règle que
 * `benchCost`). `accountName` est `null` quand le compte n'est pas lisible —
 * jamais un nom deviné.
 */
export interface OverdueFollowUp {
  title: string
  accountName: string | null
  daysOverdue: number
  others: number
}

/**
 * Les interventions, dans l'ordre du §5.4 — puis celles que le back-office rend
 * possibles (§5.2 du PDF 2), ajoutées EN FIN.
 *
 * Les priorités ne sont pas décoratives : elles sont ce que `messagePriority`
 * multiplie, et c'est ce produit qui décide de ce qui interrompt. `actionability`
 * à 0 met la priorité à 0 — « rien à en faire » suffit à se taire, même sur un
 * sujet grave. Aucune entrée n'y est donc à zéro : une intervention sur laquelle
 * l'utilisateur ne peut rien n'aurait pas sa place dans un catalogue.
 */
export const LAURA_INTERVENTIONS: readonly InterventionDefinition[] = [
  /* — Onboarding, les dix premiers jours (8) — */
  {
    key: 'first_login',
    family: 'onboarding',
    condition: "Première connexion de l'utilisateur sur cet espace.",
    action: 'Choisir un point de départ : analyser un compte, importer, ou explorer la démonstration.',
    screen: '/briefing',
    route: '/briefing',
    format: 'panel',
    impact: 8,
    urgency: 7,
    actionability: 10,
  },
  {
    key: 'esn_profile_incomplete',
    family: 'onboarding',
    condition: "Le profil ESN est incomplet deux jours après l'inscription.",
    action: 'Compléter le profil — sans lui, les messages produits sont génériques.',
    screen: '/settings/profile',
    route: '/settings/profile',
    format: 'card',
    impact: 9,
    urgency: 6,
    actionability: 9,
  },
  {
    key: 'no_connector',
    family: 'onboarding',
    condition: "Aucun connecteur branché deux jours après l'inscription.",
    action: 'Connecter un outil pour préparer les rendez-vous du matin.',
    screen: '/settings/integrations',
    route: '/settings/integrations',
    format: 'card',
    impact: 8,
    urgency: 5,
    actionability: 9,
  },
  {
    key: 'first_account_ready',
    family: 'onboarding',
    condition: 'Le premier compte analysé est prêt et son plan n’a jamais été ouvert.',
    action: "Ouvrir l'onglet Plan du dossier — c'est là que se lit quoi faire.",
    screen: '/accounts',
    route: '/accounts',
    format: 'bubble',
    impact: 8,
    urgency: 6,
    actionability: 10,
  },
  {
    key: 'no_action_validated',
    family: 'onboarding',
    condition: 'Aucune action validée trois jours après la première analyse.',
    action: 'Passer en revue les actions préparées, une par une.',
    screen: '/actions',
    route: '/actions',
    format: 'card',
    impact: 9,
    urgency: 6,
    actionability: 9,
  },
  {
    key: 'first_action_validated',
    family: 'onboarding',
    condition: 'La première action vient d’être validée.',
    action: 'Rien — on dit comment ça marche, et on se tait.',
    screen: '/actions',
    route: null,
    format: 'bubble',
    impact: 4,
    urgency: 3,
    actionability: 5,
  },
  {
    key: 'week_one_recap',
    family: 'onboarding',
    condition: 'Sept jours après l’inscription, au moins une action a été préparée.',
    action: 'Voir le détail de la semaine.',
    screen: '/briefing',
    route: '/briefing',
    format: 'card',
    impact: 6,
    urgency: 3,
    actionability: 7,
  },
  {
    key: 'empty_talent_pool',
    family: 'onboarding',
    condition: 'Le vivier est vide cinq jours après l’inscription.',
    action: 'Importer un fichier de consultants.',
    screen: '/consultants',
    route: '/consultants',
    format: 'card',
    impact: 8,
    urgency: 5,
    actionability: 8,
  },
  {
    // Métiers placés DÉDUITS (décision Louis 11/10/2026) : « Tout le contexte,
    // et sinon on pose la question. » Laura la pose quand rien n'est déclaré ET
    // que la déduction n'a trouvé aucun indice — jamais elle ne devine.
    key: 'placed_roles_unknown',
    family: 'onboarding',
    condition:
      'Aucun métier placé déclaré, et rien dans le contexte de l’espace (profil, offre, vivier, missions) ne permet de le déduire.',
    action: 'Dire quels métiers l’espace place — les signaux de recrutement les suivent.',
    screen: '/settings/profile',
    route: '/settings/profile',
    format: 'card',
    impact: 8,
    urgency: 5,
    actionability: 9,
  },

  /* — Adoption de fonctionnalité (7) — */
  {
    key: 'needs_without_matching',
    family: 'adoption',
    condition: 'Au moins trois besoins ouverts et aucune shortlist.',
    action: 'Lancer le matching sur le besoin le plus urgent.',
    screen: '/projects/needs',
    route: '/projects/needs',
    format: 'card',
    impact: 9,
    urgency: 7,
    actionability: 9,
  },
  {
    key: 'crm_not_connected',
    family: 'adoption',
    condition: 'Dix comptes analysés et aucun CRM connecté.',
    action: 'Connecter le CRM pour y écrire les tâches directement.',
    screen: '/settings/integrations',
    route: '/settings/integrations',
    format: 'card',
    impact: 7,
    urgency: 4,
    actionability: 9,
  },
  {
    key: 'no_routine_enabled',
    family: 'adoption',
    condition: 'Aucune routine activée quatorze jours après l’inscription.',
    action: 'Activer les trois routines qui couvrent l’essentiel.',
    screen: '/settings/routines',
    route: '/settings/routines',
    format: 'card',
    impact: 8,
    urgency: 4,
    actionability: 9,
  },
  {
    key: 'copilot_never_used',
    family: 'adoption',
    condition: 'Le copilote n’a jamais été sollicité dix jours après l’inscription.',
    action: 'Essayer une question déjà écrite.',
    screen: '/chat',
    route: '/chat/commandes',
    format: 'bubble',
    impact: 6,
    urgency: 3,
    actionability: 9,
  },
  {
    key: 'missions_without_timesheet',
    family: 'adoption',
    condition: 'Des missions sont saisies et aucun relevé d’activité ne l’est.',
    action: 'Voir comment les relevés se collectent.',
    screen: '/missions/cra',
    route: '/missions/cra',
    format: 'card',
    impact: 9,
    urgency: 7,
    actionability: 8,
  },
  {
    key: 'no_skills_dossier',
    family: 'adoption',
    condition: 'Des consultants existent et aucun dossier de compétences n’a été produit.',
    action: 'Générer un dossier depuis une fiche.',
    screen: '/consultants',
    route: '/consultants',
    format: 'bubble',
    impact: 7,
    urgency: 4,
    actionability: 9,
  },
  {
    key: 'plan_feature_never_opened',
    family: 'adoption',
    condition: 'Une fonctionnalité incluse au palier n’a jamais été ouverte en trente jours.',
    action: 'Ouvrir l’écran de pilotage.',
    screen: '/pilotage',
    route: '/pilotage',
    format: 'card',
    impact: 6,
    urgency: 2,
    actionability: 8,
  },

  /* — Risque de churn (8) — */
  {
    key: 'no_connection_7_days',
    family: 'churn_risk',
    // Écrit au RETOUR, et pas « pendant » l'absence : le geste proposé est
    // d'ouvrir le brief de reprise, qui n'a de sens qu'une fois la personne
    // revenue. La formulation d'origine décrivait un balayage qui n'existe pas
    // et que Laura ne fera jamais — elle ne parle que sur un écran ouvert.
    condition: 'Retour après plus de sept jours sans se connecter.',
    action: 'Ouvrir le brief de reprise — ce qui s’est passé pendant l’absence.',
    screen: '/briefing',
    route: '/briefing',
    format: 'panel',
    impact: 9,
    urgency: 8,
    actionability: 9,
  },
  {
    key: 'connector_error_48h',
    family: 'churn_risk',
    condition: 'Un connecteur est en erreur depuis plus de quarante-huit heures.',
    action: 'Réparer la connexion.',
    screen: '/settings/integrations',
    route: '/settings/integrations',
    format: 'card',
    impact: 10,
    urgency: 9,
    actionability: 10,
  },
  {
    key: 'credits_expiring',
    family: 'churn_risk',
    condition: 'Moins de 80 % des crédits du mois sont consommés et le cycle se termine.',
    action: 'Analyser des comptes avec ce qui reste.',
    screen: '/briefing',
    route: '/discover',
    format: 'card',
    impact: 7,
    urgency: 8,
    actionability: 9,
  },
  {
    key: 'notifications_all_off',
    family: 'churn_risk',
    condition: 'Toutes les notifications ont été désactivées.',
    action: 'Régler le plafond plutôt que de tout couper.',
    screen: '/settings/notifications',
    route: '/settings/notifications',
    format: 'card',
    impact: 8,
    urgency: 5,
    actionability: 10,
  },
  {
    key: 'high_correction_rate',
    family: 'churn_risk',
    condition: 'Un même champ est corrigé à la main de façon répétée.',
    // ⚠️ Mesuré en production le 10/09/2026 : cette phrase fuitait telle
    // quelle dans « Ce que tu as refusé » (`/settings/memory`, couche
    // `refusals`, qui relit `.action` — voir `memory.service.ts:ledgerRefusals`)
    // — c'était une note interne au développeur (« ce qu'il faut EXPLIQUER »),
    // pas une phrase écrite pour la personne qui la lit. Réécrite pour dire la
    // même chose, mot pour mot alignée sur la bulle RÉELLEMENT affichée
    // (`apps/web/src/i18n/locales/fr/laura.json:high_correction_rate`).
    action:
      'Une correction que tu fais à la main est définitive : elle n’est jamais écrasée, même par une donnée plus fraîche.',
    screen: '/accounts',
    route: null,
    format: 'bubble',
    impact: 6,
    urgency: 4,
    actionability: 5,
  },
  {
    key: 'single_active_seat',
    family: 'churn_risk',
    condition: 'Un seul utilisateur actif alors que plusieurs sièges sont payés.',
    action: 'Inviter l’équipe.',
    screen: '/settings/team',
    route: '/settings/team',
    format: 'card',
    impact: 9,
    urgency: 6,
    actionability: 9,
  },
  {
    key: 'no_action_14_days',
    family: 'churn_risk',
    condition: 'Aucune action validée depuis quatorze jours.',
    action: 'Dire ce qui ne va pas, pour ajuster ce qui est préparé.',
    screen: '/actions',
    route: '/actions',
    format: 'card',
    impact: 9,
    urgency: 7,
    actionability: 8,
  },
  {
    key: 'trial_ending',
    family: 'churn_risk',
    condition: 'La période d’essai se termine dans cinq jours ou moins.',
    action: 'En parler à quelqu’un avant de décider.',
    screen: '/billing',
    route: '/billing',
    format: 'card',
    impact: 10,
    urgency: 10,
    actionability: 8,
  },

  /* — Valeur métier (7) — */
  {
    key: 'mission_ending_no_plan',
    family: 'business_value',
    // Le seuil n'est PAS réécrit ici : il vit dans `INTERVENTION_THRESHOLDS`
    // (`renewalHorizonDays`), qui est ce que le balayeur d'interventions
    // applique déjà. Deux horizons pour le même fait — 45 jours ici, 30 là —
    // auraient produit deux vérités sur le même écran (GA-26).
    condition: 'Une mission arrive à échéance sans qu’aucun renouvellement soit ouvert sur le compte.',
    action: 'Préparer la demande de retour client.',
    screen: '/missions',
    route: '/missions',
    format: 'card',
    impact: 10,
    urgency: 9,
    actionability: 9,
  },
  {
    key: 'consultant_free_soon',
    family: 'business_value',
    // « Des besoins COMPATIBLES » supposerait un tour de matching par écran
    // ouvert — et surtout, un clic qui ne mène à rien quand rien ne
    // correspond. Ce qu'on sait dire sans rien inventer : il se libère, et il
    // reste des besoins ouverts à confronter. La compatibilité se lit sur
    // l'écran d'arrivée, qui la calcule pour de bon.
    condition: 'Un consultant se libère dans moins de 30 jours et au moins un besoin est encore ouvert.',
    action: 'Confronter son profil aux besoins ouverts.',
    screen: '/consultants',
    route: '/projects/needs',
    format: 'card',
    impact: 10,
    urgency: 8,
    actionability: 9,
  },
  {
    // #3398 — RECRUTEUR : « disponibilité périmée ». Le fait vient d'une saisie
    // humaine (`availability` + `availability_checked_at`) laissée vieillir
    // au-delà du seuil de revalidation du moteur de matching — un seul seuil.
    key: 'availability_stale',
    family: 'business_value',
    condition: 'Des disponibilités déclarées n’ont pas été revalidées depuis plus de 60 jours.',
    action: 'Les revalider dans le vivier.',
    screen: '/projects/needs',
    route: '/consultants',
    format: 'card',
    impact: 7,
    urgency: 6,
    actionability: 9,
  },
  {
    // #3398.1 — FONDATEUR : « dépendance à un client ». Part du CA quotidien des
    // affectations en cours (TJM saisi × charge) portée par le premier compte.
    key: 'client_dependency',
    family: 'business_value',
    condition: 'Un seul client porte plus d’un tiers du chiffre d’affaires quotidien des missions en cours.',
    action: 'Voir la répartition par compte.',
    screen: '/briefing',
    route: '/briefing',
    format: 'card',
    impact: 8,
    urgency: 5,
    actionability: 6,
  },
  {
    // #3398 — COMMERCIAL : « relance due ». Une tâche de compte encore ouverte
    // dont l'échéance saisie est passée.
    key: 'follow_up_overdue',
    family: 'business_value',
    condition: 'Des tâches de relance sur des comptes ont dépassé leur échéance.',
    action: 'Voir les actions en retard.',
    screen: '/actions',
    route: '/actions',
    format: 'card',
    impact: 8,
    urgency: 8,
    actionability: 9,
  },
  {
    // #3398 — COMMERCIAL : « information terrain non enregistrée ». Un appel
    // loggé À LA MAIN (l'intention de le consigner), récent, sans débrief —
    // ni fait, ni besoin, ni prochaine action. Vit seulement sur /chat :
    // aucun écran agrégé des appels n'existe pour l'y poser aussi.
    key: 'calls_without_debrief',
    family: 'business_value',
    // #2875 — rappel d'hygiène : hors budget d'interruption (voir `hygiene`).
    hygiene: true,
    condition: 'Des appels récents, consignés, n’ont aucun compte rendu.',
    action: 'Compléter le débrief de ces appels.',
    screen: '/chat',
    route: '/accounts',
    format: 'card',
    impact: 6,
    urgency: 5,
    actionability: 8,
  },
  {
    // #2875/#3398 (BM) — « entretien à préparer ». Un entretien PLANIFIÉ,
    // proche, dont le brief n'a jamais été ouvert — vit seulement sur /chat,
    // comme son voisin `calls_without_debrief`.
    key: 'interview_brief_not_consulted',
    family: 'business_value',
    condition: 'Un entretien approche et son brief n’a pas encore été ouvert.',
    action: 'Ouvrir le brief d’entretien.',
    screen: '/chat',
    route: '/consultants',
    format: 'card',
    impact: 6,
    urgency: 7,
    actionability: 9,
  },
  {
    // #2875/#3398 (forecast fondateur) — des missions dont le revenu est
    // DÉCLARÉ en difficulté (renouvellement bloqué, mission à risque) : le fait
    // que le scénario bas du prévisionnel retire déjà. Un compte, jamais un
    // montant pondéré ni une probabilité. Vit sur /chat comme ses voisines.
    key: 'forecast_revenue_declared_blocked',
    family: 'business_value',
    condition: 'Des missions en cours ont un renouvellement bloqué ou sont à risque.',
    action: 'Ouvrir le prévisionnel.',
    screen: '/chat',
    route: '/pilotage',
    format: 'card',
    impact: 8,
    urgency: 6,
    actionability: 8,
  },
  {
    // #3398.2 — DIRECTEUR / MANAGER : « comptes sans responsable ». Un compte
    // actif sans `assigned_to`, dans un espace qui compte au moins deux sièges
    // (seul à bord, tout est à soi : aucune bulle).
    key: 'accounts_without_owner',
    family: 'business_value',
    condition: 'Des comptes actifs n’ont aucun responsable.',
    action: 'Attribuer les comptes libres.',
    screen: '/pilotage',
    route: '/accounts',
    format: 'card',
    impact: 8,
    urgency: 6,
    actionability: 9,
  },
  {
    // #3398.2 — DIRECTEUR / MANAGER : « collisions ». Un compte sur lequel au
    // moins deux personnes ont agi — la définition de la file d'arbitrage du
    // cockpit manager (`duplicateCoverage`), jamais une seconde.
    key: 'account_collisions',
    family: 'business_value',
    condition: 'Des comptes sont travaillés par au moins deux personnes à la fois.',
    action: 'Désigner qui porte la prochaine action.',
    screen: '/pilotage',
    route: '/team',
    format: 'card',
    impact: 7,
    urgency: 6,
    actionability: 8,
  },
  {
    // #3398.1 / #3398.4 — FONDATEUR « comptes trop nombreux », COMMERCIAL « liste
    // trop large ». Le portefeuille PERSONNEL actif dépasse `PORTFOLIO_TOO_WIDE_ACCOUNTS`.
    key: 'portfolio_too_wide',
    family: 'business_value',
    condition: 'Ton portefeuille actif compte plus de comptes qu’on n’en travaille sérieusement.',
    action: 'Choisir les comptes à travailler en priorité.',
    screen: '/actions',
    route: '/accounts',
    format: 'card',
    impact: 6,
    urgency: 5,
    actionability: 8,
  },
  {
    // #3398.5 — RECRUTEUR : « consultant à requalifier ». Une fiche dont la
    // disponibilité n'a JAMAIS été déclarée (`inconnu`) : tant que personne ne l'a
    // dite, elle n'est ni libre ni occupée — elle est à qualifier.
    key: 'consultant_to_requalify',
    family: 'business_value',
    condition: 'Des fiches du vivier n’ont aucune disponibilité déclarée.',
    action: 'Qualifier les fiches du vivier.',
    screen: '/projects/needs',
    route: '/consultants',
    format: 'card',
    impact: 6,
    urgency: 5,
    actionability: 9,
  },
  {
    key: 'accounts_without_next_action',
    family: 'business_value',
    condition: 'Plusieurs comptes suivis n’ont aucune prochaine action prévue.',
    action: 'Voir la liste.',
    screen: '/accounts',
    route: '/accounts',
    format: 'card',
    impact: 8,
    urgency: 5,
    actionability: 9,
  },
  {
    key: 'margin_not_measured',
    family: 'business_value',
    condition: 'Le coût chargé n’est saisi sur aucune mission active.',
    action: 'Saisir les coûts — sans eux, la marge n’est pas calculable.',
    screen: '/missions/facturation',
    route: '/missions/facturation',
    format: 'card',
    impact: 8,
    urgency: 4,
    actionability: 8,
  },
  {
    key: 'mission_ended_without_feedback',
    family: 'business_value',
    // #2875 — même type que le débrief manquant : le retour d'expérience qui
    // aurait dû suivre la fin de mission. Hors budget (voir `hygiene`).
    hygiene: true,
    condition: 'Une mission s’est terminée il y a plus de deux semaines sans retour d’expérience.',
    action: 'Demander le retour — une référence perdue ne se rattrape pas.',
    screen: '/accounts',
    route: '/accounts',
    format: 'card',
    impact: 8,
    urgency: 6,
    actionability: 8,
  },
  {
    key: 'rfp_deadline_gaps',
    family: 'business_value',
    condition: 'Un appel d’offres arrive à échéance sous trois jours avec des exigences non couvertes.',
    action: 'Ouvrir le dossier et voir ce qui manque.',
    screen: '/rfp',
    route: '/rfp',
    format: 'panel',
    impact: 10,
    urgency: 10,
    actionability: 9,
  },
  {
    key: 'long_bench',
    family: 'business_value',
    condition: 'Un consultant est en intercontrat depuis plus de 30 jours.',
    action: 'Chercher des besoins compatibles.',
    screen: '/consultants',
    route: '/projects/needs',
    format: 'card',
    impact: 10,
    urgency: 8,
    actionability: 9,
  },

  /* — Ce que le back-office rend possible (PDF 2 §5.2) — */
  {
    // AJOUTÉE EN FIN, comme les suivantes : un enum ne perd jamais de valeur et
    // n'en insère jamais au milieu (GA-08). L'ordre du catalogue est ce que la
    // trace `laura_interventions.intervention_key` relit.
    //
    // ⚠️ Elle N'EST PAS le doublon de `needs_without_matching`, qui vit sur le
    // même écran. Celle-là est une intervention d'ADOPTION — « tu n'as jamais
    // composé de sélection » — et le budget d'adoption l'écarte sur un espace
    // sain. Celle-ci parle d'un besoin PRÉCIS qui traîne, sur un espace qui se
    // sert du produit tous les jours : c'est un fait métier, il passe toujours.
    //
    // Le §5.2 promet aussi « ton vivier a 4 profils au-dessus du seuil ». On ne
    // le promet pas : ce serait un tour de rapprochement par écran ouvert, et
    // c'est l'arbitrage déjà rendu pour `consultant_free_soon`. Le nombre de
    // profils se lit sur l'écran d'arrivée, qui le calcule pour de bon.
    key: 'need_open_without_shortlist',
    family: 'business_value',
    condition: 'Un besoin est ouvert depuis plus de cinq jours et aucun profil n’y a été positionné.',
    action: 'Ouvrir le besoin et lui chercher des profils.',
    screen: '/projects/needs',
    route: '/projects/needs',
    format: 'card',
    impact: 9,
    urgency: 7,
    actionability: 9,
  },
  {
    // « Sans lui, 8 400 € ne peuvent pas partir en facture. » Le montant N'EST
    // PAS promis ici : il dépend du TJM et des jours attendus, que la bulle ne
    // lit pas. Ce qu'on affirme est ce que la donnée dit — le relevé n'est pas
    // arrivé, deux relances sont parties — et le chiffre se lit sur l'écran
    // d'arrivée, qui le calcule pour de bon.
    key: 'timesheet_missing_after_reminders',
    family: 'business_value',
    condition: 'Un relevé d’activité attendu n’est pas arrivé, et deux relances sont déjà parties.',
    action: 'Ouvrir le relevé et décider de la suite.',
    screen: '/missions/cra',
    route: '/missions/cra',
    format: 'card',
    impact: 9,
    urgency: 8,
    actionability: 8,
  },
  {
    // Le §5.2 ajoute « ce client a déjà eu 2 retards cette année ». Ce n'est PAS
    // promis ici : compter les retards passés d'un client demande un historique
    // par compte que la détection ne lit pas, et l'annoncer sans le lire ferait
    // exactement le chiffre inventé que le dépôt refuse. Ce qu'on affirme est ce
    // que la donnée dit : cette facture-là est en retard.
    key: 'payment_overdue_30_days',
    family: 'business_value',
    condition: 'Une facture émise a plus de trente jours de retard sur son échéance et rien n’a été encaissé.',
    action: 'Ouvrir le suivi des encaissements.',
    screen: '/missions/facturation',
    route: '/missions/facturation',
    format: 'card',
    impact: 10,
    urgency: 9,
    actionability: 8,
  },
  {
    // « Ton pipe couvre 6 semaines. En dessous de 8, tu passes en tension. »
    // Ce que le dépôt sait mesurer est la DISTANCE à la clôture espérée la plus
    // lointaine — la date que le commercial SAISIT, jamais déduite d'un cycle
    // moyen. Une couverture en semaines de charge supposerait un rythme de
    // consommation que rien ne modélise ici, et l'inventer produirait un chiffre
    // que personne ne pourrait vérifier.
    key: 'pipeline_runs_dry',
    family: 'business_value',
    condition: 'Aucune affaire en jeu n’est attendue au-delà de deux mois : le pipe se vide avant.',
    action: 'Ouvrir le pipe et regarder ce qu’il reste à ouvrir.',
    screen: '/projects',
    route: '/projects',
    format: 'card',
    impact: 9,
    urgency: 7,
    actionability: 7,
  },
  {
    // Elle se pose sur `/accounts` et non sur `/consultants`, et ce n'est pas un
    // détail : le §5.2 dit « c'est une porte pour une mission plus large », donc
    // le geste porte sur le COMPTE. La poser côté vivier aurait aussi fait la
    // sixième mesure de cet écran, au-delà du plafond que la détection s'impose.
    key: 'consultant_repeat_placement',
    family: 'business_value',
    condition: 'Un consultant a démarré au moins trois missions chez le même client.',
    action: 'Ouvrir le compte — trois fois la même personne, c’est une porte.',
    screen: '/accounts',
    route: '/accounts',
    format: 'card',
    impact: 9,
    urgency: 5,
    actionability: 8,
  },

  /* — Le DOSSIER de compte ouvert (maquette SOL6 n°6) — */
  {
    // AJOUTÉE EN FIN, comme toutes les précédentes (GA-08).
    //
    // ⚠️ **La première intervention du catalogue dont l'écran est un MOTIF.**
    // Un dossier vit sur `/accounts/<identifiant>` : aucune valeur littérale ne
    // peut le désigner, et poser `screen: '/accounts'` l'aurait fait apparaître
    // sur la LISTE, où le compte dont elle parle n'est pas ouvert. Le motif est
    // `ACCOUNT_CONTEXT_SCREEN` (`laura-account-context.ts`) et il n'est comparé
    // qu'à un seul endroit, `matchesScreen`.
    //
    // ⚠️ **`route: null`, et ce n'est pas un oubli.** Une route de catalogue est
    // STATIQUE ; le geste, lui, porte sur le dossier que le commercial a sous
    // les yeux. Écrire `/accounts` ici l'aurait ramené à la liste qu'il venait
    // de quitter. Le panneau contextuel navigue lui-même vers l'onglet Plan du
    // compte ouvert, APRÈS avoir enregistré la réaction par la porte unique.
    //
    // ⚠️ **`format: 'panel'`.** Le budget de texte d'un panneau est libre
    // (`presentation.ts`), ce qui est le bon état ici : le message affiché n'est
    // pas la phrase du catalogue mais une phrase COMPOSÉE à partir des faits que
    // le serveur rapporte (`AccountSuggestion`). La phrase ci-dessous reste ce
    // que le catalogue promet, et c'est elle que l'écran de réglages annonce.
    //
    // ⚠️ **Elle N'EST PAS le doublon de `consultant_free_soon` ni de
    // `long_bench`**, qui parlent du VIVIER — « quelqu'un se libère, va voir les
    // besoins ». Celle-ci part du COMPTE : un signal de recrutement lu dans le
    // dossier ouvert, et une ressource à mettre en face. C'est le croisement qui
    // est neuf, pas chacune de ses moitiés.
    key: 'account_hiring_with_available_bench',
    family: 'business_value',
    condition:
      'Le dossier ouvert porte un signal de recrutement encore d’actualité, et au moins un consultant du vivier est déclaré disponible immédiatement.',
    action: 'Préparer l’angle et le contact cible sur ce compte.',
    screen: ACCOUNT_CONTEXT_SCREEN,
    route: null,
    format: 'panel',
    impact: 9,
    urgency: 7,
    actionability: 9,
  },

  /* — L'INCOHÉRENCE : deux faits saisis qui ne peuvent pas être vrais ensemble (#1937.4) — */
  {
    // AJOUTÉE EN FIN, comme toutes les précédentes (GA-08).
    //
    // ⚠️ **La première intervention du catalogue qui ne signale pas un MANQUE.**
    // Les trente-six autres disent « il n'y a rien », « il n'y a plus », « il
    // n'y a pas encore ». Celle-ci dit « il y a DEUX choses, et elles se
    // contredisent » : une mission que l'ESN déclare en cours, et une date de
    // fin que la même ESN a saisie dans le passé. Aucune des deux n'est
    // devinée, aucune n'est déduite — ce sont deux colonnes de la même ligne.
    //
    // ⚠️ **C'est une CONSTATATION, jamais une probabilité** (doctrine : aucune
    // probabilité ne s'affiche). Laura ne dit pas « cette mission a sans doute
    // fini », elle dit « ces deux faits ne tiennent pas ensemble » — et elle ne
    // tranche pas : prolonger ou clore est une décision qui appartient à
    // l'humain, et le catalogue ne porte aucun verbe d'écriture (D48).
    //
    // ⚠️ **Sa PROVENANCE est la date elle-même.** Une incohérence signalée sans
    // sa source serait un reproche invérifiable ; ici la source est la ligne de
    // mission, et la date est celle que l'écran affiche déjà. C'est pourquoi
    // elle se pose sur `/missions` (ex-`/missions/board`) et nulle part ailleurs : le fait dont
    // elle parle est sous les yeux de qui la lit.
    //
    // ⚠️ **Une mission SANS date de fin n'est pas concernée** — « on ne sait pas
    // quand ça finit » ne contredit rien. Non mesuré n'est pas mesuré à zéro,
    // et une échéance absente n'est pas une échéance dépassée.
    key: 'mission_active_past_end_date',
    family: 'business_value',
    condition:
      'Une mission déclarée en cours porte une date de fin déjà passée : deux faits saisis qui ne peuvent pas être vrais ensemble.',
    action: 'Ouvrir le tableau des missions et trancher : prolonger l’échéance, ou clore la mission.',
    screen: '/missions',
    route: '/missions',
    format: 'card',
    impact: 8,
    urgency: 7,
    actionability: 9,
  },

  /* — Le DÉMARRAGE d'une mission (#2409.8 / #2409.9) — */
  {
    // AJOUTÉE EN FIN (GA-08). #2409.8 — Laura nomme D'ELLE-MÊME ce qui manque
    // avant le démarrage. Tranché sans Louis (décision §12, reco appliquée) :
    // on RÉUTILISE ce catalogue et son détecteur, pas un second mécanisme
    // d'annonce (GA-26) ; l'outil réactif `get_mission_start_readiness` reste
    // la réponse quand on lui POSE la question. Le jugement « prête ou pas »
    // est celui de `computeMissionStartReadiness` — jamais recalculé ailleurs.
    // Fenêtre : quatorze jours avant la date de début SAISIE ; une mission sans
    // date n'est pas comptée ici (le panneau la dit « incomplète »).
    key: MISSION_START_NOT_READY_KEY,
    family: 'business_value',
    condition:
      'Une mission démarre dans les quatorze jours et sa checklist de démarrage n’est pas complète : un prérequis bloquant ou une réserve manque encore.',
    action: 'Ouvrir la mission et voir ce qui manque avant son démarrage.',
    screen: '/missions',
    route: '/missions',
    format: 'card',
    impact: 8,
    urgency: 7,
    actionability: 9,
  },
  {
    // AJOUTÉE EN FIN (GA-08). #2409.9 — confirmer l'arrivée du jour 1 SANS
    // harceler : Laura le dit une fois, sur le tableau des missions, pendant
    // trois jours à partir de la date de début (J0 à J+2) et plus jamais après.
    // Elle ne contacte PERSONNE : ni le consultant, ni le client — c'est le
    // commercial qui confirme (passage au statut « en cours »), et le budget
    // d'interruption (`interruption-budget.ts`) borne la répétition.
    key: 'mission_day_one_unconfirmed',
    family: 'business_value',
    condition:
      'La date de début d’une mission est arrivée depuis moins de trois jours et elle n’est toujours pas passée « en cours » : l’arrivée du consultant n’est pas confirmée.',
    action: 'Ouvrir la mission et confirmer l’arrivée du consultant.',
    screen: '/missions',
    route: '/missions',
    format: 'card',
    impact: 8,
    urgency: 9,
    actionability: 9,
  },
  {
    // AJOUTÉE EN FIN (GA-08). #3939.3 (décision Louis 13/10) — Laura intervient
    // d'elle-même sur le DOSSIER ouvert au-delà du seul recrutement : une
    // hypothèse de douleur qualifiée fondée sur un signal DATÉ du compte
    // (`accountPainFacts`). Même écran-motif, même `route: null`, même panneau
    // que `account_hiring_with_available_bench` — et même budget : aucune
    // dérogation, le plafond du jour décide. Aucune probabilité, aucune source
    // nommée ; sans hypothèse fondée et datée, elle n'existe pas (jamais une
    // carte vide). Elle PROPOSE de préparer l'angle, elle n'écrit rien.
    key: 'account_pain_with_dated_signal',
    family: 'business_value',
    condition:
      'Le dossier ouvert porte une hypothèse de douleur qualifiée, fondée sur au moins un signal daté et encore d’actualité.',
    action: 'Préparer l’angle qui répond à cette douleur sur ce compte.',
    screen: ACCOUNT_CONTEXT_SCREEN,
    route: null,
    format: 'panel',
    impact: 8,
    urgency: 6,
    actionability: 8,
  },
]

/** Retrouve une intervention par sa clé, ou `null`. Jamais d'exception : une
 *  clé inconnue vient d'une trace ancienne, pas d'un bug à faire remonter. */
/** #2875 — cette clé est-elle un rappel d'hygiène (hors budget d'interruption) ? Clé inconnue = non. */
export function isHygieneReminder(key: string | null | undefined): boolean {
  return Boolean(key && findIntervention(key)?.hygiene)
}

export function findIntervention(key: string): InterventionDefinition | null {
  return LAURA_INTERVENTIONS.find(intervention => intervention.key === key) ?? null
}

/* ------------------------------------------------------------------ */
/*  LE COMPTEUR D'ACCEPTATION PAR SURFACE — D643 à D648                */
/* ------------------------------------------------------------------ */

/**
 * LE MANQUE : rien ne compte, aujourd'hui, ce qui est ACCEPTÉ de Laura.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D643 — ON NE POSE PAS UNE SECONDE TABLE DE CAPTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le geste existe déjà : `LauraController.react` → `LauraService.react` écrit
 * la réaction de l'utilisateur sur `laura_interventions.reaction`, qui porte
 * déjà les quatre faits que ce compteur a besoin de lire — l'espace
 * (`workspace_id`), la clé de surface (`intervention_key`), l'issue
 * (`reaction`) et sa date (`created_at`). Poser une seconde table à côté
 * dupliquerait un chemin d'écriture déjà gouverné et déjà testé
 * (`laura.service.spec.ts`) pour le même fait, observé deux fois. Ce fichier ne
 * fait donc que la moitié qui manquait réellement : la LECTURE agrégée. La
 * requête qui la fabrique vit dans `LauraAcceptanceService`
 * (`apps/api/src/modules/laura/laura-acceptance.service.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D644 — L'ISSUE EST BINAIRE, ET LE SILENCE N'EN EST PAS UNE
 * ─────────────────────────────────────────────────────────────────────────────
 * `InterventionReaction` porte QUATRE valeurs parce que le §5.3 distingue
 * « pas répondu » de « fermé sans lire » — deux mécaniques de retrait
 * différentes. Ce compteur-ci ne pose qu'UNE question : « la proposition a-t-elle
 * été SUIVIE ? ». `acted` → acceptée. `refused` (« pas maintenant ») et
 * `closed_unread` (fermé sans lire) sont deux gestes RÉELS qui disent tous les
 * deux « pas ça ». `null` (rien encore) et `ignored` (jamais ÉCRIT par un
 * geste — c'est une INFÉRENCE de `LauraService.streak` à la lecture, après 24h
 * sans réaction, jamais une valeur de colonne) sortent tous les deux du
 * dénominateur : « non mesuré » n'est jamais un rejet, exactement comme
 * « non mesuré » n'est jamais un zéro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D648 — CE FICHIER MESURE, IL NE DÉCIDE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La source demande un seuil à 15 % pour retirer une surface qui n'interrompt
 * plus personne utilement. {@link SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT}
 * porte ce chiffre pour qu'une décision future ait un nombre à comparer — et
 * RIEN dans ce module ne le LIT pour filtrer, masquer ou désactiver une
 * intervention. Retirer une surface du catalogue est une décision produit que
 * seul Louis peut prendre, et il ne peut la prendre qu'une fois le chiffre
 * visible — pas avant.
 */

/**
 * Les deux issues qui comptent pour le taux d'acceptation — jamais les quatre
 * de `InterventionReaction` (`interruption-budget.ts`). Voir D644.
 *
 * Pas de tableau `as const` exporté à côté : rien dans ce dépôt ne valide une
 * valeur libre contre cette liste (contrairement à `INTERVENTION_FAMILIES`,
 * consommée par un schéma zod) — un export inutilisé serait la dette que
 * `pnpm lint:exports:types` interdit.
 */
export type SurfaceAcceptanceOutcome = 'accepted' | 'dismissed'

/**
 * La réaction persistée (`laura_interventions.reaction`, une colonne texte
 * libre — voir `LauraInterventionEntity`) → l'issue qui compte pour le taux.
 *
 * `null` en sortie : aucun geste exploitable. Ni `null` (rien encore) ni
 * `'ignored'` (jamais écrit par un geste, voir D644 plus haut) ne comptent
 * comme un rejet — les confondre ferait retirer une surface que personne n'a
 * encore eu le temps de refuser.
 */
export function surfaceAcceptanceOutcome(reaction: string | null): SurfaceAcceptanceOutcome | null {
  if (reaction === 'acted') return 'accepted'
  // #2403.33 — `refused_stale_data` dit « pas ça » exactement comme `refused` : {@link isRefusal}.
  if (isRefusal(reaction) || reaction === 'closed_unread') return 'dismissed'
  return null
}

/**
 * Le taux d'acceptation d'UNE surface, sur les issues que l'appelant a déjà
 * bornées à la fenêtre de 30 jours glissants (`LauraAcceptanceService`).
 *
 * Même forme que `AlertMeasure` (`observability-alerts.ts`) et pour la même
 * raison : « non mesuré » n'est JAMAIS un taux à 0 % — une surface qui n'a
 * jamais proposé n'a pas un taux de 0 %, elle N'A PAS de taux. `minSample` est
 * `OBSERVABILITY_ALERT_MIN_SAMPLE` (défaut 20, `observability-alerts.ts`) :
 * le dépôt a déjà ce motif d'échantillon minimum, il n'y en a pas de second.
 */
export type SurfaceAcceptanceMeasure =
  | { state: 'measured'; acceptedPercent: number; sample: number }
  | { state: 'unmeasured'; reason: 'no_observation' | 'sample_too_small'; sample: number }

export function computeSurfaceAcceptance(
  outcomes: readonly SurfaceAcceptanceOutcome[],
  minSample: number,
): SurfaceAcceptanceMeasure {
  if (outcomes.length === 0) return { state: 'unmeasured', reason: 'no_observation', sample: 0 }
  if (outcomes.length < minSample) {
    return { state: 'unmeasured', reason: 'sample_too_small', sample: outcomes.length }
  }
  const accepted = outcomes.filter(outcome => outcome === 'accepted').length
  return {
    state: 'measured',
    acceptedPercent: Math.round((accepted / outcomes.length) * 10000) / 100,
    sample: outcomes.length,
  }
}

/**
 * Le seuil que la source propose pour retirer une surface — 15 %.
 *
 * ⚠️ **NON appliqué.** Voir D648 ci-dessus : cette constante existe pour que
 * la décision produit future ait un nombre à comparer. Aucune ligne de ce
 * dépôt ne la lit pour filtrer, masquer ou désactiver une intervention — le
 * jour où Louis tranche, c'est ce fichier qui gagne un appelant, pas l'inverse.
 */
export const SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT = 15

/**
 * Les interventions d'une famille, dans l'ordre du catalogue — sert le budget
 * d'adoption du §5.6 et le regroupement du panneau « ce que Laura sait dire ».
 *
 * ⚠️ Le catalogue est un ARGUMENT, et c'est la seule chose intéressante de cette
 * fonction. L'écran affiche ce que la route `/laura/catalogue` lui a SERVI ; s'il
 * regroupait la constante empaquetée dans son bundle, le jour où le serveur
 * filtrera (par offre, par espace, par droit) il montrerait un catalogue que
 * l'utilisateur n'a pas reçu — deux vérités pour la même question. `useLaura.ts`
 * pose l'interdit noir sur blanc ; appeler ce helper sans lui passer le payload
 * le RÉGRESSERAIT au lieu de le servir. Le défaut sert les appelants qui n'ont
 * PAS de payload : les gardes, le serveur lui-même.
 *
 * Elle existe pour que ce filtre vive à UN seul endroit (GA-26) : il était
 * réécrit à la main dans `LauraCataloguePanel`, et deux chemins qui refont la
 * même dérivation divergent.
 */
export function interventionsOfFamily(
  family: InterventionFamily,
  catalogue: readonly InterventionDefinition[] = LAURA_INTERVENTIONS,
): readonly InterventionDefinition[] {
  return catalogue.filter(intervention => intervention.family === family)
}
