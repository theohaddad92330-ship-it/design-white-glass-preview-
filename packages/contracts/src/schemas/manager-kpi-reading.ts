/**
 * #3415 — « cause et tendance sur les 64 indicateurs du dictionnaire » (recette
 * prod 30/09). Le dictionnaire ne porte aucune valeur (voir `manager-kpi.ts`) :
 * il dit donc, pour chaque indicateur, QUELLE tendance inquiète et QUELLE cause
 * chercher d'abord — la lecture, pas la mesure. Une cause ici est une piste
 * d'enquête du métier (« souvent »), jamais un diagnostic posé sur un chiffre.
 *
 * Vit dans son propre fichier et se résout par la clé de l'indicateur, comme
 * `KPI_TARGETS` : un texte écrit à un seul endroit (GA-26), jamais recopié dans
 * soixante entrées. La garde `manager-kpi-reading.test.ts` refuse un
 * indicateur sans lecture et une lecture sans indicateur.
 */
import type { StockMetricKey } from './stock-snapshot.js'

type KpiWorryingTrend = 'down' | 'up' | 'either'

type KpiReading = { readonly trend: KpiWorryingTrend; readonly cause: string }

export const KPI_READINGS: Readonly<Record<string, KpiReading>> = {
  accounts_opened: {
    trend: 'down',
    cause: 'La file de priorisation est vide ou la porte de priorisation est trop stricte.',
  },
  pipeline_amount: {
    trend: 'down',
    cause: 'Peu de comptes suivis portent un projet ouvert : l’amont n’alimente plus le pipe.',
  },
  stage_age_days: {
    trend: 'up',
    cause: 'Des projets attendent une décision client ou n’ont plus de prochaine action posée.',
  },
  accounts_without_next_action: {
    trend: 'up',
    cause: 'Le suivi se fait de mémoire : les actions ne sont pas saisies après chaque échange.',
  },
  signal_to_action_days: {
    trend: 'up',
    cause: 'Les signaux arrivent sans routine de veille qui les transforme en action.',
  },
  detected_to_qualified: {
    trend: 'down',
    cause: 'Les critères de détection sont trop larges : le volume monte, la qualité baisse.',
  },
  meetings_held: {
    trend: 'down',
    cause: 'La prospection a ralenti, ou les relances ne débouchent plus sur un rendez-vous.',
  },
  reply_rate: { trend: 'down', cause: 'L’angle du message ne parle pas au destinataire, ou la cible est mal choisie.' },
  projects_won: {
    trend: 'down',
    cause: 'Moins de propositions en fin de cycle, ou des propositions qui ne convainquent plus.',
  },
  win_rate: {
    trend: 'down',
    cause: 'Positionnement ou prix décalés sur les derniers dossiers : les motifs de perte le disent.',
  },
  rfp_win_rate: { trend: 'down', cause: 'On répond à des appels d’offres où le rang 1 est déjà verrouillé.' },
  rank1_access_obtained: {
    trend: 'down',
    cause: 'L’effort de référencement porte sur des comptes où un partenaire tient déjà la place.',
  },
  known_availability_rate: {
    trend: 'down',
    cause: 'Les disponibilités des consultants ne sont plus revérifiées régulièrement.',
  },
  need_to_shortlist_days: {
    trend: 'up',
    cause: 'Le matching démarre à la première relance client au lieu de l’ouverture du besoin.',
  },
  shortlist_to_submission_days: {
    trend: 'up',
    cause: 'Personne n’est nommé pour valider le dossier avant envoi au client.',
  },
  needs_without_shortlist: {
    trend: 'up',
    cause: 'Des besoins sont jugés non staffables sans l’avoir écrit, ou ne sont pas traités.',
  },
  unstaffable_rate: {
    trend: 'up',
    cause: 'Un trou de compétence récurrent dans le vivier, pas un problème de recherche.',
  },
  proven_skills_rate: {
    trend: 'down',
    cause: 'Le référentiel se nourrit de CV déclaratifs plutôt que de missions tenues.',
  },
  profiles_per_need: {
    trend: 'either',
    cause: 'Trop haut : envoi en rafale sans tri. Trop bas : vivier étroit sur ce besoin.',
  },
  submission_win_rate: {
    trend: 'down',
    cause: 'Le ciblage des besoins ou l’adéquation des profils est en cause avant la rédaction.',
  },
  time_to_feedback_days: {
    trend: 'up',
    cause: 'Le client n’a pas de date de retour convenue, ou la relance n’est pas planifiée.',
  },
  interview_conversion: { trend: 'down', cause: 'L’entretien sert à qualifier ce qui aurait dû l’être avant.' },
  time_to_fill_days: {
    trend: 'up',
    cause: 'Le retard se loge entre la shortlist et le retour client, pas dans la recherche.',
  },
  missions_active: {
    trend: 'down',
    cause: 'Fins de mission non remplacées : le pipe ne se convertit pas assez vite en démarrages.',
  },
  missions_without_end_date: { trend: 'up', cause: 'Les dates de fin ne sont pas saisies au démarrage de la mission.' },
  missions_ending_without_plan: {
    trend: 'up',
    cause: 'La revue de renouvellement n’est pas déclenchée avant la fin de mission.',
  },
  bench_rate: {
    trend: 'up',
    cause: 'Des fins de mission non anticipées, ou des profils difficiles à placer au tarif visé.',
  },
  bench_duration_days: {
    trend: 'up',
    cause: 'Toujours les mêmes profils en intercontrat : un manque de demande sur leur compétence.',
  },
  timesheets_on_time: {
    trend: 'down',
    cause: 'Les relances de CRA partent trop tard ou visent les attendus plutôt que les manquants.',
  },
  timesheet_gaps: {
    trend: 'up',
    cause: 'Des écarts jamais expliqués après saisie : le contrôle de cohérence n’est pas fait.',
  },
  missions_at_risk: {
    trend: 'up',
    cause: 'Signaux de delivery dégradés (incidents, retours, CRA) sur plusieurs axes à la fois.',
  },
  unmeasurable_missions: {
    trend: 'up',
    cause: 'Des missions sans assez de données pour évaluer leur risque : la saisie manque.',
  },
  renewal_rate: {
    trend: 'down',
    cause: 'Fins de mission sans plan de renouvellement, ou satisfaction client en baisse.',
  },
  assignments_without_rate: { trend: 'up', cause: 'Le TJM n’est pas saisi à la création de l’affectation.' },
  client_nps: { trend: 'down', cause: 'Un incident de delivery récent, ou un manque de suivi en cours de mission.' },
  consultant_nps: { trend: 'down', cause: 'Intercontrat subi, mission peu motivante ou manque d’accompagnement.' },
  delivery_incidents: { trend: 'up', cause: 'Un cadrage initial insuffisant sur les missions concernées.' },
  proofs_collected: {
    trend: 'down',
    cause: 'Le retour d’expérience n’est pas prévu dans la chaîne de fin de mission.',
  },
  proofs_usable: { trend: 'down', cause: 'L’accord du client n’est pas demandé au moment de la collecte.' },
  proofs_reused: {
    trend: 'down',
    cause: 'La recherche dans la bibliothèque est peu pratique : le contenu existe mais ne se trouve pas.',
  },
  sector_coverage: { trend: 'down', cause: 'La collecte de preuves ne suit pas les secteurs où le pipe est ouvert.' },
  partners_identified: {
    trend: 'down',
    cause: 'La détection de rang 1 n’est pas lancée sur les comptes prioritaires.',
  },
  skills_referential_coverage: {
    trend: 'down',
    cause: 'De nouveaux termes de CV arrivent sans être rattachés au référentiel.',
  },
  pending_skill_aliases: { trend: 'up', cause: 'La file d’alias n’est traitée par personne.' },
  accounts_with_plan: {
    trend: 'down',
    cause: 'Des plans vieillissent sans relance d’analyse après un nouveau signal.',
  },
  rex_per_mission: { trend: 'down', cause: 'Le retour d’expérience est oublié une fois la mission terminée.' },
  proof_to_win_contribution: {
    trend: 'down',
    cause: 'La bibliothèque contient des preuves qui ne servent pas les arguments de vente.',
  },
  revenue_signed: { trend: 'down', cause: 'Moins de signatures : regarder le pipe en amont et le taux de réussite.' },
  revenue_produced: {
    trend: 'down',
    cause: 'Démarrages de mission retardés, intercontrat en hausse, ou relevés manquants.',
  },
  revenue_invoiced: {
    trend: 'down',
    cause: 'Des bloqueurs de facturation nommés (CRA manquants, TJM absents) retiennent la facture.',
  },
  revenue_collected: {
    trend: 'down',
    cause: 'Factures impayées non relancées, ou délai de paiement client qui s’allonge.',
  },
  gross_margin: {
    trend: 'down',
    cause: 'TJM négociés à la baisse, ou coût des profils en hausse sur les missions récentes.',
  },
  unmeasured_margin: {
    trend: 'up',
    cause: 'Des affectations sans TJM ou sans coût : la marge annoncée couvre moins de missions.',
  },
  timesheets_received: {
    trend: 'down',
    cause: 'Des relevés manquent à la clôture : relance tardive ou forfaits mal classés.',
  },
  dso_days: {
    trend: 'up',
    cause: 'Un ou deux gros clients paient plus tard, ou la relance d’impayés est irrégulière.',
  },
  client_concentration_top_account: {
    trend: 'up',
    cause: 'Le premier compte grossit pendant que l’ouverture de nouveaux comptes stagne.',
  },
  revenue_growth: {
    trend: 'down',
    cause: 'Pipe insuffisant il y a quelques mois, ou fins de mission non renouvelées.',
  },
  signup_to_first_import_days: { trend: 'up', cause: 'L’espace reste vide : le premier import n’est pas accompagné.' },
  auto_captured_activities: { trend: 'down', cause: 'Un connecteur a perdu son accès : l’équipe ressaisit à la main.' },
  connectors_operational: {
    trend: 'down',
    cause: 'Un accès a expiré ou une portée manque : la panne est silencieuse tant qu’on ne lit pas.',
  },
  active_members: { trend: 'down', cause: 'Des sièges payés ne sont plus utilisés, souvent faute d’onboarding.' },
  credits_consumed_ratio: {
    trend: 'up',
    cause: 'Des analyses lancées sans arbitrage, ou un pic d’usage sur une seule semaine.',
  },
  routines_active: {
    trend: 'down',
    cause: 'Les automatisations n’ont pas été activées, ou ont été coupées après une alerte.',
  },
  proactivity_suppressed: {
    trend: 'up',
    cause: 'Trop d’alertes produites pour ce que l’équipe peut traiter : le plafond les retient.',
  },
}

/**
 * #3415 (recette prod 02/10) — la tendance MESURÉE : quels indicateurs du
 * dictionnaire ont une photo mensuelle (`GET /pilotage/metric-series`). Résolue
 * par la clé, écrite à un seul endroit (GA-26). Un indicateur absent d'ici n'a
 * AUCUNE photo : l'écran n'écrit pas de tendance pour lui (jamais « 0 », jamais
 * une tendance inventée) ; le brancher = ajouter sa métrique à
 * `STOCK_METRIC_KEYS` (contrainte SQL élargie d'abord), puis une ligne ici.
 */
export const KPI_MEASURED_TREND_METRIC: Readonly<Record<string, StockMetricKey>> = {
  accounts_without_next_action: 'accounts_without_next_action',
  missions_without_end_date: 'missions_without_end_date',
  // Même compteur : `OpenNeedsCounters.withoutShortlist` (population `total`) — la photo l'écrit
  // sous `needs_without_positioning` (`stock-snapshot.service.ts`, source `needs`).
  needs_without_shortlist: 'needs_without_positioning',
}
