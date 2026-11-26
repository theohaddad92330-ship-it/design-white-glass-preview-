import { z } from 'zod'
import type { ManagerKpi } from './manager-kpi.js'

/**
 * BEL-SC-242 (#3271) — « vues par rôle » du pilotage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE C'EST, ET CE QUE CE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La spec demande cinq tableaux de bord distincts, un par fonction, avec des
 * KPI DIFFÉRENTS — et son NO-GO refuse explicitement « le même dashboard et les
 * mêmes KPI affichés à tous les rôles ». Mais `c76_role_reordonne_jamais_ne_
 * filtre` (CLAUDE.md § Doctrine, tranché le 21/09/2026) refuse qu'un rôle
 * retire ou masque un objet : « le rôle choisit par quel genre de carte l'écran
 * s'ouvre, il n'en retire et n'en renomme aucune […] personne ne doit perdre
 * une carte parce qu'un rôle est mal renseigné. »
 *
 * Reformulation qui tient les deux : le rôle RÉORDONNE le dictionnaire des 63
 * indicateurs (`manager-kpi.ts`) — ses indicateurs à lui passent en tête — et
 * ne retire JAMAIS une entrée. Un Business Developer voit d'abord « comptes
 * touchés », « conversations utiles »… puis, plus bas, EXACTEMENT le même
 * dictionnaire qu'un Fondateur verrait en tête chez lui. Personne ne perd un
 * chiffre parce que son intitulé de poste est mal renseigné, ou absent.
 *
 * `orderKpisForPersona` est la seule dérivation : elle ne connaît d'ordre que
 * celui qu'on lui donne, jamais une seconde copie (GA-26).
 */

export const PILOTAGE_PERSONAS = [
  'fondateur',
  'directeur_bu',
  'business_manager',
  'business_developer',
  'recrutement_staffing',
] as const
export const pilotagePersonaSchema = z.enum(PILOTAGE_PERSONAS)
export type PilotagePersona = (typeof PILOTAGE_PERSONAS)[number]

const localized = z.object({ fr: z.string().min(1), en: z.string().min(1) })
export type Localized = z.infer<typeof localized>

export const PILOTAGE_PERSONA_LABELS: Record<PilotagePersona, Localized> = {
  fondateur: { fr: 'Fondateur', en: 'Founder' },
  directeur_bu: { fr: 'Directeur de BU', en: 'BU director' },
  business_manager: { fr: 'Business Manager', en: 'Business Manager' },
  business_developer: { fr: 'Business Developer', en: 'Business Developer' },
  recrutement_staffing: { fr: 'Recrutement / Staffing', en: 'Recruitment / Staffing' },
}

/**
 * Les clés du dictionnaire des 64 (`manager-kpi.ts`) qui passent EN TÊTE pour
 * ce rôle, dans l'ordre où le §16 de BEL-SC-242 les nomme. Une PRIORITÉ,
 * jamais un filtre — `orderKpisForPersona` ne retire aucune des clés
 * restantes, elle les laisse à leur place dans le catalogue.
 *
 * Deux axes nommés par la spec Fondateur (« dépendance », « concentration
 * client ») n'ont pas d'équivalent direct et mesurable dans le dictionnaire :
 * `client_concentration_top_account` les couvre, NON mesurable, sa raison
 * écrite (§8, doctrine « un axe non évaluable est NOMMÉ, jamais absent »).
 *
 * #3415.1 (beta-feedback #3415, lot C14 30/09/2026) — un sixième axe manquait :
 * « croissance », cité par l'issue à côté de « chiffre d'affaires », « marge »,
 * « cash », « dépendance », « capacité ». `revenue_growth` (NON mesurable, sa
 * raison écrite dans `manager-kpi.ts`) le couvre, même règle que
 * `client_concentration_top_account` juste au-dessus.
 */
export const PILOTAGE_PERSONA_FOCUS: Record<PilotagePersona, readonly string[]> = {
  fondateur: [
    'revenue_signed',
    'revenue_produced',
    'revenue_invoiced',
    'revenue_collected',
    'revenue_growth',
    'gross_margin',
    'unmeasured_margin',
    'dso_days',
    'client_concentration_top_account',
    'bench_rate',
    'accounts_opened',
    'sector_coverage',
  ],
  directeur_bu: [
    'pipeline_amount',
    'gross_margin',
    'unmeasured_margin',
    'accounts_without_next_action',
    'missions_at_risk',
    'missions_ending_without_plan',
    'unmeasurable_missions',
    'bench_rate',
    'timesheets_on_time',
    'renewal_rate',
  ],
  business_manager: [
    'accounts_opened',
    'meetings_held',
    'reply_rate',
    'needs_without_shortlist',
    'profiles_per_need',
    'projects_won',
    'renewal_rate',
    'accounts_without_next_action',
  ],
  business_developer: [
    'accounts_opened',
    'signal_to_action_days',
    'detected_to_qualified',
    'meetings_held',
    'reply_rate',
    'rank1_access_obtained',
  ],
  recrutement_staffing: [
    'known_availability_rate',
    'need_to_shortlist_days',
    'shortlist_to_submission_days',
    'needs_without_shortlist',
    'interview_conversion',
    'submission_win_rate',
    'time_to_fill_days',
    'unstaffable_rate',
  ],
}

/**
 * #2018.2's `user_role` (onboarding, `PROFILE_QUESTION_OPTIONS.user_role`) →
 * rôle de pilotage. Seuls les intitulés-TITRES s'y rattachent — les sept
 * valeurs de PARCOURS (« Pur commercial »…) décrivent une manière de
 * travailler, pas une fonction, et n'ont pas de vue dédiée.
 *
 * `null` = aucune correspondance connue : le catalogue reste dans son ordre
 * STANDARD, jamais une supposition (doctrine « jamais de donnée fictive »
 * appliquée à un rôle deviné).
 */
const USER_ROLE_TO_PERSONA: Readonly<Record<string, PilotagePersona>> = {
  'Fondateur / CEO': 'fondateur',
  "Directeur d'agence": 'fondateur',
  'Directeur de BU': 'directeur_bu',
  'Directeur commercial': 'directeur_bu',
  'Head of Sales': 'directeur_bu',
  'Business Manager': 'business_manager',
  'Account Manager': 'business_manager',
  'Business Developer': 'business_developer',
  'SDR / BDR': 'business_developer',
  'Talent Manager / Recruteur': 'recrutement_staffing',
  'Responsable staffing': 'recrutement_staffing',
}

export function personaFromUserRole(userRole: string | null | undefined): PilotagePersona | null {
  if (!userRole) return null
  return USER_ROLE_TO_PERSONA[userRole] ?? null
}

/**
 * Les rôles qui ENCADRENT (dirigeant, direction commerciale, management) — ceux à qui
 * « Lire comme » est ouvert dans le produit : ils lisent le MÊME brief dans l'ordre d'un
 * autre rôle (c76 : l'ordre change, jamais le contenu). Un commercial, un recruteur, un
 * intitulé inconnu ou absent : faux, jamais une supposition. Un seul endroit, lu par l'écran
 * ET par le serveur (GA-26).
 */
// décision Louis 12/10
export function userRoleFramesTeam(userRole: string | null | undefined): boolean {
  const persona = personaFromUserRole(userRole)
  return persona === 'fondateur' || persona === 'directeur_bu' || persona === 'business_manager'
}

/**
 * RÉORDONNE `kpis` pour `persona` — ne retire, ne renomme, ne masque AUCUNE
 * entrée (c76). `persona` null (rôle non renseigné, ou sans vue dédiée) rend
 * `kpis` inchangé : c'est l'ordre standard du dictionnaire.
 *
 * Prend son catalogue en ARGUMENT (comme `kpisOfFamily`) : l'écran réordonne
 * ce que la route a servi, jamais une copie empaquetée dans le bundle.
 */
export function orderKpisForPersona(
  kpis: readonly ManagerKpi[],
  persona: PilotagePersona | null,
): readonly ManagerKpi[] {
  if (!persona) return kpis
  const priority = PILOTAGE_PERSONA_FOCUS[persona]
  const byKey = new Map(kpis.map(kpi => [kpi.key, kpi] as const))
  const seen = new Set<string>()
  const ordered: ManagerKpi[] = []
  for (const key of priority) {
    const kpi = byKey.get(key)
    if (kpi && !seen.has(key)) {
      ordered.push(kpi)
      seen.add(key)
    }
  }
  for (const kpi of kpis) {
    if (!seen.has(kpi.key)) ordered.push(kpi)
  }
  return ordered
}
