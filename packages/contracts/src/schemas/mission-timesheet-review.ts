import { z } from 'zod'
import { timesheetStatusSchema, type TimesheetStatus } from './mission.js'

/**
 * LA VÉRIFICATION D'UN RELEVÉ D'ACTIVITÉ — et ce qu'elle n'a PAS pu vérifier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le produit détectait déjà des anomalies au dépôt (`detectAnomalies`) et les
 * stockait en toutes lettres sur la ligne. L'écran des relevés les affichait
 * telles quelles, et l'absence de ligne se lisait « rien à signaler ».
 *
 * C'est exactement le défaut que ce dépôt a déjà payé ailleurs : **« cassé » et
 * « non mesurable » se ressemblent trop pour qu'on les confonde.** Un mois sans
 * aucun relevé n'a AUCUNE anomalie détectée — et il n'a surtout pas été
 * vérifié. Une lecture croisée en échec ne rend pas « aucun chevauchement »,
 * elle ne rend rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ISSUES, ET LA TROISIÈME EST CELLE QUI COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `passed`       — le contrôle a tourné, il n'a rien trouvé ;
 *  · `flagged`      — le contrôle a tourné, il a trouvé quelque chose ;
 *  · `not_verified` — le contrôle n'a PAS pu tourner, et il dit pourquoi.
 *
 * `not_verified` n'emprunte jamais le vert de `passed` : « conforme » est
 * précisément ce qu'un valideur lit pour NE PAS ouvrir le dossier.
 *
 * Le module est PUR et sans locale — les libellés vivent dans les catalogues
 * i18n de l'app, jamais ici. Une phrase française stockée en base est un
 * message qu'aucune traduction ne rattrape.
 */

/* ── Ce qu'on vérifie ─────────────────────────────────────────────────────── */

/**
 * Les contrôles, liste FERMÉE et ORDONNÉE — du plus coûteux au moins coûteux
 * quand il passe inaperçu.
 *
 * ⚠️ Un identifiant ne se retire jamais et ne s'insère jamais au milieu
 * (GA-08) : l'ordre est celui de l'affichage, et un contrôle retiré ferait
 * silencieusement disparaître une case de l'écran de vérification.
 */
export const TIMESHEET_CHECK_IDS = [
  /** Les jours déclarés contre la charge ouvrée du mois, bornes de mission comprises. */
  'working_days',
  /** Un relevé déposé qui porte zéro jour. Une mesure vraie, et un signal. */
  'zero_days',
  /** Un quart de journée : presque toujours une faute de frappe sur une demi-journée. */
  'day_fraction',
  /** Ce consultant est-il aussi affecté ailleurs sur ce mois ? */
  'overlapping_mission',
  /** Un autre relevé de la même mission et du même mois est-il déjà validé ? */
  'duplicate_validated',
  /** Un jour férié compté comme travaillé. JAMAIS vérifié — voir plus bas. */
  'public_holidays',
] as const
export type TimesheetCheckId = (typeof TIMESHEET_CHECK_IDS)[number]

export const TIMESHEET_CHECK_OUTCOMES = ['passed', 'flagged', 'not_verified'] as const
export type TimesheetCheckOutcome = (typeof TIMESHEET_CHECK_OUTCOMES)[number]

/**
 * POURQUOI un contrôle n'a pas pu aboutir. Liste fermée : une raison qui
 * n'existe pas dans cette liste est une raison que l'écran ne saurait pas dire,
 * donc un « non vérifié » muet — c'est-à-dire un silence de plus.
 */
export const TIMESHEET_UNVERIFIED_REASONS = [
  /** Rien n'a été déposé : il n'y a pas de relevé à vérifier. */
  'no_declaration',
  /** La charge ouvrée du mois n'est pas connue — sans elle, il n'y a pas d'écart. */
  'no_expected_days',
  /** Personne n'est affecté : on ne sait pas QUI croiser. */
  'no_consultant',
  /**
   * Aucun calendrier de jours fériés n'existe dans le produit.
   *
   * `expectedWorkingDaysInWindow` accepte une liste de jours fériés en
   * paramètre, et RIEN ne la remplit. Un calendrier français codé en dur serait
   * une donnée fictive pour toute mission hors de France — donc le contrôle ne
   * ment pas : il dit qu'il n'a pas tourné.
   */
  'no_holiday_calendar',
  /**
   * La lecture croisée a ÉCHOUÉ. « Cassé » n'est pas « rien trouvé » : le
   * service journalise l'erreur et rend cette issue plutôt qu'un `null` qu'on
   * lirait comme une garantie.
   */
  'read_failed',
] as const
export type TimesheetUnverifiedReason = (typeof TIMESHEET_UNVERIFIED_REASONS)[number]

export const timesheetCheckSchema = z.object({
  id: z.enum(TIMESHEET_CHECK_IDS),
  outcome: z.enum(TIMESHEET_CHECK_OUTCOMES),
  /** Le motif du « non vérifié ». `null` dès que le contrôle a abouti — et
   *  jamais `null` quand il n'a pas abouti. */
  reason: z.enum(TIMESHEET_UNVERIFIED_REASONS).nullable(),
  /** L'écart en jours, SIGNÉ. `null` quand le contrôle n'en produit aucun —
   *  jamais `0`, qui se lirait « l'écart est nul », c'est-à-dire un constat. */
  gapDays: z.number().nullable(),
  /** Ce que le contrôle a croisé — l'autre mission, l'autre consultant. `null`
   *  quand il n'y a rien à nommer, ou quand le nom n'est pas renseigné. */
  subject: z.string().nullable(),
})
export type TimesheetCheck = z.infer<typeof timesheetCheckSchema>

/* ── Ce que le contrôle reçoit ────────────────────────────────────────────── */

/**
 * Le résultat d'une lecture CROISÉE — trois issues, jamais deux.
 *
 * `unreadable` est la raison d'être du type : sans lui, un `catch` qui rend
 * `null` est indiscernable d'une lecture réussie qui n'a rien trouvé.
 */
export type TimesheetCrossCheck =
  | { status: 'none' }
  | { status: 'found'; subject: string | null }
  | { status: 'unreadable' }

export interface TimesheetCheckInput {
  /** Un relevé existe-t-il en base pour ce mois ? Sans lui, RIEN n'est vérifiable. */
  hasDeclaration: boolean
  /** Les jours déclarés. `null` = rien n'a été déposé, surtout pas 0. */
  days: number | null
  /** La charge ouvrée attendue, bornes de mission comprises. */
  expectedDays: number | null
  /** Qui est sur la ligne. `null` = personne d'affecté. */
  consultantId: string | null
  overlappingMission: TimesheetCrossCheck
  duplicateValidated: TimesheetCrossCheck
}

function unverified(id: TimesheetCheckId, reason: TimesheetUnverifiedReason): TimesheetCheck {
  return { id, outcome: 'not_verified', reason, gapDays: null, subject: null }
}

function conclude(
  id: TimesheetCheckId,
  flagged: boolean,
  extra: { gapDays?: number | null; subject?: string | null } = {},
): TimesheetCheck {
  return {
    id,
    outcome: flagged ? 'flagged' : 'passed',
    reason: null,
    gapDays: extra.gapDays ?? null,
    subject: extra.subject ?? null,
  }
}

/** Une lecture croisée, traduite en verdict. Les trois issues, une par une. */
function fromCrossCheck(id: TimesheetCheckId, cross: TimesheetCrossCheck): TimesheetCheck {
  if (cross.status === 'unreadable') return unverified(id, 'read_failed')
  if (cross.status === 'none') return conclude(id, false)
  return conclude(id, true, { subject: cross.subject })
}

/**
 * LES SIX CONTRÔLES, chacun avec son verdict — et un seul passage.
 *
 * ⚠️ Le premier test est le plus important : **sans relevé déposé, aucun
 * contrôle n'a tourné.** Rendre `passed` pour les cinq contrôles qui n'ont
 * besoin que de `days` produirait « rien à signaler » sur un mois vide, c'est
 * à dire une bonne nouvelle tirée d'un silence.
 */
export function runTimesheetChecks(input: TimesheetCheckInput): TimesheetCheck[] {
  if (!input.hasDeclaration || input.days === null) {
    return TIMESHEET_CHECK_IDS.map(id => unverified(id, 'no_declaration'))
  }
  const days = input.days
  const gap =
    input.expectedDays === null || !Number.isFinite(input.expectedDays)
      ? null
      : Number((days - input.expectedDays).toFixed(2))

  return TIMESHEET_CHECK_IDS.map(id => {
    switch (id) {
      case 'working_days':
        return gap === null ? unverified(id, 'no_expected_days') : conclude(id, gap !== 0, { gapDays: gap })
      case 'zero_days':
        return conclude(id, days === 0)
      case 'day_fraction':
        return conclude(id, days % 0.5 !== 0)
      case 'overlapping_mission':
        // Sans consultant, la requête ne PART pas. Conclure « aucun
        // chevauchement » serait une garantie qu'aucune lecture n'a produite.
        return input.consultantId === null
          ? unverified(id, 'no_consultant')
          : fromCrossCheck(id, input.overlappingMission)
      case 'duplicate_validated':
        return fromCrossCheck(id, input.duplicateValidated)
      case 'public_holidays':
        // Toujours. Le produit n'a aucun calendrier de jours fériés, et un
        // calendrier codé en dur serait une donnée fictive hors de France.
        return unverified(id, 'no_holiday_calendar')
    }
  })
}

/* ── Ce qu'on RECOMMANDE, et quand on ne recommande rien ──────────────────── */

/**
 * L'action recommandée — DÉRIVÉE des constats, jamais dictée par un modèle.
 *
 * ⚠️ `not_measurable` est la valeur qui porte la règle : quand aucun contrôle
 * n'a abouti, il n'y a PAS de recommandation. Une phrase vague (« vérifier le
 * relevé ») aurait l'air d'un conseil et n'en serait pas un.
 */
export const TIMESHEET_RECOMMENDATIONS = [
  /** Ce contrat ne fonctionne pas au relevé : rien à décider. */
  'not_required',
  /** Rien n'a été déposé — la suite est un dépôt, pas une décision. */
  'await_declaration',
  /** Aucun contrôle n'a pu aboutir : on ne recommande RIEN. */
  'not_measurable',
  /** Au moins un constat : le relevé se fait corriger avant d'être validé. */
  'fix',
  /** Tout ce qui a pu être vérifié est passé. */
  'validate',
  /** Le relevé est décidé — un relevé décidé ne se re-décide pas. */
  'decided',
] as const
export type TimesheetRecommendation = (typeof TIMESHEET_RECOMMENDATIONS)[number]

export const timesheetRecommendationSchema = z.enum(TIMESHEET_RECOMMENDATIONS)

export function recommendTimesheetAction(input: {
  status: TimesheetStatus
  validatedByClientAt: string | null
  checks: readonly TimesheetCheck[]
}): TimesheetRecommendation {
  if (input.status === 'not_required') return 'not_required'
  // Décidé = ce que le SERVEUR verrouille. La validation du client est ce qui
  // autorise à facturer ; la défaire d'un clic est le litige qu'on découvre
  // cinq mois plus tard.
  if (input.status === 'rejected' || input.validatedByClientAt !== null) return 'decided'
  if (input.status === 'expected' || input.status === 'missing') return 'await_declaration'

  const conclusive = input.checks.filter(check => check.outcome !== 'not_verified')
  // ⚠️ Le refus. Zéro contrôle abouti ne vaut pas « zéro anomalie ».
  if (conclusive.length === 0) return 'not_measurable'
  if (conclusive.some(check => check.outcome === 'flagged')) return 'fix'
  return 'validate'
}

/* ── Ce que le serveur autorise encore ────────────────────────────────────── */

/**
 * Les deux gestes encore ouverts sur un relevé — la MÊME frontière que le
 * serveur, dérivée à UN seul endroit (GA-26).
 *
 * Elle vivait en double : `TimesheetsPage` la recopiait dans un `canReject`
 * écrit à la main, et le tiroir allait la recopier une troisième fois. Deux
 * chemins qui refont la même dérivation divergent — et celui des deux qu'on
 * croit décide de ce qu'on facture.
 *
 * Ce qu'elle reflète, côté serveur :
 *  · `validateByClient` refuse un relevé `disputed` ;
 *  · `reject` refuse un relevé déjà validé PAR LE CLIENT.
 * Elle n'AJOUTE aucune règle : un bouton absent qui aurait marché fait chercher
 * une panne, un bouton présent qui revient en 400 fait recliquer.
 *
 * #2415.6 — `canReviewInternally` ouvre un TROISIÈME geste, distinct des deux
 * ci-dessus : « relu en interne » n'est plus le même clic que « transmis au
 * client ». La fenêtre est volontairement ÉTROITE — seulement `submitted`,
 * avant toute validation client — parce que c'est la revue qui a un sens
 * (relire AVANT de transmettre, pas après). Une fois posée, elle ne se
 * repropose pas : `internal_reviewed_at` n'est jamais réécrit par ce geste,
 * comme `rejectedAt`/`submittedByName`, on archive, on ne supprime pas.
 */
export function timesheetDecisionLock(line: {
  timesheetId: string | null
  status: TimesheetStatus
  validatedByClientAt: string | null
  internalReviewedAt?: string | null
}): { canValidate: boolean; canReject: boolean; canReviewInternally: boolean } {
  if (line.timesheetId === null) return { canValidate: false, canReject: false, canReviewInternally: false }
  return {
    canValidate: line.status === 'submitted',
    canReject:
      line.validatedByClientAt === null &&
      (line.status === 'submitted' || line.status === 'draft' || line.status === 'validated'),
    canReviewInternally: line.status === 'submitted' && (line.internalReviewedAt ?? null) === null,
  }
}

/* ── Ce que la route rend ─────────────────────────────────────────────────── */

/**
 * Le dossier d'un relevé, tel que le tiroir de validation le lit.
 *
 * `recordedAnomalies` porte la trace HISTORIQUE écrite au dépôt, en toutes
 * lettres. Elle n'est pas la vérification : elle est l'ARCHIVE de ce qui avait
 * été relevé ce jour-là, et on archive, on ne supprime pas. Les deux cohabitent
 * parce qu'elles ne répondent pas à la même question — « qu'a-t-on vu ? » et
 * « qu'a-t-on pu vérifier ? ».
 */
export const timesheetReviewSchema = z.object({
  timesheetId: z.string().guid().nullable(),
  missionId: z.string().guid(),
  missionLabel: z.string().nullable(),
  accountName: z.string().nullable(),
  consultantId: z.string().guid().nullable(),
  consultantName: z.string().nullable(),
  periodMonth: z.string(),
  status: timesheetStatusSchema,
  /** `null` = rien n'a été déposé — surtout pas 0. */
  days: z.number().nullable(),
  expectedDays: z.number().nullable(),
  gap: z.number().nullable(),
  gapExplanation: z.string().nullable(),
  blocksInvoicing: z.boolean(),
  validatedByClientAt: z.string().nullable(),
  /** #2415.6 — revue INTERNE, distincte de `validatedByClientAt`. `null` tant
   *  qu'aucune revue interne n'a été posée. */
  internalReviewedAt: z.string().nullable(),
  internalReviewedByName: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  /** #2415.7 — combien de jours posent problème, et par quand corriger.
   *  `null` tant qu'aucun rejet n'existe ; conservées comme le motif. */
  contestedDays: z.number().nullable(),
  correctionDeadline: z.string().nullable(),
  remindersSent: z.number().int().nonnegative(),
  lastReminderAt: z.string().nullable(),
  recordedAnomalies: z.array(z.string()),
  checks: z.array(timesheetCheckSchema),
  recommendation: timesheetRecommendationSchema,
})
export type TimesheetReview = z.infer<typeof timesheetReviewSchema>

/** Ce qu'un `GET /delivery/timesheets/review` accepte — la maille est
 *  mission × consultant × mois, jamais l'identifiant du relevé : un mois sans
 *  dépôt n'a pas d'identifiant, et c'est le mois qu'on veut ouvrir. */
export const timesheetReviewQuerySchema = z
  .object({
    missionId: z.string().guid(),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM'),
    consultantId: z.string().guid().optional(),
  })
  .strict()
export type TimesheetReviewQuery = z.infer<typeof timesheetReviewQuerySchema>
