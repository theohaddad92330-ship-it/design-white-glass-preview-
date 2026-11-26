import {
  canMarkTimesheetNotApplicable,
  classifyGap,
  dayGap,
  expectsTimesheet,
  expectedWorkingDaysInWindow,
  gapBlocksInvoicing,
  type ContractKind,
  type GapKind,
  type TimesheetNotApplicable,
  type TimesheetStatus,
} from '@bellum/contracts'

/**
 * La vue du 5 du mois — une ligne par mission ET par consultant (PDF 5 §7).
 *
 * Tout est PUR ici : le module compte des jours, et une erreur de comptage se
 * paie en euros non facturés. Les entrées sont les lignes déjà lues, la sortie
 * est ce que l'écran affiche. La date du jour est un paramètre, jamais
 * `new Date()` caché au fond d'une fonction.
 *
 * Trois règles portent le fichier :
 *
 *  1. **Un mois à venir n'est pas un mois oublié.** `expected` tant que le mois
 *     n'est pas fini, `missing` après. Les confondre relancerait des gens pour
 *     un mois qu'ils n'ont pas encore vécu.
 *  2. **Un forfait n'a pas de relevé.** `not_required`, et il sort des
 *     relances. Une alerte qui ne peut jamais se résoudre fait ignorer toutes
 *     les autres.
 *  3. **Un écart inconnu ne bloque rien.** Bloquer sur `null` arrêterait la
 *     facturation d'un espace qui ne renseigne pas ses jours fériés, et
 *     quelqu'un finirait par débrancher la garde.
 */

export type TimesheetSource = {
  missionId: string
  missionLabel: string | null
  accountName: string | null
  contractKind: ContractKind
  startedOn: string | null
  endsOn: string | null
  consultantId: string | null
  consultantName: string | null
  /** La ligne en base, absente quand rien n'a été déposé. */
  row: {
    id: string
    days: number
    status: TimesheetStatus
    expectedDays: number | null
    gapExplanation: string | null
    validatedByClientAt: string | null
    /**
     * #2196.16 — celui qui a ENREGISTRÉ la validation client (`validated_by`),
     * déjà écrit en base depuis l'origine de `validateByClient` mais jamais lu
     * : la colonne « approbateur » de l'écran, sans appelant.
     *
     * ⚠️ Ce n'est PAS le contact client — c'est la personne de l'espace qui a
     * cliqué « Enregistrer la validation client ». Un `null` est un fait
     * (relevé pas encore validé), jamais une chaîne vide.
     */
    approverName: string | null
    anomalies: string[]
    remindersSent: number
    lastReminderAt: string | null
    /**
     * Le rejet et son motif — REQUIS, pas facultatifs.
     *
     * Les déclarer optionnels laisserait le service les oublier sans que rien
     * ne s'en aperçoive : c'est le défaut « un normaliseur avale les champs
     * neufs », qui produit une fonctionnalité invisible derrière des tests
     * verts. Le compilateur est ici la seule garde qui ne s'endort pas.
     */
    rejectedAt: string | null
    rejectionReason: string | null
    /** #2415.7 — combien de jours posent problème, et par quand corriger.
     *  `null` tant qu'aucun rejet n'existe. */
    contestedDays: number | null
    correctionDeadline: string | null
    /** #2415.5 — QUI a déclaré ces jours, distinct de `consultantId` (DE QUI
     *  ils sont) : un ops peut déclarer POUR un consultant. `null` sur une
     *  ligne historique, d'avant cette trace. */
    submittedByName: string | null
    /** #2415.6 — la revue INTERNE, distincte de `validatedByClientAt` : un
     *  geste séparé, posé avant la validation client. `null` tant qu'aucune
     *  revue n'a été posée. */
    internalReviewedAt: string | null
    internalReviewedByName: string | null
  } | null
  /**
   * #2196.31 — l'exception « non applicable » ACTIVE de cette maille, ou
   * `null`. REQUISE, pas facultative — même raison que le rejet ci-dessus : un
   * champ optionnel, le service l'oublierait sans que rien ne s'en aperçoive.
   */
  notApplicable: TimesheetNotApplicable | null
}

export type TimesheetLine = {
  /**
   * L'identifiant du RELEVÉ, `null` quand rien n'a été déposé.
   *
   * Il voyage jusqu'à l'écran parce que c'est lui que visent « expliquer
   * l'écart » et « enregistrer la validation client ». Envoyer l'identifiant de
   * la MISSION à leur place écrirait sur la mauvaise ligne — ou sur aucune —
   * et l'écran afficherait un succès.
   */
  timesheetId: string | null
  missionId: string
  missionLabel: string | null
  accountName: string | null
  consultantId: string | null
  consultantName: string | null
  periodMonth: string
  status: TimesheetStatus
  /** Jours déclarés. `null` = rien n'a été déposé — surtout pas 0. */
  days: number | null
  expectedDays: number | null
  gap: number | null
  gapKind: GapKind
  gapExplanation: string | null
  /** L'écart empêche-t-il de facturer ce mois ? */
  blocksInvoicing: boolean
  validatedByClientAt: string | null
  /** #2196.16 — voir `TimesheetSource.row.approverName`. */
  approverName: string | null
  anomalies: string[]
  remindersSent: number
  lastReminderAt: string | null
  /**
   * Quand le relevé a été rejeté, et POURQUOI.
   *
   * La trace SURVIT au redépôt : `submitTimesheet` repasse la ligne en
   * `submitted` sans effacer ces deux champs, et c'est voulu — on archive, on
   * ne supprime pas. L'écran distingue donc « rejeté, en attente de correction »
   * (le statut le dit) de « rejeté puis redéposé » (le statut a changé, la trace
   * reste). Effacer le motif au redépôt ferait disparaître la seule réponse à
   * « pourquoi ce mois a-t-il fait un aller-retour ? ».
   */
  rejectedAt: string | null
  rejectionReason: string | null
  /** #2415.7 — voir `TimesheetSource.row.contestedDays`/`correctionDeadline`. */
  contestedDays: number | null
  correctionDeadline: string | null
  /** #2415.5 — voir `TimesheetSource.row.submittedByName`. */
  submittedByName: string | null
  /** #2415.6 — voir `TimesheetSource.row.internalReviewedAt`/`internalReviewedByName`. */
  internalReviewedAt: string | null
  internalReviewedByName: string | null
  /**
   * #2196.31 — l'exception « non applicable » ACTIVE (qui, quand, pourquoi),
   * ou `null`. Présente même quand un relevé déposé l'a rendue sans effet : la
   * trace ne disparaît pas parce qu'un fait est arrivé depuis.
   */
  notApplicable: TimesheetNotApplicable | null
  /**
   * #2196.33 / #2196.34 — un rappel AVANT l'échéance, distinct de « en retard »
   * (`dueReminders`, `timesheets.service.ts`, APRÈS la fin du mois).
   *
   * Purement informationnel : il ne consomme aucun rang de relance et ne
   * pousse jamais vers l'escalade — le calendrier de retard [5, 12, 20]
   * garde exactement sa forme, ce rappel-ci vit à côté. `daysRemaining` nomme
   * toujours le compte réel (GA-18/GA-19, « jamais un nombre de jours par
   * défaut silencieux »), jamais une phrase vague.
   */
  preDeadlineReminder: { kind: 'before'; daysRemaining: number } | { kind: 'dueToday' } | null
}

/** Le dernier jour du mois, en `YYYY-MM-DD`. */
function endOfMonth(periodMonth: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(periodMonth)
  if (!match) return null
  const cursor = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0))
  return cursor.toISOString().slice(0, 10)
}

/**
 * #2196.33 / #2196.34 — combien de jours avant l'échéance, et sous quelle
 * forme le dire.
 *
 * Seul un mois `expected` (en cours, rien déposé) est concerné : un mois
 * `missing` est déjà clos (le rappel de retard prend le relais), et un mois
 * qui porte un relevé n'a plus rien à annoncer. La fenêtre est de 3 jours —
 * assez tôt pour agir, jamais si tôt qu'elle se confond avec le fil du mois.
 */
function preDeadlineReminderKind(
  status: TimesheetStatus,
  periodMonth: string,
  today: string,
): { kind: 'before'; daysRemaining: number } | { kind: 'dueToday' } | null {
  if (status !== 'expected') return null
  const last = endOfMonth(periodMonth)
  if (!last) return null
  const remaining = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (remaining < 0 || remaining > 3) return null
  return remaining === 0 ? { kind: 'dueToday' } : { kind: 'before', daysRemaining: remaining }
}

/**
 * Le statut d'une ligne sans dépôt.
 *
 * `not_required` d'abord : c'est la seule réponse qui reste vraie quel que soit
 * le calendrier. Ensuite le mois décide — attendu s'il court encore, manquant
 * s'il est clos.
 */
function statusWithoutRow(kind: ContractKind, periodMonth: string, today: string): TimesheetStatus {
  if (!expectsTimesheet(kind)) return 'not_required'
  const last = endOfMonth(periodMonth)
  if (!last) return 'expected'
  return today > last ? 'missing' : 'expected'
}

export function buildTimesheetLine(
  source: TimesheetSource,
  periodMonth: string,
  options: { today: string; holidays?: readonly string[] },
): TimesheetLine {
  // #2196.31 — l'exception PRIME sur la déduction du contrat, pour CE mois et
  // cette maille : elle ne couvre que ce que la déduction produit (aucun dépôt,
  // ou une ligne ouverte à vide) — jamais un relevé déposé, qui est un fait.
  const excepted =
    source.notApplicable !== null && (source.row === null || canMarkTimesheetNotApplicable(source.row.status))
  const expectedFromWindow =
    !excepted && expectsTimesheet(source.contractKind)
      ? expectedWorkingDaysInWindow(
          periodMonth,
          { startedOn: source.startedOn, endsOn: source.endsOn },
          options.holidays ?? [],
        )
      : null

  // La charge FIGÉE au dépôt fait foi. La recalculer changerait l'écart d'un
  // relevé déjà validé le jour où l'espace ajoute un jour férié.
  const expectedDays = excepted ? null : (source.row?.expectedDays ?? expectedFromWindow)
  // Une ligne ouverte à vide porte `days = 0` : sous une exception, rien n'a
  // été déclaré — `null`, jamais « 0 jour » (GA-18/GA-19).
  const days = source.row && !excepted ? source.row.days : null
  const gap = dayGap(days, expectedDays)
  const gapExplanation = source.row?.gapExplanation ?? null
  const status: TimesheetStatus = excepted
    ? 'not_required'
    : (source.row?.status ?? statusWithoutRow(source.contractKind, periodMonth, options.today))

  return {
    timesheetId: source.row?.id ?? null,
    missionId: source.missionId,
    missionLabel: source.missionLabel,
    accountName: source.accountName,
    consultantId: source.consultantId,
    consultantName: source.consultantName,
    periodMonth,
    status,
    days,
    expectedDays,
    gap,
    gapKind: classifyGap(gap),
    gapExplanation,
    /*
     * La nature du contrat décide si on RÉCLAME un relevé ; elle ne décide pas
     * du sort d'un relevé qui EXISTE.
     *
     * Le défaut, vu en recette : une mission de nature inconnue portant un
     * relevé à 12 jours sur un mois à 21 s'affichait « rien ne bloque » sur
     * l'écran des relevés, pendant que l'écran de facturation annonçait
     * `unexplained_gap` sur la même ligne. Deux écrans, deux réponses au sujet
     * du même fait — celui des deux qu'on croit décide de ce qu'on facture.
     *
     * Un mois sans aucun relevé et sans relevé attendu ne bloque toujours rien :
     * l'écart y vaut `null`, et `gapBlocksInvoicing` le laisse passer.
     */
    /*
     * Un relevé REJETÉ bloque, quel que soit son écart.
     *
     * L'écart ne dit rien du rejet : un relevé peut tomber pile sur les jours
     * ouvrés et être renvoyé parce que les jours sont imputés au mauvais mois.
     * S'en remettre au seul écart afficherait « rien ne bloque » sur une ligne
     * qu'un humain vient explicitement de refuser — et le mois partirait en
     * facturation sur un relevé que personne n'assume.
     *
     * Les DEUX écrans tranchent pareil : `computeInvoiceBlockers` pousse
     * `timesheet_rejected` sur le même fait. C'est exactement la divergence que
     * le commentaire ci-dessus raconte, et elle a failli se rejouer — le trou
     * était réel jusqu'à ce que le compilateur le montre, `ReadinessInput`
     * recopiant la liste des statuts au lieu de l'importer.
     */
    blocksInvoicing: status === 'rejected' || gapBlocksInvoicing(gap, gapExplanation),
    validatedByClientAt: source.row?.validatedByClientAt ?? null,
    approverName: source.row?.approverName ?? null,
    anomalies: source.row?.anomalies ?? [],
    remindersSent: source.row?.remindersSent ?? 0,
    lastReminderAt: source.row?.lastReminderAt ?? null,
    rejectedAt: source.row?.rejectedAt ?? null,
    rejectionReason: source.row?.rejectionReason ?? null,
    contestedDays: source.row?.contestedDays ?? null,
    correctionDeadline: source.row?.correctionDeadline ?? null,
    submittedByName: source.row?.submittedByName ?? null,
    internalReviewedAt: source.row?.internalReviewedAt ?? null,
    internalReviewedByName: source.row?.internalReviewedByName ?? null,
    notApplicable: source.notApplicable,
    preDeadlineReminder: preDeadlineReminderKind(status, periodMonth, options.today),
  }
}

export type TimesheetSummary = {
  total: number
  /** Le mois court ENCORE — `expected` ou `draft`. Rien à reprocher : voir
   *  `late` juste en dessous pour le cas qui, lui, coûte. */
  awaiting: number
  /**
   * #2196.6 (17/09/2026) — le mois est CLOS et rien n'est arrivé (`missing`).
   *
   * Vivait fondu dans `awaiting` depuis l'origine — la doctrine du fichier dit
   * pourtant, en toutes lettres : « `missing` … c'est le cas le plus coûteux
   * du module, et il n'avait pas de nom [de résumé] ». Le confondre avec un
   * mois encore ouvert cache exactement la ligne qui appelle une relance.
   */
  late: number
  submitted: number
  validated: number
  disputed: number
  /**
   * Les relevés RENVOYÉS à leur auteur, motif à l'appui.
   *
   * Compté à part, et surtout pas fondu dans `awaiting` : « personne n'a encore
   * déposé » et « quelqu'un a déposé, on a refusé » appellent deux gestes
   * différents — relancer dans le premier cas, corriger dans le second. Les
   * confondre relancerait un consultant qui attend, lui, une correction.
   */
  rejected: number
  /**
   * #2196.24 (17/09/2026) — la relance a atteint son troisième rang sans
   * dépôt : le sujet a quitté « à relancer » pour « a besoin d'un humain ».
   * Compté à part de `late`, sinon la colonne « Statut » ne pourrait jamais
   * dire lequel des deux s'applique à une ligne donnée.
   */
  escalated: number
  notRequired: number
  /** Combien de lignes portent un écart non expliqué. */
  blocking: number
  /** Jours déclarés, tous confondus. `null` quand aucune ligne n'en porte —
   *  « 0 jour déclaré » et « personne n'a encore déposé » ne se corrigent pas
   *  de la même façon. */
  declaredDays: number | null
}

export function summarizeTimesheets(lines: readonly TimesheetLine[]): TimesheetSummary {
  let awaiting = 0
  let late = 0
  let submitted = 0
  let validated = 0
  let disputed = 0
  let rejected = 0
  let escalated = 0
  let notRequired = 0
  let blocking = 0
  let declaredDays: number | null = null

  for (const line of lines) {
    // #2196.6 — `missing` (mois clos, rien reçu) sort d'`awaiting` (mois
    // encore ouvert) : les deux appellent un regard différent.
    if (line.status === 'expected' || line.status === 'draft') awaiting += 1
    else if (line.status === 'missing') late += 1
    else if (line.status === 'submitted') submitted += 1
    else if (line.status === 'validated') validated += 1
    else if (line.status === 'disputed') disputed += 1
    // AVANT le `else` fourre-tout : sans cette branche, un relevé rejeté était
    // compté « sans relevé attendu », c'est-à-dire rangé parmi les lignes dont
    // il n'y a rien à faire. C'est l'inverse de ce qu'il est.
    else if (line.status === 'rejected') rejected += 1
    // #2196.24 — idem pour un relevé escaladé : ni « en retard », ni « sans
    // relevé attendu ».
    else if (line.status === 'escalated') escalated += 1
    else notRequired += 1
    if (line.blocksInvoicing) blocking += 1
    if (line.days !== null) declaredDays = Number(((declaredDays ?? 0) + line.days).toFixed(2))
  }

  return {
    total: lines.length,
    awaiting,
    late,
    submitted,
    validated,
    disputed,
    rejected,
    escalated,
    notRequired,
    blocking,
    declaredDays,
  }
}
