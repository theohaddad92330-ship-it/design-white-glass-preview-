import { WEEKLY_SALES_TIME_BANDS } from './onboarding/answers-temps.js'
import { PRIORITY_SECTORS_NUDGE_THRESHOLD, prioritySectorCount } from './onboarding/answers-secteurs-niveaux.js'
import { coverageModeOf, ESN_ANSWER_OPTIONS, type EsnAnswers } from './onboarding.js'
import { PROFILE_QUESTION_OPTIONS } from './profile-questionnaire.js'

/**
 * #2029 — LE QUESTIONNAIRE NOMME SES CONTRADICTIONS.
 *
 * Même doctrine que le moteur d'audit (`apps/ia/app/prompts/bellum_profiler.py`,
 * bloc contradictions) : « deux réponses qui se contredisent ne prouvent pas
 * qu'une des deux est fausse — nommer la tension sur un ton non accusatoire,
 * comme un point à vérifier, jamais une contre-affirmation qui invente le fait
 * à la place de l'utilisateur ». Ce fichier est le pendant côté ÉCRAN de ce qui
 * est déjà écrit côté prompt : huit détecteurs PURS, chacun une tension entre
 * deux réponses réellement collectées — jamais une troisième valeur devinée.
 *
 * ⚠️ Une contradiction ne SUPPRIME jamais une réponse, ne la corrige jamais
 * toute seule, et ne bloque jamais l'avancement (#2029.10/.11) : ce fichier ne
 * fait que DÉTECTER, la résolution (expliquer / corriger / maintenir les deux)
 * vit côté écran (`apps/web/src/features/onboarding/lib/onboarding-contradictions.ts`).
 *
 * ⚠️ « Non mesuré n'est jamais 0 » s'applique ICI aussi : un champ optionnel
 * jamais répondu (`undefined`/`[]`) ne déclenche RIEN — seule une valeur RÉELLEMENT
 * déclarée (y compris une valeur de catalogue qui EST un zéro assumé, comme
 * « Je n'ai pas d'équipe commerciale dédiée » ou « 0 » pour le vivier) peut
 * entrer dans un détecteur. « On n'a pas détecté de contradiction » n'est donc
 * jamais « il n'y en a pas » : c'est peut-être seulement qu'il manque une
 * réponse pour la voir.
 */

export type QuestionnaireContradictionId =
  | 'small_team_many_sectors' // #2029.1
  | 'no_sales_capacity_large_portfolio' // #2029.2
  | 'niche_wide_offer' // #2029.3
  | 'high_target_low_time' // #2029.4
  | 'big_accounts_no_access' // #2029.5
  | 'freelance_only_no_bench' // #2029.6
  | 'distant_zones_no_reach' // #2029.7
  | 'acquisition_priority_no_outbound' // #2029.8
  | 'too_many_priority_sectors' // #2041.1 — ajouté EN FIN (GA-08)

export type QuestionnaireContradiction = {
  id: QuestionnaireContradictionId
  /** Les clés de réponse en tension — une seule pour #2029.7 (deux VALEURS de
   *  la même question multi-choix s'y opposent, pas deux champs). */
  keys: readonly (keyof EsnAnswers)[]
}

type Answers = Partial<EsnAnswers>

const filledArray = (v: readonly string[] | undefined | null): readonly string[] => v ?? []
const isFilledText = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim().length > 0

/**
 * #2029.1 — équipe très petite + dix secteurs prioritaires.
 *
 * « Très petite » : les deux bandes les plus basses du catalogue
 * (`ESN_ANSWER_OPTIONS.sales_team_size`) — pas « aucune équipe dédiée »
 * (#2029.2, une tension différente). Dix secteurs ou plus sur les vingt-deux du
 * catalogue `target_sectors` : au-delà, « prioritaire » cesse de trier quoi que
 * ce soit.
 */
const VERY_SMALL_TEAM_SIZES: readonly string[] = [
  ESN_ANSWER_OPTIONS.sales_team_size[0], // « Je suis seul (fondateur / indépendant) »
  ESN_ANSWER_OPTIONS.sales_team_size[1], // « 2-3 personnes »
]
const MANY_PRIORITY_SECTORS_THRESHOLD = 10

export function hasSmallTeamWithManySectors(answers: Answers): boolean {
  const size = answers.sales_team_size
  if (!size || !VERY_SMALL_TEAM_SIZES.includes(size)) return false
  return filledArray(answers.target_sectors).length >= MANY_PRIORITY_SECTORS_THRESHOLD
}

/**
 * #2029.2 — aucune capacité commerciale + cinquante comptes actifs (ou plus).
 *
 * `portfolio_size` est une question du profil progressif (optionnelle,
 * hors Temps 1) : elle ne peut déclencher la tension que si elle a
 * effectivement été répondue — sa seule présence dans `answers` (au lieu de
 * `undefined`) suffit à la distinguer d'une absence.
 */
const NO_DEDICATED_SALES_TEAM = ESN_ANSWER_OPTIONS.sales_team_size[5] // « Je n'ai pas d'équipe commerciale dédiée »
const LARGE_PORTFOLIO_BANDS: readonly string[] = [
  PROFILE_QUESTION_OPTIONS.portfolio_size[4], // '31-60'
  PROFILE_QUESTION_OPTIONS.portfolio_size[5], // '61-100'
  PROFILE_QUESTION_OPTIONS.portfolio_size[6], // '100+'
]

export function hasNoSalesCapacityWithLargePortfolio(answers: Answers): boolean {
  if (answers.sales_team_size !== NO_DEDICATED_SALES_TEAM) return false
  const portfolio = answers.portfolio_size
  return !!portfolio && LARGE_PORTFOLIO_BANDS.includes(portfolio)
}

/**
 * #2029.3 — niche annoncée + offre très large.
 *
 * Le libellé même du positionnement « niche » dit « spécialisé sur 1-2
 * domaines pointus » (`ESN_ANSWER_OPTIONS.positioning[0]`) : le seuil de six
 * expertises cochées est volontairement large — le TRIPLE de la borne haute
 * que l'utilisateur a lui-même lue en choisissant ce positionnement — pour ne
 * jamais avertir sur un cas frontière (3 ou 4 domaines).
 */
const WIDE_EXPERTISE_THRESHOLD_FOR_NICHE = 6

export function hasNicheWithWideOffer(answers: Answers): boolean {
  if (coverageModeOf(answers.positioning) !== 'specialist') return false
  return filledArray(answers.expertise_areas).length >= WIDE_EXPERTISE_THRESHOLD_FOR_NICHE
}

/**
 * #2029.4 — objectif élevé + une heure disponible.
 *
 * « Une heure disponible » : les deux bandes les plus basses de
 * {@link WEEKLY_SALES_TIME_BANDS} (Temps 1, `tempsStep`). « Objectif élevé » :
 * la borne haute de chacune des deux échelles de `monthly_target` (rendez-vous
 * ou comptes — profil progressif, optionnel).
 */
const LOW_TIME_BANDS: readonly string[] = [WEEKLY_SALES_TIME_BANDS[0], WEEKLY_SALES_TIME_BANDS[1]]
const HIGH_MONTHLY_TARGETS: readonly string[] = [
  PROFILE_QUESTION_OPTIONS.monthly_target[4], // '20+ RDV'
  PROFILE_QUESTION_OPTIONS.monthly_target[8], // '6+ comptes'
]

export function hasHighTargetWithLowTime(answers: Answers): boolean {
  const time = answers.weekly_sales_time_declared
  if (!time || !LOW_TIME_BANDS.includes(time)) return false
  const target = answers.monthly_target
  return !!target && HIGH_MONTHLY_TARGETS.includes(target)
}

/**
 * #2029.5 — grands comptes visés + aucun accès ni référence.
 *
 * `entry_channels_used` vide veut dire NON RÉPONDU (`validate()` exige au
 * moins un choix dès que la question est atteinte) : ce cas ne déclenche
 * jamais rien, exactement la même prudence que {@link channelAuditBuckets}.
 * Les quatre canaux « de confiance » sont ceux qui supposent déjà une relation
 * ou une crédibilité établie — à l'opposé du travail à froid.
 */
const BIG_ACCOUNTS_TYPE = ESN_ANSWER_OPTIONS.target_company_types[0] // « CAC40 / SBF120 (grands comptes) »
// Exporté : l'écran (`onboarding-contradictions.ts`, web) le cite pour composer
// la phrase « Tu m'as indiqué X et Y… » sans recopier le catalogue (GA-26).
export const TRUSTED_ACCESS_CHANNELS: readonly string[] = [
  'Réseau personnel et anciens clients',
  'Partenaires et rang 2',
  "Appels d'offres et consultations",
  'Consultants en mission',
]

export function hasBigAccountsWithNoAccess(answers: Answers): boolean {
  if (!filledArray(answers.target_company_types).includes(BIG_ACCOUNTS_TYPE)) return false
  const used = filledArray(answers.entry_channels_used)
  if (used.length === 0) return false
  if (used.some(channel => TRUSTED_ACCESS_CHANNELS.includes(channel))) return false
  return !filledArray(answers.client_references).some(isFilledText)
}

/**
 * #2029.6 — freelance + aucune disponibilité au vivier.
 *
 * `consultants_in_pipe === '0'` est un ZÉRO DÉCLARÉ (une valeur du catalogue,
 * pas une absence de réponse) : c'est ce qui le distingue d'un `undefined`.
 */
const FREELANCE_ONLY_STAFFING = ESN_ANSWER_OPTIONS.staffing_model[4] // « Uniquement freelances (pas de CDI) »
const EMPTY_PIPE = '0'

export function hasFreelanceOnlyWithNoBench(answers: Answers): boolean {
  if (answers.staffing_model !== FREELANCE_ONLY_STAFFING) return false
  return answers.consultants_in_pipe === EMPTY_PIPE
}

/**
 * #2029.7 — deux zones géographiques éloignées, sans justification de portée
 * nationale.
 *
 * Heuristique volontairement simple et NOMMÉE : trois zones au nord, trois au
 * sud (les extrémités du territoire, jamais les zones centrales — Paris,
 * Lyon, Nantes — qui resteraient ambiguës). La présence de « Full remote »,
 * « National » ou « International » est la justification qui désamorce la
 * tension : l'utilisateur a alors déjà dit qu'il couvre tout le territoire.
 */
export const NORTH_EXTREMITY_ZONES: readonly string[] = [
  ESN_ANSWER_OPTIONS.geo_zones[2], // « Lille & Hauts-de-France »
  ESN_ANSWER_OPTIONS.geo_zones[7], // « Strasbourg & Grand Est »
  ESN_ANSWER_OPTIONS.geo_zones[8], // « Rennes & Bretagne »
]
export const SOUTH_EXTREMITY_ZONES: readonly string[] = [
  ESN_ANSWER_OPTIONS.geo_zones[4], // « Bordeaux & Nouvelle-Aquitaine »
  ESN_ANSWER_OPTIONS.geo_zones[5], // « Toulouse & Occitanie »
  ESN_ANSWER_OPTIONS.geo_zones[6], // « Marseille & PACA »
]
const NATIONAL_REACH_JUSTIFICATIONS: readonly string[] = [
  ESN_ANSWER_OPTIONS.geo_zones[9], // « Full remote (pas de contrainte géo) »
  ESN_ANSWER_OPTIONS.geo_zones[10], // « National (toute la France) »
  ESN_ANSWER_OPTIONS.geo_zones[11], // « International »
]

export function hasDistantZonesWithoutReach(answers: Answers): boolean {
  const zones = filledArray(answers.geo_zones)
  if (zones.some(zone => NATIONAL_REACH_JUSTIFICATIONS.includes(zone))) return false
  const north = zones.find(zone => NORTH_EXTREMITY_ZONES.includes(zone))
  const south = zones.find(zone => SOUTH_EXTREMITY_ZONES.includes(zone))
  return !!north && !!south
}

/**
 * #2029.8 — priorité acquisition + aucune action sortante.
 *
 * Les trois canaux « sortants » sont ceux qu'on déclenche soi-même (appel,
 * e-mail, message) — à l'opposé des canaux qu'on subit ou qu'on entretient
 * (demandes entrantes, réseau, événements). `entry_channels_used` vide veut
 * dire non répondu, même prudence que #2029.5.
 */
const ACQUISITION_GOAL = PROFILE_QUESTION_OPTIONS.individual_goal[0] // « Ouvrir de nouveaux comptes »
export const OUTBOUND_CHANNELS: readonly string[] = [
  'Appels sortants',
  'E-mails de prospection',
  'Réseaux sociaux professionnels',
]

export function hasAcquisitionPriorityWithNoOutbound(answers: Answers): boolean {
  if (answers.individual_goal !== ACQUISITION_GOAL) return false
  const used = filledArray(answers.entry_channels_used)
  if (used.length === 0) return false
  return !used.some(channel => OUTBOUND_CHANNELS.includes(channel))
}

/**
 * #2041.1 — plus de deux secteurs déclarés PRIORITAIRES.
 *
 * Distincte de #2029.1 (`small_team_many_sectors`), et il faut le dire : celle-là
 * regarde un ÉQUILIBRE — une toute petite équipe en face de dix secteurs visés,
 * et elle se tait dès que l'équipe grandit. Celle-ci ne regarde aucune
 * ressource : elle regarde le MOT. Au-delà de deux, « prioritaire » ne désigne
 * plus un choix, quelle que soit la taille de l'ESN.
 *
 * Elle lit le COMPTE dérivé (`prioritySectorCount`), pas
 * `priority_sectors.length` : un secteur à la fois prioritaire et refusé est
 * classé `no_go`, et la relance dirait sinon autre chose que l'écran d'à côté.
 * Le seuil vit à un seul endroit (`answers-secteurs-niveaux.ts`, GA-26) — le
 * recopier ici le ferait diverger au premier réglage.
 *
 * ⚠️ Une liste VIDE ne déclenche rien : « personne n'a répondu » n'est pas
 * « zéro secteur prioritaire », et la comparaison est STRICTEMENT au-dessus du
 * seuil — deux priorités, c'est exactement ce que l'issue autorise.
 */
export function hasTooManyPrioritySectors(answers: Answers): boolean {
  return prioritySectorCount(answers) > PRIORITY_SECTORS_NUDGE_THRESHOLD
}

const DETECTORS: ReadonlyArray<{
  id: QuestionnaireContradictionId
  test: (answers: Answers) => boolean
  keys: readonly (keyof EsnAnswers)[]
}> = [
  { id: 'small_team_many_sectors', test: hasSmallTeamWithManySectors, keys: ['sales_team_size', 'target_sectors'] },
  {
    id: 'no_sales_capacity_large_portfolio',
    test: hasNoSalesCapacityWithLargePortfolio,
    keys: ['sales_team_size', 'portfolio_size'],
  },
  { id: 'niche_wide_offer', test: hasNicheWithWideOffer, keys: ['positioning', 'expertise_areas'] },
  {
    id: 'high_target_low_time',
    test: hasHighTargetWithLowTime,
    keys: ['monthly_target', 'weekly_sales_time_declared'],
  },
  {
    id: 'big_accounts_no_access',
    test: hasBigAccountsWithNoAccess,
    keys: ['target_company_types', 'entry_channels_used', 'client_references'],
  },
  { id: 'freelance_only_no_bench', test: hasFreelanceOnlyWithNoBench, keys: ['staffing_model', 'consultants_in_pipe'] },
  { id: 'distant_zones_no_reach', test: hasDistantZonesWithoutReach, keys: ['geo_zones'] },
  {
    id: 'acquisition_priority_no_outbound',
    test: hasAcquisitionPriorityWithNoOutbound,
    keys: ['individual_goal', 'entry_channels_used'],
  },
  // #2041.1 — ajouté EN FIN. Une seule clé en tension : ce sont deux VALEURS de
  // la même réponse qui s'opposent (comme #2029.7), pas deux champs.
  { id: 'too_many_priority_sectors', test: hasTooManyPrioritySectors, keys: ['priority_sectors'] },
]

/** Les neuf détecteurs, dans l'ordre de #2029.1 → #2029.8, puis #2041.1. */
export function detectQuestionnaireContradictions(answers: Answers): QuestionnaireContradiction[] {
  return DETECTORS.filter(detector => detector.test(answers)).map(detector => ({
    id: detector.id,
    keys: detector.keys,
  }))
}
