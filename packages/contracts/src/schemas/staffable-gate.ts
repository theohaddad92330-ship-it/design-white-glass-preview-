import { z } from 'zod'
import { NEED_STATUS_ORDER, assertNeedSqlColumn, normaliseNeedStatus, type NeedStoredStatus } from './need-status.js'

/**
 * La porte G3 — « Ce besoin est-il staffable ? » (PDF 2 §7.6).
 *
 * Trois issues, et `unknown` en est une : « la question n'a pas encore été
 * posée ». La distinguer de « non » compte — l'un se traite, l'autre est
 * tranché, et les confondre ferait disparaître des besoins ouverts du tableau
 * d'un recruteur.
 */
export const STAFFABLE_VERDICTS = ['unknown', 'yes', 'no'] as const
export const staffableVerdictSchema = z.enum(STAFFABLE_VERDICTS)
export type StaffableVerdict = (typeof STAFFABLE_VERDICTS)[number]

/**
 * Les deux verdicts que le SQL ci-dessous nomme, TYPÉS.
 *
 * Écrits ainsi et non en clair dans le gabarit : renommer une valeur de
 * {@link STAFFABLE_VERDICTS} casse alors la COMPILATION, au lieu de laisser une
 * chaîne périmée filtrer sur une valeur que la base n'écrit plus.
 */
const VERDICT_UNKNOWN: StaffableVerdict = 'unknown'
const VERDICT_REFUSED: StaffableVerdict = 'no'

/**
 * « Ce besoin n'a pas reçu de réponse NÉGATIVE », écrit en SQL.
 *
 * ⚠️ `staffable` EST UNE PORTE À TROIS ISSUES, PAS UN BOOLÉEN — et c'est
 * précisément ce que deux requêtes avaient oublié. L'une écrivait
 * `COALESCE(n.staffable, true) = true`, l'autre `staffable = false`, sur une
 * colonne déclarée `text NOT NULL DEFAULT 'unknown'` (migration
 * `1789545118372-NeedStaffableGate`). Postgres ne compare pas du texte à un
 * booléen : il REFUSE la requête entière — « les COALESCE types text et boolean
 * ne peuvent pas correspondre ». La routine qui la portait n'a donc jamais
 * produit une seule ligne depuis sa mise en service, et le KPI qui portait
 * l'autre rendait un tableau vide qui se lit « aucun besoin refusé ».
 *
 * Ce que le prédicat exclut, et ce qu'il garde, est le fond de la porte :
 * **seul `no` sort**. Un besoin `unknown` n'a pas été jugé non staffable, il n'a
 * pas été jugé DU TOUT — l'écarter ferait taire la routine sur l'immense
 * majorité des besoins, puisque `unknown` est la valeur par défaut de chaque
 * ligne créée. C'est l'arbitrage écrit en tête de ce fichier : `unknown` est une
 * RÉPONSE, et la confondre avec « non » ferait disparaître du tableau d'un
 * recruteur exactement les besoins qu'il doit encore trancher.
 *
 * Le `COALESCE` ne défend pas contre la colonne (elle est `NOT NULL`) mais
 * contre la JOINTURE EXTERNE : sans lui, un `LEFT JOIN` sans ligne à droite
 * donne `NULL <> 'no'`, qui vaut `NULL`, donc FAUX — et le besoin disparaîtrait
 * en silence. « Absent » doit se lire « pas encore jugé », jamais « refusé ».
 */
export function needStaffableNotRefusedSql(column: string): string {
  assertNeedSqlColumn('needStaffableNotRefusedSql', column)
  return `COALESCE(${column}, '${VERDICT_UNKNOWN}') <> '${VERDICT_REFUSED}'`
}

/**
 * Le complément : « ce besoin A reçu sa réponse négative ».
 *
 * Ce n'est PAS la négation de {@link needStaffableNotRefusedSql} au sens
 * logique, et c'est voulu : `unknown` n'est ni dans l'un ni dans l'autre quand
 * on compte. Le taux de besoins refusés par cause se calcule sur les besoins
 * TRANCHÉS — y verser les « pas encore jugés » ferait dire à l'ESN qu'elle ne
 * sait pas faire ce que personne n'a encore regardé.
 */
export function needStaffableRefusedSql(column: string): string {
  assertNeedSqlColumn('needStaffableRefusedSql', column)
  return `${column} = '${VERDICT_REFUSED}'`
}

/**
 * Les motifs de non-staffabilité proposés par défaut (§7.6).
 *
 * Ce qu'ils produisent, et qui n'existait nulle part : le **taux de besoins
 * refusés par cause**. Le §7.6 le dit — ce chiffre dit à l'ESN ce qu'elle ne
 * sait pas faire, c'est un indicateur stratégique et non une statistique de
 * rejet. Sans motif, il n'existe pas.
 */
export const DEFAULT_UNSTAFFABLE_REASONS: readonly { key: string; fr: string; en: string }[] = [
  { key: 'no_skill', fr: 'Compétence absente du vivier', en: 'Skill missing from our bench' },
  { key: 'rate', fr: 'TJM incompatible avec notre structure de coût', en: 'Rate incompatible with our cost base' },
  { key: 'timing', fr: 'Délai impossible', en: 'Impossible lead time' },
  { key: 'geography', fr: 'Zone non couverte', en: 'Area we don’t cover' },
  { key: 'volume', fr: 'Charge insuffisante', en: 'Not enough workload' },
  { key: 'clearance', fr: 'Habilitation non détenue', en: 'Clearance we don’t hold' },
  { key: 'other', fr: 'Autre', en: 'Other' },
]

/**
 * Ce que le franchissement de G3 ENTRAÎNE, calculé à part du réseau.
 *
 * Une porte dont la décision n'a aucune conséquence décore un formulaire. Ici
 * un « oui » fait passer le besoin en `qualified`, un « non » le clôt en perte
 * avec son motif, et « pas encore » ne déplace rien — c'est le point : le
 * recruteur doit pouvoir dire « je ne sais pas encore » sans que rien ne bouge.
 *
 * Un « oui » ne fait JAMAIS reculer un besoin déjà plus avancé : confirmer une
 * staffabilité sur un besoin dont la shortlist est prête ne doit pas le
 * ramener à la qualification.
 */
export function staffableGateEffect(
  currentStatus: string | null | undefined,
  verdict: StaffableVerdict,
  reason: string | null | undefined,
): { staffable: StaffableVerdict; nextStatus: NeedStoredStatus | null; reason: string | null; problem: string | null } {
  const trimmed = (reason ?? '').trim()

  if (verdict === 'no') {
    if (!trimmed) {
      return {
        staffable: 'no',
        nextStatus: null,
        reason: null,
        problem: 'Un motif est obligatoire pour déclarer un besoin non staffable.',
      }
    }
    return { staffable: 'no', nextStatus: 'lost', reason: trimmed, problem: null }
  }

  if (verdict === 'unknown') {
    return { staffable: 'unknown', nextStatus: null, reason: null, problem: null }
  }

  const current = normaliseNeedStatus(currentStatus)
  const alreadyBeyond = NEED_STATUS_ORDER.indexOf(current as (typeof NEED_STATUS_ORDER)[number])
  const qualified = NEED_STATUS_ORDER.indexOf('qualified')
  return {
    staffable: 'yes',
    nextStatus: alreadyBeyond >= 0 && alreadyBeyond >= qualified ? null : 'qualified',
    reason: null,
    problem: null,
  }
}

export const crossStaffableGateSchema = z.object({
  verdict: staffableVerdictSchema,
  reason: z.string().trim().max(200).nullish(),
})
export type CrossStaffableGate = z.infer<typeof crossStaffableGateSchema>
