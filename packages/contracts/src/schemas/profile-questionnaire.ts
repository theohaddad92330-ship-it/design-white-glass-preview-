import { ACTIVITY_REFERENCE_PERIODS } from './onboarding/answers-mesures.js'
import { ESN_ANSWER_OPTIONS, TEMPS2_ANSWER_OPTIONS, type EsnAnswers } from './onboarding.js'
import type { WorkspaceRole } from './workspace.js'

/**
 * Le questionnaire de personnalisation progressif — restitution V2 §21-30.
 *
 * Le rapport remplace le « questionnaire 24h » par un profil commercial VIVANT :
 * 30 questions réparties en 6 blocs de 4 à 6, chacun annonçant ce qu'il
 * améliore, chacun passable, avec une logique conditionnelle qui évite les
 * questions inutiles.
 *
 * Ce module est le CATALOGUE et la LOGIQUE — pur, sans i18n ni React, donc
 * testable et partagé : l'app web le rend, l'API compte l'avancement, et le
 * mapping vers `profile_data` (analysis.ts) décide ce que les prompts lisent.
 *
 * Deux règles maison tenues ici :
 *
 * 1. **Les `value` sont persistées verbatim** dans `esn_profiles` et imprimées
 *    telles quelles dans les prompts français. Elles ne sont JAMAIS traduites —
 *    seuls les libellés d'écran passent par i18n (`profileQuestions.<key>.*`).
 * 2. **On ne demande rien qu'on ne lise.** Chaque clé ci-dessous a une colonne
 *    et un consommateur : soit `esnAnswersToProfileData` (donc les prompts),
 *    soit la logique de branchement elle-même (une réponse qui décide des
 *    questions suivantes est lue, par construction).
 */

/** Les 6 blocs du rapport, dans l'ordre. */
export const PROFILE_BLOCKS = ['role', 'company', 'offer', 'market', 'routine', 'maturity'] as const
export type ProfileBlock = (typeof PROFILE_BLOCKS)[number]

export type ProfileQuestionKind = 'single' | 'multi' | 'tags'

export type ProfileQuestion = {
  /** Clé de réponse = colonne `esn_profiles` = clé de `EsnAnswers`. */
  key: ProfileQuestionKey
  block: ProfileBlock
  kind: ProfileQuestionKind
  /** Valeurs fermées, persistées verbatim. Absent pour `tags` (saisie libre). */
  choices?: readonly string[]
  /** Une option « Autre » libre est proposée en plus des choix. */
  allowOther?: boolean
  /** Plafond de sélection pour `multi` / `tags`. */
  max?: number
  /**
   * Ne poser la question que si ce prédicat est vrai. Absent = toujours posée.
   * C'est ici que vit la logique conditionnelle du §28 — jamais dans l'écran,
   * pour qu'elle soit testable et que l'API compte le même total que l'UI.
   */
  when?: (answers: Partial<EsnAnswers>, context: ProfileQuestionContext) => boolean
  /**
   * #2031.10 — recalcule `choices` à partir du contexte : retire un choix déjà
   * déduit comme branché, SANS faire disparaître la question. Absent =
   * `choices` reste le catalogue statique. C'est la logique « champ par champ »
   * du §28 : un booléen global masquait les 14 choix de `tooling` dès qu'UN
   * seul outil était connecté (`profile-questionnaire.ts:412` avant ce lot).
   */
  resolveChoices?: (context: ProfileQuestionContext) => readonly string[]
  /**
   * #2031.3 — valeur(s) à PRÉ-COCHER quand rien n'est encore répondu, dérivées
   * du contexte (jamais écrites en dur ici). Distinct de `resolveChoices` :
   * celui-ci retire un CHOIX de la liste proposée, `prefillValue` propose une
   * RÉPONSE déjà cochée — modifiable, jamais imposée, et jamais utilisée si
   * `stored[key]` porte déjà une réponse (une correction humaine gagne
   * toujours). Absent = aucun préremplissage pour cette question.
   */
  prefillValue?: (context: ProfileQuestionContext) => readonly string[]
}

/**
 * Ce que l'app sait déjà par ailleurs et qui change les questions à poser.
 *
 * #2031.10 — remplace le booléen `hasConnectedTooling` : un CRM seul de
 * branché ne doit plus faire disparaître Outlook, l'agenda ou un outil de
 * séquence. La liste porte les NOMS des outils déduits comme branchés (le
 * vocabulaire du catalogue `tooling`, verbatim) — chaque choix se retire pour
 * lui-même, jamais en bloc.
 */
export type ProfileQuestionContext = {
  /**
   * Les outils que l'espace a déjà BRANCHÉS, par leur nom exact dans
   * `PROFILE_QUESTION_OPTIONS.tooling` — pas plus. ⚠️ Ces noms arrivent par
   * INJECTION depuis les connexions réelles de l'espace
   * ({@link toolingChoicesFromConnectedTools}, qui lit `connectedClientTools`
   * de `tool-naming.ts`) — jamais écrits en dur ici : un littéral promettrait
   * l'outil à qui ne l'a pas branché.
   */
  connectedToolNames: readonly string[]
  /**
   * #2031.3 — les fonctions de `role_functions_practiced` déductibles du rôle
   * avec lequel la personne a été INVITÉE dans l'espace (`workspace_members.role`,
   * lu par tout membre via `GET /workspaces/me` — {@link roleFunctionsPracticedFromWorkspaceRole}).
   * Vide par défaut : une source non lue ne prérempli rien (« non mesuré »
   * n'est jamais « 0 », GA-18/GA-19) — la question se pose alors entière.
   */
  invitedRoleFunctions: readonly string[]
}

/**
 * #2031.2 — pourquoi la BU (business unit / agence / territoire) n'a PAS de
 * champ ici. Décision Louis 15/09/2026 : la BU est un LIBELLÉ DÉCLARATIF (une
 * réponse de questionnaire + un filtre de lecture ailleurs dans le produit),
 * pas une partition — elle ne porte ni données propres ni cloisonnement.
 * Ce n'est donc PAS une source externe à LIRE avant de poser un bloc, comme
 * le sont `connectedToolNames`/`invitedRoleFunctions` ci-dessus : il n'y a
 * rien à « vérifier ». Un futur ajout d'un champ `businessUnit*` ici pour
 * imiter #2031.5–.8 reviendrait sur cette décision sans la retrancher.
 */
export const DEFAULT_QUESTION_CONTEXT: ProfileQuestionContext = { connectedToolNames: [], invitedRoleFunctions: [] }

/**
 * #2031.3 — ce que le RÔLE D'ESPACE (`WorkspaceRole`, invitation ou membership)
 * dit sans deviner sur `role_functions_practiced`.
 *
 * Correspondance ÉTROITE, à dessein : `sales` EST « Vente / prospection »,
 * `recruiter` EST « Recrutement / sourcing » — le nom du rôle porte la
 * fonction elle-même, ce n'est pas une inférence. Les autres rôles
 * (`tech_admin`, `finance`, `sales_ops`, `viewer`, `member`, `admin`, `owner`)
 * n'ont AUCUNE correspondance propre parmi les six options du catalogue :
 * un droit d'ACCÈS (ce qu'on peut cliquer) n'est pas une fonction EXERCÉE, et
 * les forcer l'une sur l'autre fabriquerait une donnée que personne n'a dite
 * (doctrine « jamais de donnée fictive » ; « un préremplissage deviné est pire
 * qu'une question de plus »). Ces rôles rendent `[]` : le champ reste vide,
 * la question se pose comme si aucune source n'était branchée.
 */
export function roleFunctionsPracticedFromWorkspaceRole(role: WorkspaceRole | null | undefined): string[] {
  switch (role) {
    case 'sales':
      return ['Vente / prospection']
    case 'recruiter':
      return ['Recrutement / sourcing']
    default:
      return []
  }
}

const MAX_MULTI = 6

/**
 * #2067.2 — décision Louis du 18/09/2026 : « avec combien de partenaires (ESN,
 * cabinets, rangs 1) travailles-tu réellement aujourd'hui ? », RÉGULIERS et
 * PONCTUELS séparés. Un seul catalogue pour les deux questions (GA-26) : deux
 * listes recopiées divergeraient au premier ajustement de borne, et les deux
 * nombres deviendraient incomparables.
 *
 * Des petits nombres exacts d'abord — c'est là que l'arbitrage se joue (deux
 * partenaires tenus ou cinq, ce n'est pas la même charge) — puis des bandes.
 * « 0 » est un zéro DÉCLARÉ, vrai ; « Je ne sais pas » est l'absence de mesure,
 * et l'audit la dit « non établie », jamais 0 (GA-18 / GA-19).
 */
const PARTNER_COUNT_BANDS = ['0', '1', '2', '3', '4-5', '6-10', 'Plus de 10', 'Je ne sais pas'] as const

/* -------------------------------------------------------------------------- */
/*  Catalogues de valeurs — repris mot pour mot du rapport (p.23-28).          */
/* -------------------------------------------------------------------------- */

export const PROFILE_QUESTION_OPTIONS = {
  // ── Bloc A — Vous et votre rôle ───────────────────────────────────────────
  // #1920.4 — directeur d'agence, décision Louis 15/09/2026 : la valeur
  // n'existait pas dans l'énumération ; ajoutée EN FIN (GA-08). Le commentaire
  // reste HORS du tableau : `options_du_questionnaire` (côté IA, tests
  // Python) extrait les chaînes entre guillemets sans retirer les
  // commentaires, et une apostrophe non appairée à l'intérieur du tableau
  // s'y ferait lire comme un rôle.
  //
  // #2032.2-.8 (16/09/2026) — sept valeurs de PARCOURS (la manière de
  // travailler), distinctes des titres au-dessus, ajoutées EN FIN (GA-08).
  // Elles adaptent la FORME du conseil, jamais un jugement de compétence
  // (#2032.15, garde GA-338 : declarative-fields-do-not-score.spec.ts).
  // ⚠️ AUCUNE apostrophe dans un commentaire À L'INTÉRIEUR du tableau
  // ci-dessous (la mise en garde juste au-dessus) : ce lot l'a appris à ses
  // dépens, `options_du_questionnaire` lisait un fragment de commentaire
  // comme un rôle dès qu'une apostrophe française (« qu'on », « ce qu'il »)
  // y ouvrait une fausse chaîne.
  user_role: [
    'Fondateur / CEO',
    'Directeur commercial',
    'Head of Sales',
    'Business Manager',
    'Account Manager',
    'Business Developer',
    'SDR / BDR',
    'Talent Manager / Recruteur',
    "Consultant / Ingénieur d'affaires",
    'Directeur de BU',
    "Directeur d'agence",
    // BEL-SC-222 (#3251) — deux titres que le ticket distingue et que le
    // catalogue ne portait pas encore, ajoutés EN FIN du bloc TITRES (GA-08 :
    // jamais au milieu) mais AVANT les 7 choix de PARCOURS ajoutés en
    // #2032.2-.8 (le test « porte les 7 choix de parcours en fin de liste »
    // lit les 7 DERNIÈRES valeurs — les ajouter après les casserait ce test).
    'Responsable staffing',
    'ADV / Finance',
    'Freelance / activité individuelle',
    // #3386.1 (beta #3386, 30/09/2026) — un siège transversal SANS book de
    // comptes ni équipe à diriger (process, outillage, données commerciales),
    // que « ADV / Finance » ne nomme pas (elle reste la facturation).
    // Ajouté APRÈS le bloc TITRES et AVANT les 7 PARCOURS, même règle que
    // BEL-SC-222 juste au-dessus.
    'Opérations commerciales',
    'Responsable ADV',
    'Responsable delivery / opérations',
    'Responsable achats / partenariats',
    'Responsable marketing',
    'Responsable d’un bureau d’études',
    'Pur commercial',
    'Commercial avec culture technique',
    'Hybride business / delivery',
    'Ancien consultant devenu commercial',
    'Pur technique / delivery',
    'Recrutement / talent',
    'Direction / management',
  ],
  // #2032.10 — suivi de `user_role` : les fonctions réellement EXERCÉES sur le
  // parcours, pas seulement le rôle actuel. Lu par `bellum_profiler.py`
  // (section « La personne qui répond ») — jamais par un moteur de notation
  // (GA-338), pour la même raison que `user_role` juste au-dessus.
  role_functions_practiced: [
    'Vente / prospection',
    'Delivery / conseil en mission',
    'Recrutement / sourcing',
    'Management / direction',
    'Marketing / communication',
    'Support / opérations',
  ],
  role_tenure: ['Moins de 3 mois', '3-6 mois', '6-12 mois', '1-2 ans', '2-5 ans', '5 ans et plus'],
  industry_tenure: ['Moins de 1 an', '1-2 ans', '3-5 ans', '6-10 ans', '10 ans et plus'],
  individual_goal: [
    'Ouvrir de nouveaux comptes',
    'Développer des comptes existants',
    'Obtenir plus de RDV',
    'Recevoir plus de besoins',
    'Envoyer plus de profils',
    'Signer plus de missions',
    'Augmenter le CA',
    'Améliorer la marge',
    'Réduire le cycle de vente',
    'Structurer mon activité',
    'Positionner des consultants disponibles',
    'Trouver et qualifier des profils',
    'Fiabiliser le suivi des missions',
    'Réduire les blocages ADV et les retards de paiement',
    'Piloter et accompagner mon équipe',
    'Préparer des réponses à des consultations',
  ],
  monthly_target: [
    '0-2 RDV',
    '3-5 RDV',
    '6-10 RDV',
    '11-20 RDV',
    '20+ RDV',
    '0-1 compte',
    '2-3 comptes',
    '4-5 comptes',
    '6+ comptes',
  ],

  // ── Bloc B — Votre entreprise et votre équipe ─────────────────────────────
  company_age: ['Moins de 1 an', '1-2 ans', '3-5 ans', '6-10 ans', '11-20 ans', '20 ans et plus'],
  company_size: ['1-5', '6-10', '11-30', '31-80', '81-200', '201-500', '501-1 000', '1 001-5 000', '5 000+'],
  // #2015.7 — dire si c'est un groupe ou une filiale. `establishment_count`
  // (prefill Pappers, `onboarding.ts:prefillCandidateSchema`) N'EST PAS une
  // filiation : un nombre d'établissements ne dit pas qui détient qui, et le
  // registre gratuit ne porte aucun signal fiable de hiérarchie capitalistique
  // (pas de scraping, pas de devinette — doctrine). D'où une question posée,
  // pas une déduction : déclaratif, comme le reste du bloc B.
  company_group_structure: [
    'Entreprise indépendante',
    'Maison mère (nous détenons une ou plusieurs filiales)',
    "Filiale d'un groupe",
    'Je ne sais pas',
  ],
  // #2053.4 — la visibilité déclarée sur le délai d'encaissement. Nomme
  // l'écran EXISTANT (`/missions/encaissements`) plutôt que d'en ouvrir un
  // second (GA-26) : deux des quatre choix disent OÙ, pas seulement SI.
  payment_delay_visibility: [
    'Oui, ici (Missions › Encaissements)',
    'Oui, ailleurs (tableur, outil de facturation)',
    'Non, je ne le suis pas',
    'Je ne sais pas',
  ],
  // #2053.4 — le délai lui-même, en bande. Posée uniquement quand
  // `payment_delay_visibility` dit qu'il est suivi (`tracksPaymentDelay`
  // ci-dessous) : jamais forcer une bande chiffrée à qui vient de dire qu'il
  // ne le suit pas (#2027, #2053.8).
  payment_delay_band: ['< 30 jours', '30-45 jours', '45-60 jours', '60-90 jours', '90 jours et plus', 'Je ne sais pas'],
  consultants_on_mission: ['0', '1-5', '6-15', '16-30', '31-80', '81-200', '201-500', '500+'],
  consultants_in_pipe: ['0', '1-5', '6-15', '16-30', '31-80', '81-200', '200+'],
  team_overlap: [
    'Jamais',
    'Parfois',
    'Souvent',
    'Oui, mêmes comptes',
    'Oui, mêmes secteurs',
    'Oui, mêmes territoires',
    'Je ne sais pas',
  ],

  // ── Bloc C — Votre offre et vos capacités ─────────────────────────────────
  ramp_up_capacity: ['Immédiate < 1 semaine', '1-2 semaines', '3-4 semaines', '1-2 mois', 'Selon sourcing', 'Variable'],
  avg_deal_size: ['<10 k€', '10-30 k€', '30-75 k€', '75-150 k€', '150-500 k€', '500 k€+', 'Je ne sais pas'],
  // #2053.3 — le coût MENSUEL de l'intercontrat, DISTINCT de
  // `available_consultants_band` (un effectif, jamais un coût). Un montant,
  // jamais un pourcentage : un pourcentage exigerait un dénominateur (coût du
  // banc) qu'on n'a pas — l'extrapolation que #2053.8 interdit.
  intercontrat_cost: ['< 2 k€', '2-5 k€', '5-10 k€', '10-20 k€', '20 k€ et plus', 'Je ne sais pas'],
  target_margin: ['<10 %', '10-15 %', '16-20 %', '21-30 %', '30 % +', 'Je ne suis pas le décideur', 'Je ne sais pas'],

  // ── Bloc D — Marchés, territoires et comptes ──────────────────────────────
  portfolio_size: ['0', '1-5', '6-15', '16-30', '31-60', '61-100', '100+'],
  accounts_relationship_status: [
    'Jamais contactés',
    'Contactés sans réponse',
    'RDV déjà obtenu',
    'Besoin identifié',
    'Proposition envoyée',
    'Client actif',
    'Ancien client',
    'Compte dormant',
    'Mixte',
  ],
  go_to_market_channels: [
    'Direct client final',
    'Rang 2',
    'Rang 3',
    'Partenaires ESN',
    'Cabinets de recrutement',
    'Freelance marketplaces',
    "Appels d'offres",
    'Référencements',
    'Mixte',
    'Clients finaux en direct',
    'Partenariat / rang 2',
    'Appels d’offres publics',
    'Consultations privées',
    'Centrale d’achat / marketplace à qualifier',
    'Recommandations / réseau',
    'Voies d’accès à décider selon le compte',
  ],

  // ── Bloc E — Vos canaux et votre routine ──────────────────────────────────
  weekly_calls: ['0', '1-20', '21-50', '51-100', '100+'],
  weekly_emails: ['0', '1-20', '21-50', '51-100', '100+'],
  weekly_linkedin: ['0', '1-20', '21-50', '51-100', '100+'],
  sales_routine: [
    'Aucune routine',
    'Priorisation hebdo',
    'Appels quotidiens',
    'Relances planifiées',
    'Revue CRM',
    'Contenu LinkedIn',
    'Revue besoins',
    'Push profils',
    'Suivi consultants',
    'Reporting manager',
  ],

  // ── Bloc F — Vos blocages et votre maturité ───────────────────────────────
  sales_blockers: [
    'Pas assez de comptes cibles',
    'Mauvais contacts',
    'Pas de réponse',
    'Pas de téléphone / email',
    'Référencement fermé',
    'Pas de besoin',
    'Timing',
    'Budget',
    'Concurrence déjà en place',
    'Offre trop générique',
    'Manque de références',
    'Peu de temps',
    'CRM mal tenu',
    'Suivi insuffisant',
    'Difficulté à relancer',
    'Manque de profils disponibles',
    'Manque de visibilité interne',
  ],
  tooling: [
    'Aucun CRM',
    'Excel / Google Sheets',
    'HubSpot',
    'Salesforce',
    'BoondManager',
    'Bullhorn',
    'Dynamics',
    'Pipedrive',
    'Gmail',
    'Outlook',
    'Google Agenda',
    'LinkedIn Sales Navigator',
    "Outil d'enrichissement",
    'Outil de séquence',
  ],
  proactivity_level: [
    'Répondre seulement quand je demande',
    'Me suggérer des actions',
    'Me rappeler les priorités',
    "M'envoyer des alertes",
    'Préparer automatiquement mes briefs',
    'Orchestrer des workflows',
    'Je veux choisir par fonctionnalité',
  ],
  shared_data_scope: [
    'Comptes suivis',
    'Contacts',
    'Actions',
    'Messages',
    'Notes',
    'Documents',
    'Crédits',
    'Performance',
    'Agenda',
    'Rien sans validation',
    'Tout par défaut',
    'Paramétrable par type',
  ],
  // #2058.2 — les moments ACCEPTÉS pour être sollicité : une préférence
  // déclarée, jamais une règle d'envoi (le copilote prépare, il ne programme
  // rien). Choix fermés plutôt qu'un texte libre : ils couvrent le besoin
  // (plages horaires, jours, moments à éviter), comme les questions voisines.
  contact_windows: [
    'Matin (avant 12h)',
    'Après-midi (12h-18h)',
    'Soir (après 18h)',
    'En semaine seulement',
    'Y compris le week-end',
    'Jamais avant 9h',
    'Jamais après 19h',
    'Pas de préférence',
  ],
  // #2058.10 — le niveau de détail attendu des RÉPONSES du copilote, pas de
  // la question elle-même.
  detail_level: ['Court et dense', 'Développé, avec le contexte', 'Ça dépend du sujet', 'Adapter à la demande'],

  // ── Questions conditionnelles (§28) ───────────────────────────────────────
  public_sector_practice: [
    'Référencement / accord-cadre déjà obtenu',
    'Réponses aux appels d’offres en direct',
    'Allotissement (nous portons un lot)',
    'Sous-traitance d’un titulaire',
    'Aucune expérience marchés publics',
  ],
  regulated_sector_readiness: [
    'Habilitations / clauses de sécurité déjà signées',
    'Références bancaires ou assurantielles citables',
    'Conformité DORA / NIS2 / RGPD documentée',
    'Consultants déjà passés en grands comptes régulés',
    'Rien de tout cela pour l’instant',
  ],
  partner_relationship: [
    'Partenaires réguliers, contrats en place',
    'Partenaires ponctuels selon les besoins',
    'Nous cherchons à en référencer de nouveaux',
    'Nous subissons le rang 2 faute de référencement direct',
  ],
  // #2067.2 — la NATURE de la relation (juste au-dessus) ne dit pas COMBIEN :
  // l'arbitrage de la charge active (`commercial-audit-active-load.ts`) lit ces
  // deux nombres, les réguliers dans la charge, les ponctuels hors d'elle.
  partners_regular_count: PARTNER_COUNT_BANDS,
  partners_occasional_count: PARTNER_COUNT_BANDS,

  // ── #2056 — appels d'offres (bloc AO), when: pursuesRfps ──────────────────
  // #2056.3 — les référencements/accords-cadres ACTIFS, distincts du choix
  // unique de `public_sector_practice` qui confond référencement, AO direct,
  // allotissement et sous-traitance dans UNE seule case.
  rfp_referencing_status: [
    'Aucun référencement actif',
    'Référencement en cours de qualification',
    'Un référencement actif',
    'Plusieurs référencements actifs',
  ],
  // #2056.4 — l'allotissement : la PRATIQUE réelle, pas la simple mention déjà
  // captée par `public_sector_practice`.
  rfp_lot_allocation: [
    'Toujours en direct, jamais par lot',
    'Uniquement par lot, jamais la totalité du marché',
    'Les deux selon les dossiers',
    'Nous ne savons pas répondre par lot',
  ],
  // #2056.7 — les modèles de réponse (mémoires techniques réutilisables).
  rfp_response_templates: [
    'Aucun modèle, on repart de zéro à chaque fois',
    'Quelques trames réutilisées de façon informelle',
    'Bibliothèque de modèles structurée et maintenue',
    'Modèles génériques, peu adaptés au client',
  ],
  // #2056.8 — le volume d'AO. Une valeur SEULE ne veut rien dire : elle est
  // toujours accompagnée de `rfp_volume_period`, comme 2049.13.
  rfp_volume: ['0', '1-5', '6-15', '16-30', '31-80', '80+'],
  // #2056.8 — la période de référence du volume déclaré. Vocabulaire REPRIS de
  // `ACTIVITY_REFERENCE_PERIODS` (#2049.13), jamais recopié : un réglage vit à
  // un seul endroit (GA-26), et « je donne un ordre de grandeur » doit rester
  // la même phrase partout où un volume se déclare sans période précise.
  rfp_volume_period: ACTIVITY_REFERENCE_PERIODS,
  // #2056.10 — les retours obtenus. Qualitatif, jamais un taux : la doctrine
  // (2056.9, hors périmètre) refuse tout taux sans dénominateur fiable — cette
  // liste dit CE QUI est arrivé, jamais dans quelle proportion.
  rfp_outcomes: [
    'Short-lists obtenues',
    'Marchés remportés',
    'Marchés perdus après soutenance',
    'Rejetés sur dossier administratif',
    'Sans retour du client',
    'Trop tôt pour avoir des retours',
  ],
  // #2056.12 — la décision GO/NO-GO : existe-t-il un FILTRE avant d'engager du
  // temps d'avant-vente sur un dossier ?
  rfp_go_no_go_process: [
    'Nous répondons à tout ce qui arrive',
    'Une grille de critères filtre en amont',
    'Décision informelle, au feeling d’une personne',
    'Aucun filtre, on découvre en marchant',
  ],
  // #2056.13 — la capacité DOCUMENTAIRE : les pièces administratives et
  // techniques sont-elles prêtes à l'usage ? Lu par `rfpDocumentationIsReady`
  // ci-dessous — un seul littéral, jamais recopié (GA-26).
  rfp_document_readiness: [
    'Tout est à jour et prêt à l’usage',
    'Il faut rassembler les pièces à chaque fois',
    'Des pièces manquent ou sont périmées',
    'Je ne sais pas ce qui est prêt',
  ],
  // #2056.11 — l'économie du dossier : un MONTANT nommé, jamais un taux
  // (aucun dénominateur fiable — même règle que le refus du « taux de
  // shortlist », #2056.9/#2049.14). Même famille que `rfp_volume` au-dessus :
  // une tranche déclarée, avec « Je ne sais pas » explicite plutôt qu'un
  // silence lu comme un zéro (GA-18/GA-19).
  rfp_deal_value: ['<50 k€', '50-150 k€', '150-500 k€', '500 k€-2 M€', '2 M€+', 'Je ne sais pas'],
  // #2057.10 — l'owner : existe-t-il un porteur NOMMÉ sur chaque dossier ? Le
  // mécanisme d'owner côté espace existe déjà
  // (`workspace-portfolio-handover.service.ts`, #2037.9) — ici, c'est la
  // COLLECTE qui manquait. Visible par tous les membres de l'espace
  // (chiffres d'argent + owner, arbitrage Louis 15/09) : aucune restriction
  // par membre à écrire.
  rfp_owner_assignment: [
    'Un porteur nommé sur chaque dossier',
    'Un porteur nommé mais pas toujours suivi',
    'Personne n’est nommé, ça se fait au feeling',
    'Aucun processus',
  ],

  // ── #2057 — contenu (bloc contenu), when: doesContentMarketing ────────────
  // #2057.2 — le profil ACTIF : où l'ESN publie, déclaratif (pas de scraping).
  content_active_profile: [
    'Profil personnel LinkedIn',
    'Page entreprise',
    'Blog / site',
    'Newsletter',
    'Aucun profil actif',
  ],
  // #2057.4 — l'audience. Un bucket déclaré, jamais un nombre scrapé.
  content_audience_size: ['Moins de 500', '500-2 000', '2 000-10 000', '10 000+', 'Je ne sais pas'],
  // #2057.6 — les réactions mesurées. « Aucune réaction mesurée » est un choix
  // EXPLICITE de l'utilisateur, jamais un défaut silencieux — non mesuré n'est
  // jamais 0 (GA-18/GA-19) : l'absence de réponse reste `undefined`, distincte
  // de ce choix.
  content_reactions: [
    'Aucune réaction mesurée',
    'Quelques likes, peu de commentaires',
    'Engagement régulier',
    'Forte visibilité (partages, commentaires nombreux)',
  ],
  // #2057.7 — les conversations commerciales GÉNÉRÉES par le contenu, distinct
  // des réactions (un like n'est pas une conversation).
  content_conversations_generated: [
    'Aucune conversation commerciale générée',
    'Occasionnellement',
    'Régulièrement',
    'Canal d’entrée à part entière',
  ],
  // #2057.11/.12/.13/.14 — les quatre états qu'on cesse de confondre. MULTI :
  // cocher « Publier » sans cocher les trois autres est exactement ce que la
  // doctrine décrit (« beaucoup d'ESN croient faire du contenu parce qu'elles
  // publient »). `recommendContentInvestment` lit ce tableau.
  content_funnel_stages_reached: ['Publier', 'Exploiter les réactions', 'Ouvrir une conversation', 'Obtenir un besoin'],
} as const satisfies Record<string, readonly string[]>

export type ProfileQuestionKey =
  | keyof typeof PROFILE_QUESTION_OPTIONS
  | 'expertise_areas'
  | 'staffing_model'
  | 'target_sectors'
  | 'geo_zones'
  | 'target_company_types'
  | 'outreach_channels'
  | 'sales_team_size'
  // Les 5 réponses du Temps 2, repliées dans les blocs du rapport : déjà
  // posées, déjà persistées, déjà lues par les prompts.
  | 'avg_sales_cycle'
  | 'avg_tjm'
  | 'client_references'
  | 'decision_maker_personas'
  | 'no_go_sectors'
  // #2056.2 — les plateformes d'AO utilisées. `tags` (saisie libre) à dessein :
  // ce sont LES OUTILS DU CLIENT, jamais un catalogue de nos noms écrits en dur
  // (`tool-naming.ts`) — aucun registre de plateformes d'AO n'existe côté
  // Bellum, donc aucun nom ne peut arriver par injection. La seule façon
  // honnête de les nommer est que l'utilisateur les tape lui-même.
  | 'rfp_platforms_used'
  // #2057.5 — l'expertise VISIBLE publiquement, distincte de `expertise_areas`
  // (déclaratif, « ce qu'on dit savoir faire »). `tags` : la personne
  // décrit elle-même ce qui se voit, jamais une donnée collectée pour elle.
  | 'content_visible_expertise'
  // #2036.9 — l'AMBITION territoriale, distincte de `geo_zones` (déjà
  // ci-dessus) qui dit la zone où le vendeur PEUT intervenir / a des relations.
  // Choix repris de `ESN_ANSWER_OPTIONS.geo_zones` (GA-26 : une liste vit à un
  // seul endroit), jamais lue comme une capacité (GA-338, #2036.10).
  | 'growth_target_zones'
  // #3923 — DÉCISION LOUIS 09/10 : les métiers placés (`esn_profiles.placed_roles`)
  // se déclarent ICI (complément Temps 2) ET dans « Mon profil » — deux écrans,
  // UNE colonne (GA-26). `tags` : ce sont les métiers de l'espace, tapés par lui.
  | 'placed_roles'

/* -------------------------------------------------------------------------- */
/*  Prédicats de branchement (§28) — purs, donc testables.                     */
/* -------------------------------------------------------------------------- */

const includesAny = (values: readonly string[] | undefined, needles: readonly string[]): boolean =>
  (values ?? []).some(v => needles.some(n => v.toLowerCase().includes(n.toLowerCase())))

/**
 * Les deux valeurs de `sales_team_size` qui désignent quelqu'un SANS équipe.
 *
 * ⚠️ #2037.13 — elles se lisent dans `ESN_ANSWER_OPTIONS`, jamais en littéral.
 * Le prédicat comparait à `'1'` et `'1 personne'` : aucune des SIX valeurs que
 * le questionnaire produit réellement ne vaut ça, si bien que `worksAlone`
 * était TOUJOURS faux en production. Les deux questions qu'il garde —
 * « avec qui te marches-tu dessus ? » et « partager quoi, avec qui ? » —
 * étaient donc posées à tout le monde, fondateur seul compris.
 *
 * Les tests ne le voyaient pas : leurs fixtures écrivaient `'1'` et
 * `'1-3 personnes'`, des valeurs que le produit n'écrit jamais. Un test qui
 * invente sa donnée d'entrée ne garde rien.
 */
const SOLO_TEAM_SIZES: readonly string[] = [
  ESN_ANSWER_OPTIONS.sales_team_size[0], // « Je suis seul (fondateur / indépendant) »
  ESN_ANSWER_OPTIONS.sales_team_size[5], // « Je n'ai pas d'équipe commerciale dédiée »
]

/**
 * Anciennes valeurs, gardées pour les profils déjà enregistrés : on archive,
 * on ne supprime pas. Une réponse écrite avant ce jour continue d'être lue.
 */
const LEGACY_SOLO_TEAM_SIZES: readonly string[] = ['1', '1 personne']

/** « Si l'utilisateur indique qu'il travaille seul, masquer les questions de
 *  coordination d'équipe détaillées. » */
export const worksAlone = (answers: Partial<EsnAnswers>): boolean => {
  const size = answers.sales_team_size?.trim()
  if (!size) return false
  return SOLO_TEAM_SIZES.includes(size) || LEGACY_SOLO_TEAM_SIZES.includes(size)
}

/** « S'il cible le secteur public, faire apparaître des questions sur marchés
 *  publics, référencement, allotissement et sous-traitance. » */
export const targetsPublicSector = (answers: Partial<EsnAnswers>): boolean =>
  includesAny(answers.target_company_types, ['public', 'administration', 'collectivit', 'organisme']) ||
  includesAny(answers.target_sectors, ['public', 'collectivit'])

/** « S'il cible banque / assurance, demander contraintes réglementaires,
 *  sécurité, références et maturité grands comptes. » */
export const targetsRegulatedSector = (answers: Partial<EsnAnswers>): boolean =>
  includesAny(answers.target_sectors, ['banque', 'assurance', 'mutuelle', 'finance'])

/** « S'il travaille en rang 2, demander partenaires actuels, capacité à sourcer,
 *  marges et historique de collaboration. » */
export const worksThroughPartners = (answers: Partial<EsnAnswers>): boolean =>
  includesAny(answers.go_to_market_channels, ['rang 2', 'rang 3', 'partenaires', 'cabinets'])

/**
 * #2056.1 (déjà là) affiche `public_sector_practice` sur `targetsPublicSector`
 * seul. #2056.2-.14 élargissent le bloc AO : un appel d'offres n'est pas
 * réservé au secteur public — `go_to_market_channels` porte "Appels d'offres"
 * comme choix RÉEL et produit ("Appels d'offres" est un choix de
 * `PROFILE_QUESTION_OPTIONS.go_to_market_channels", verbatim). Une ESN qui a
 * coché ce canal répond à des AO même sans cibler l'administration.
 */
export const pursuesRfps = (answers: Partial<EsnAnswers>): boolean =>
  targetsPublicSector(answers) || includesAny(answers.go_to_market_channels, ["Appels d'offres"])

/**
 * #2057.1 — « n'afficher le bloc contenu qu'aux utilisateurs concernés ».
 *
 * Les deux signaux lus sont des valeurs RÉELLEMENT produites par le
 * questionnaire (piège documenté sur `worksAlone` #2037.13) : `sales_routine`
 * porte exactement 'Contenu LinkedIn' (`PROFILE_QUESTION_OPTIONS.sales_routine`)
 * et `weekly_linkedin` porte exactement '0' comme valeur « aucune
 * sollicitation ». Un profil qui n'a JAMAIS répondu à `weekly_linkedin` (valeur
 * `undefined`) n'est pas exclu pour autant : c'est `sales_routine` qui décide
 * alors seul.
 */
export const doesContentMarketing = (answers: Partial<EsnAnswers>): boolean =>
  includesAny(answers.sales_routine, ['Contenu LinkedIn']) ||
  (answers.weekly_linkedin !== undefined && answers.weekly_linkedin !== null && answers.weekly_linkedin !== '0')

/**
 * #2053.4 — la bande de délai d'encaissement n'a de sens QUE si l'ESN suit
 * déjà ce délai quelque part. Forcer une bande chiffrée à qui vient de
 * répondre « Non, je ne le suis pas » ou « Je ne sais pas » à
 * `payment_delay_visibility` fabriquerait une fausse précision (#2027) — c'est
 * exactement l'extrapolation que #2053.8 interdit. `payment_delay_band` reste
 * donc masquée tant que la visibilité déclarée ne commence pas par « Oui ».
 */
export const tracksPaymentDelay = (answers: Partial<EsnAnswers>): boolean =>
  (answers.payment_delay_visibility ?? '').startsWith('Oui')

/**
 * #2056.13 — la capacité documentaire est CONFIRMÉE seulement quand la réponse
 * le dit explicitement. Toute autre réponse — y compris l'absence de réponse —
 * laisse la question ouverte : jamais un `false` fabriqué qui affirmerait
 * « pièces manquantes » sans preuve (non mesuré n'est jamais 0, GA-18/GA-19).
 */
export const RFP_DOCUMENT_READINESS_CONFIRMED = 'Tout est à jour et prêt à l’usage'
export const rfpDocumentationIsReady = (answers: Partial<EsnAnswers>): boolean =>
  answers.rfp_document_readiness === RFP_DOCUMENT_READINESS_CONFIRMED

/**
 * #2056.11 — l'économie est CONNUE seulement quand un montant réel a été
 * déclaré. « Je ne sais pas » est un choix EXPLICITE (non mesuré n'est jamais
 * 0, GA-18/GA-19) : il refuse l'axe au même titre qu'une absence de réponse,
 * jamais un `true` fabriqué sur un silence.
 */
export const RFP_DEAL_VALUE_UNKNOWN = 'Je ne sais pas'
export const rfpEconomicsAreKnown = (answers: Partial<EsnAnswers>): boolean =>
  Boolean(answers.rfp_deal_value) && answers.rfp_deal_value !== RFP_DEAL_VALUE_UNKNOWN

/**
 * #2057.10 — l'owner est ASSIGNÉ seulement sur la réponse EXPLICITE. Le
 * mécanisme d'owner côté espace existe déjà
 * (`workspace-portfolio-handover.service.ts`, #2037.9) ; cette fonction lit la
 * COLLECTE déclarative du questionnaire, jamais un second arbitre — aucune
 * écriture, aucune correction : une lecture pure comme `rfpDocumentationIsReady`.
 */
export const RFP_OWNER_ASSIGNED_CONFIRMED = 'Un porteur nommé sur chaque dossier'
export const rfpOwnerIsAssigned = (answers: Partial<EsnAnswers>): boolean =>
  answers.rfp_owner_assignment === RFP_OWNER_ASSIGNED_CONFIRMED

/**
 * #2057.14 — « la prospection de base tient » : au moins un canal de
 * prospection ACTIVE (appels ou emails), parmi ceux RÉPONDUS. `null` = non
 * mesuré (aucun des deux n'a de réponse) — distinct de `false` (tous ceux
 * répondus valent explicitement '0'), pour ne jamais lire une absence de
 * réponse comme un échec de prospection.
 *
 * ⚠️ `null` ET `undefined` marquent tous les deux « pas de réponse » : cette
 * fonction est appelée à la fois sur des réponses PARTIELLES (clé absente,
 * `undefined`) et sur un profil projeté depuis la base (`mapRowToAnswers`, qui
 * normalise une colonne vide en `null`) — les confondre a fait passer un
 * profil entièrement vide pour « prospection à zéro » (témoin dans le test).
 */
export const baseProspectingHolds = (answers: Partial<EsnAnswers>): boolean | null => {
  const known = [answers.weekly_calls, answers.weekly_emails].filter((v): v is string => v != null)
  if (known.length === 0) return null
  return known.some(v => v !== '0')
}

/** Les quatre verdicts, ordonnés du plus sévère au plus favorable. */
export type ContentRecommendation =
  | 'no_content_before_base_prospecting'
  | 'not_enough_data'
  | 'publish_more'
  | 'exploit_further'
  | 'content_is_working'

/**
 * #2057.14 — le conseil qui va avec les quatre états : « pas de contenu si la
 * prospection de base ne tient pas ». C'est un conseil qui REFUSE — quel que
 * soit ce que `content_funnel_stages_reached` raconte, une prospection de base
 * qui ne tient pas (`baseProspectingHolds === false`) gagne toujours, parce
 * qu'investir dans le contenu sans prospection active est le contraire du
 * conseil que la doctrine veut donner.
 */
export function recommendContentInvestment(answers: Partial<EsnAnswers>): {
  recommendation: ContentRecommendation
  reachedStages: string[]
} {
  const reached = [...(answers.content_funnel_stages_reached ?? [])]
  const holds = baseProspectingHolds(answers)

  if (holds === false) return { recommendation: 'no_content_before_base_prospecting', reachedStages: reached }
  if (reached.length === 0)
    return { recommendation: holds === null ? 'not_enough_data' : 'publish_more', reachedStages: reached }
  if (reached.length < PROFILE_QUESTION_OPTIONS.content_funnel_stages_reached.length) {
    return { recommendation: 'exploit_further', reachedStages: reached }
  }
  return { recommendation: 'content_is_working', reachedStages: reached }
}

/* -------------------------------------------------------------------------- */
/*  Le catalogue                                                              */
/* -------------------------------------------------------------------------- */

const opt = (key: keyof typeof PROFILE_QUESTION_OPTIONS): readonly string[] => PROFILE_QUESTION_OPTIONS[key]

/**
 * #2031.10 — les choix de `tooling` qui restent à poser une fois retirés ceux
 * que l'espace a déjà déduits comme branchés. Champ par champ : un CRM seul
 * ne retire QUE le choix du CRM, jamais Outlook ni un outil de séquence.
 */
const remainingToolingChoices = (context: ProfileQuestionContext): readonly string[] =>
  opt('tooling').filter(choice => !context.connectedToolNames.includes(choice))

/**
 * #2031.10 — les choix `tooling` déductibles depuis les outils BRANCHÉS de
 * l'espace, à passer tels quels dans `ProfileQuestionContext.connectedToolNames`.
 *
 * Correspondance de NOM affiché, pas de provider : `tooling` a son propre
 * vocabulaire (persisté verbatim, en français, jamais traduit — cf. règle
 * maison n°1 en tête de ce module) plutôt qu'un identifiant technique. Un
 * outil BRANCHÉ dont le nom affiché ne figure pas dans le catalogue (ex.
 * « Google Calendar », quand `tooling` dit « Google Agenda ») n'est pas
 * déduit : c'est un manque assumé, jamais une fausse déduction. Aucun nom de
 * fournisseur n'est réécrit ici — les noms viennent de `tools`, fourni par
 * l'appelant via `connectedClientTools` (`tool-naming.ts`, GA-44).
 */
export function toolingChoicesFromConnectedTools(tools: readonly { name: string }[]): string[] {
  const toolingChoices = new Set<string>(opt('tooling'))
  const deduced = new Set<string>()
  for (const tool of tools) {
    if (toolingChoices.has(tool.name)) deduced.add(tool.name)
  }
  return [...deduced]
}

export const PROFILE_QUESTIONS: readonly ProfileQuestion[] = [
  // ── A ──
  { key: 'user_role', block: 'role', kind: 'single', choices: opt('user_role'), allowOther: true },
  { key: 'role_tenure', block: 'role', kind: 'single', choices: opt('role_tenure') },
  { key: 'industry_tenure', block: 'role', kind: 'single', choices: opt('industry_tenure') },
  { key: 'individual_goal', block: 'role', kind: 'single', choices: opt('individual_goal'), allowOther: true },
  { key: 'monthly_target', block: 'role', kind: 'single', choices: opt('monthly_target'), allowOther: true },
  // #2032.10 — suit `user_role` uniquement si répondu : demander les fonctions
  // exercées à quelqu'un qui n'a pas encore dit son rôle n'a pas de sens.
  {
    key: 'role_functions_practiced',
    block: 'role',
    kind: 'multi',
    choices: opt('role_functions_practiced'),
    allowOther: true,
    when: answers => Boolean(answers.user_role),
    // #2031.3 — le rôle invité prérempli CE QUI EST DÉDUCTIBLE, jamais le
    // reste : la question reste posée entière (le `when` ci-dessus ne change
    // pas), et les fonctions non couvertes par `roleFunctionsPracticedFromWorkspaceRole`
    // restent à cocher par la personne.
    prefillValue: ctx => ctx.invitedRoleFunctions,
  },
  // #3923 — DÉCISION LOUIS 09/10 : « quels métiers places-tu ? », posé à tout le
  // monde. Lu par `signalRelevance` (Découvrir) pour ranger une offre d'emploi
  // hors métier après les autres. Même colonne (`esn_profiles.placed_roles`)
  // que le champ de « Mon profil » (`PlacedRolesSection`) — GA-26. Rangé ici
  // et pas dans `offer` : ce bloc-là tient déjà ses six questions communes.
  { key: 'placed_roles', block: 'role', kind: 'tags', max: MAX_MULTI },

  // ── B ──
  { key: 'company_age', block: 'company', kind: 'single', choices: opt('company_age') },
  { key: 'company_size', block: 'company', kind: 'single', choices: opt('company_size') },
  { key: 'consultants_on_mission', block: 'company', kind: 'single', choices: opt('consultants_on_mission') },
  { key: 'consultants_in_pipe', block: 'company', kind: 'single', choices: opt('consultants_in_pipe') },
  // #2015.7 — posée à TOUT LE MONDE, jamais gatée : contrairement au bloc AO,
  // savoir si l'entreprise est un groupe ou une filiale ne dépend d'aucune
  // autre réponse.
  {
    key: 'company_group_structure',
    block: 'company',
    kind: 'single',
    choices: opt('company_group_structure'),
  },
  // #2053.4 — la visibilité déclarée sur le délai d'encaissement, posée à
  // TOUT LE MONDE (comme `company_group_structure` juste au-dessus).
  { key: 'payment_delay_visibility', block: 'company', kind: 'single', choices: opt('payment_delay_visibility') },
  // #2053.4 — le délai lui-même, UNIQUEMENT si `payment_delay_visibility` dit
  // qu'il est suivi (`tracksPaymentDelay`) : ne force jamais une bande
  // chiffrée à qui vient de dire qu'il ne le suit pas.
  {
    key: 'payment_delay_band',
    block: 'company',
    kind: 'single',
    choices: opt('payment_delay_band'),
    when: tracksPaymentDelay,
  },
  {
    key: 'team_overlap',
    block: 'company',
    kind: 'single',
    choices: opt('team_overlap'),
    // Un commercial seul n'a personne avec qui se marcher dessus.
    when: answers => !worksAlone(answers),
  },

  // ── C ──
  // Les 3 questions du Temps 2 qui parlent d'offre et de capacité rejoignent ce
  // bloc : elles étaient déjà posées, déjà persistées et déjà LUES par les
  // prompts. Les sortir du parcours aurait fait mentir le compteur (« 3 / 24 »
  // sur un profil qui en a répondu 8).
  { key: 'avg_tjm', block: 'offer', kind: 'single', choices: TEMPS2_ANSWER_OPTIONS.avg_tjm },
  { key: 'client_references', block: 'offer', kind: 'tags' },
  { key: 'ramp_up_capacity', block: 'offer', kind: 'single', choices: opt('ramp_up_capacity') },
  { key: 'avg_deal_size', block: 'offer', kind: 'single', choices: opt('avg_deal_size') },
  // #2053.3 — le coût d'intercontrat, À CÔTÉ du panier moyen : les deux
  // questions financières de qualification de l'offre.
  { key: 'intercontrat_cost', block: 'offer', kind: 'single', choices: opt('intercontrat_cost') },
  { key: 'target_margin', block: 'offer', kind: 'single', choices: opt('target_margin') },

  // ── D ──
  {
    key: 'decision_maker_personas',
    block: 'market',
    kind: 'multi',
    choices: TEMPS2_ANSWER_OPTIONS.decision_maker_personas,
    allowOther: true,
  },
  {
    key: 'no_go_sectors',
    block: 'market',
    kind: 'multi',
    choices: TEMPS2_ANSWER_OPTIONS.no_go_sectors,
    allowOther: true,
  },
  { key: 'portfolio_size', block: 'market', kind: 'single', choices: opt('portfolio_size') },
  {
    key: 'accounts_relationship_status',
    block: 'market',
    kind: 'single',
    choices: opt('accounts_relationship_status'),
  },
  {
    key: 'go_to_market_channels',
    block: 'market',
    kind: 'multi',
    choices: opt('go_to_market_channels'),
  },
  // #2036.9 — l'ambition territoriale déclarée : PAS `geo_zones` (où le
  // vendeur intervient déjà / a des relations), une zone qu'il SOUHAITE
  // développer. #2036.10 : jamais lue comme une capacité (GA-338).
  {
    key: 'growth_target_zones',
    block: 'market',
    kind: 'multi',
    choices: ESN_ANSWER_OPTIONS.geo_zones,
  },
  {
    key: 'public_sector_practice',
    block: 'market',
    kind: 'single',
    choices: opt('public_sector_practice'),
    when: targetsPublicSector,
  },
  {
    key: 'regulated_sector_readiness',
    block: 'market',
    kind: 'single',
    choices: opt('regulated_sector_readiness'),
    when: targetsRegulatedSector,
  },
  {
    key: 'partner_relationship',
    block: 'market',
    kind: 'single',
    choices: opt('partner_relationship'),
    when: worksThroughPartners,
  },
  // #2067.2 — décision Louis du 18/09/2026 : AVEC COMBIEN de partenaires,
  // réguliers puis ponctuels, derrière le MÊME prédicat que la relation
  // ci-dessus — jamais demandé à qui vend en direct seul.
  {
    key: 'partners_regular_count',
    block: 'market',
    kind: 'single',
    choices: opt('partners_regular_count'),
    when: worksThroughPartners,
  },
  {
    key: 'partners_occasional_count',
    block: 'market',
    kind: 'single',
    choices: opt('partners_occasional_count'),
    when: worksThroughPartners,
  },

  // #2056 — appels d'offres : brancé sur `pursuesRfps`, pas seulement le
  // secteur public (voir le commentaire du prédicat).
  { key: 'rfp_platforms_used', block: 'market', kind: 'tags', when: pursuesRfps },
  {
    key: 'rfp_referencing_status',
    block: 'market',
    kind: 'single',
    choices: opt('rfp_referencing_status'),
    when: pursuesRfps,
  },
  { key: 'rfp_lot_allocation', block: 'market', kind: 'single', choices: opt('rfp_lot_allocation'), when: pursuesRfps },
  {
    key: 'rfp_response_templates',
    block: 'market',
    kind: 'single',
    choices: opt('rfp_response_templates'),
    when: pursuesRfps,
  },
  { key: 'rfp_volume', block: 'market', kind: 'single', choices: opt('rfp_volume'), when: pursuesRfps },
  { key: 'rfp_volume_period', block: 'market', kind: 'single', choices: opt('rfp_volume_period'), when: pursuesRfps },
  {
    key: 'rfp_outcomes',
    block: 'market',
    kind: 'multi',
    choices: opt('rfp_outcomes'),
    when: pursuesRfps,
  },
  {
    key: 'rfp_go_no_go_process',
    block: 'market',
    kind: 'single',
    choices: opt('rfp_go_no_go_process'),
    when: pursuesRfps,
  },
  {
    key: 'rfp_document_readiness',
    block: 'market',
    kind: 'single',
    choices: opt('rfp_document_readiness'),
    when: pursuesRfps,
  },
  // #2056.11 — l'économie du dossier.
  { key: 'rfp_deal_value', block: 'market', kind: 'single', choices: opt('rfp_deal_value'), when: pursuesRfps },
  // #2057.10 — l'owner.
  {
    key: 'rfp_owner_assignment',
    block: 'market',
    kind: 'single',
    choices: opt('rfp_owner_assignment'),
    when: pursuesRfps,
  },

  // ── E ──
  { key: 'weekly_calls', block: 'routine', kind: 'single', choices: opt('weekly_calls') },
  { key: 'weekly_emails', block: 'routine', kind: 'single', choices: opt('weekly_emails') },
  { key: 'weekly_linkedin', block: 'routine', kind: 'single', choices: opt('weekly_linkedin') },
  { key: 'sales_routine', block: 'routine', kind: 'multi', choices: opt('sales_routine') },
  // Q26 du rapport — déjà posée au Temps 2, déjà lue par les prompts plan et
  // stratégie : on la garde à sa place, dans le bloc « routine ».
  { key: 'avg_sales_cycle', block: 'routine', kind: 'single', choices: TEMPS2_ANSWER_OPTIONS.avg_sales_cycle },

  // #2057 — contenu : branché sur `doesContentMarketing`, jamais posé à qui ne
  // fait aucune activité LinkedIn déclarée.
  {
    key: 'content_active_profile',
    block: 'routine',
    kind: 'multi',
    choices: opt('content_active_profile'),
    when: doesContentMarketing,
  },
  {
    key: 'content_audience_size',
    block: 'routine',
    kind: 'single',
    choices: opt('content_audience_size'),
    when: doesContentMarketing,
  },
  { key: 'content_visible_expertise', block: 'routine', kind: 'tags', when: doesContentMarketing },
  {
    key: 'content_reactions',
    block: 'routine',
    kind: 'single',
    choices: opt('content_reactions'),
    when: doesContentMarketing,
  },
  {
    key: 'content_conversations_generated',
    block: 'routine',
    kind: 'single',
    choices: opt('content_conversations_generated'),
    when: doesContentMarketing,
  },
  {
    key: 'content_funnel_stages_reached',
    block: 'routine',
    kind: 'multi',
    choices: opt('content_funnel_stages_reached'),
    when: doesContentMarketing,
  },

  // ── F ──
  { key: 'sales_blockers', block: 'maturity', kind: 'multi', choices: opt('sales_blockers') },
  {
    key: 'tooling',
    block: 'maturity',
    kind: 'multi',
    choices: opt('tooling'),
    // #2031.10 — on retire le choix déduit, on ne supprime pas la question :
    // un CRM branché ne dit rien d'Outlook, d'un agenda ou d'un outil de
    // séquence. Elle ne disparaît que si LA TOTALITÉ des choix est déduite.
    when: (_answers, ctx) => remainingToolingChoices(ctx).length > 0,
    resolveChoices: ctx => remainingToolingChoices(ctx),
  },
  { key: 'proactivity_level', block: 'maturity', kind: 'single', choices: opt('proactivity_level') },
  {
    key: 'shared_data_scope',
    block: 'maturity',
    kind: 'multi',
    choices: opt('shared_data_scope'),
    // Partager quoi, avec qui, quand on est seul ?
    when: answers => !worksAlone(answers),
  },
  // #2058.2 — les DEUX derniers points qui tenaient #2058 ouverte. Posées à
  // tout le monde, comme `proactivity_level` juste au-dessus : aucune porte
  // ne les masque.
  {
    key: 'contact_windows',
    block: 'maturity',
    kind: 'multi',
    choices: opt('contact_windows'),
  },
  // #2058.10
  { key: 'detail_level', block: 'maturity', kind: 'single', choices: opt('detail_level') },
]

/**
 * Les questions à poser, dans l'ordre, compte tenu de ce qui est déjà répondu
 * et de ce que l'app sait par ailleurs. C'est LA fonction que l'écran et l'API
 * appellent tous les deux — un total calculé deux fois divergerait.
 */
export function visibleProfileQuestions(
  answers: Partial<EsnAnswers>,
  context: ProfileQuestionContext = DEFAULT_QUESTION_CONTEXT,
): readonly ProfileQuestion[] {
  return PROFILE_QUESTIONS.filter(q => (q.when ? q.when(answers, context) : true)).map(q =>
    q.resolveChoices ? { ...q, choices: q.resolveChoices(context) } : q,
  )
}

/** Une réponse est-elle renseignée ? (une case vide ou un tableau vide, non). */
export function isProfileAnswerFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'string' && value.trim().length > 0
}

/** Avancement : répondues / à poser. Sert la barre de progression ET le
 *  compteur de la carte d'invitation, qui doivent dire le même chiffre. */
export function profileQuestionnaireProgress(
  answers: Partial<EsnAnswers>,
  context: ProfileQuestionContext = DEFAULT_QUESTION_CONTEXT,
): { answered: number; total: number } {
  const visible = visibleProfileQuestions(answers, context)
  const answered = visible.filter(q => isProfileAnswerFilled(answers[q.key as keyof EsnAnswers])).length
  return { answered, total: visible.length }
}

/** Les questions d'un bloc, une fois le branchement appliqué. Un bloc peut se
 *  retrouver VIDE (tout masqué) — l'écran doit alors le sauter, pas afficher
 *  une page blanche. */
export function questionsOfBlock(
  block: ProfileBlock,
  answers: Partial<EsnAnswers>,
  context: ProfileQuestionContext = DEFAULT_QUESTION_CONTEXT,
): readonly ProfileQuestion[] {
  return visibleProfileQuestions(answers, context).filter(q => q.block === block)
}

/** Les blocs qui ont au moins une question à poser, dans l'ordre du rapport. */
export function visibleProfileBlocks(
  answers: Partial<EsnAnswers>,
  context: ProfileQuestionContext = DEFAULT_QUESTION_CONTEXT,
): readonly ProfileBlock[] {
  return PROFILE_BLOCKS.filter(b => questionsOfBlock(b, answers, context).length > 0)
}

/* -------------------------------------------------------------------------- */
/*  « Voici ce que Bellum a compris » (§28, sortie attendue)                   */
/* -------------------------------------------------------------------------- */

/** Une ligne de synthèse : ce qui a été compris, et ce que ça change. */
export type ProfileUnderstanding = {
  /** Clé i18n de la conséquence (`profileQuestions.summary.<id>`). */
  id: string
  /** Valeurs de l'utilisateur citées telles quelles dans la phrase. */
  values: string[]
}

/**
 * Ce que le questionnaire change, dit à l'utilisateur — jamais une promesse
 * générique. Chaque ligne n'apparaît QUE si la réponse existe : une synthèse
 * qui parlerait d'un objectif jamais renseigné serait de la donnée inventée.
 */
export function summariseProfileUnderstanding(answers: Partial<EsnAnswers>): ProfileUnderstanding[] {
  const out: ProfileUnderstanding[] = []
  const push = (id: string, ...values: (string | null | undefined)[]) => {
    const kept = values.map(v => v?.trim()).filter((v): v is string => Boolean(v))
    if (kept.length > 0) out.push({ id, values: kept })
  }

  push('role', answers.user_role)
  push('goal', answers.individual_goal, answers.monthly_target)
  if (answers.target_sectors?.length) out.push({ id: 'sectors', values: [...answers.target_sectors] })
  if (answers.go_to_market_channels?.length) out.push({ id: 'channels', values: [...answers.go_to_market_channels] })
  push('capacity', answers.ramp_up_capacity, answers.avg_deal_size)
  if (answers.sales_blockers?.length) out.push({ id: 'blockers', values: [...answers.sales_blockers] })
  push('proactivity', answers.proactivity_level)
  if (answers.shared_data_scope?.length) out.push({ id: 'sharing', values: [...answers.shared_data_scope] })
  // #2058.2 / #2058.10 — même règle de silence : une réponse non renseignée
  // ne produit aucune ligne.
  if (answers.contact_windows?.length) out.push({ id: 'contact_windows', values: [...answers.contact_windows] })
  push('detail_level', answers.detail_level)
  return out
}
