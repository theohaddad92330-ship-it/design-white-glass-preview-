import type { Submission, SubmissionStage } from '@bellum/contracts'
import type { TFunction } from 'i18next'

/**
 * #2335.8 (LAU-FINAL-076) — LAURA RÉSUME LES PRÉSENTATIONS EN COURS.
 *
 * « Trois profils ont été présentés. Un entretien est confirmé. Un profil
 * attend un retour depuis six jours. […] Je recommande de relancer uniquement
 * le second. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MÊME PATRON QUE `composeMorningBrief` — ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun appel au modèle : la phrase est composée ici, depuis les
 * `Submission[]` déjà chargées par `useSubmissions()`. Une seule
 * recommandation, jamais un classement — même raison que le brief du matin :
 * proposer cinq relances serait un rapport, pas un conseil. La cible est le
 * positionnement SANS retour depuis le plus longtemps (même fenêtre que
 * `INTERVENTION_THRESHOLDS.submissionSilenceDays` côté serveur, rejouée ici en
 * jours simples pour ne pas dupliquer le seuil).
 *
 * Aucune probabilité, aucun pourcentage (doctrine, refusée six fois) : la
 * seule chose nommée est un FAIT compté (jours de silence) ou une raison déjà
 * écrite par un humain (`outcomeDetail`).
 *
 * ⚠️ Monté sur l'écran Affaires › Présentations (`PresentationsPage.tsx`) et non dans la
 * conversation `/chat` elle-même : câbler une question libre dans le tour LLM
 * suppose de toucher `apps/ia` (prompts) et `Chat.tsx`, partagé avec l'écrivain
 * parallèle sur #2373 (intro chaude) — hors périmètre sûr de ce lot. Décision
 * écrite au registre (#2335.8, reco appliquée).
 */

const IN_PROGRESS_STAGES: readonly SubmissionStage[] = ['shortlisted', 'submitted', 'interview']

export function composeSubmissionsDigest(
  t: TFunction<'submissions'>,
  items: readonly Submission[],
  now: Date = new Date(),
): string | null {
  const inProgress = items.filter(item => IN_PROGRESS_STAGES.includes(item.stage))
  if (inProgress.length === 0) return null

  const lines: string[] = [t('digest.inProgress', { count: inProgress.length })]

  const confirmedInterviews = inProgress.filter(item => item.stage === 'interview').length
  if (confirmedInterviews > 0) {
    lines.push(t('digest.interviewsConfirmed', { count: confirmedInterviews }))
  }

  // Le SEUL profil sans retour depuis le PLUS longtemps — jamais un classement.
  const silent = inProgress
    .filter(item => item.stage === 'submitted' && !item.firstFeedbackAt && item.submittedAt)
    .map(item => ({ item, days: daysSince(item.submittedAt as string, now) }))
    .filter((entry): entry is { item: Submission; days: number } => entry.days !== null && entry.days > 0)
    .sort((a, b) => b.days - a.days)

  const target = silent[0]
  if (target) {
    lines.push(t('digest.stalled', { name: target.item.consultantName ?? t('unknownTalent'), days: target.days }))
  }

  if (target) {
    lines.push(t('digest.recommendation', { name: target.item.consultantName ?? t('unknownTalent') }))
  }

  return lines.join(' ')
}

/** Jours pleins écoulés depuis une date ISO, ou `null` si elle est invalide. */
function daysSince(iso: string, now: Date): number | null {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  return Math.floor((now.getTime() - then) / 86_400_000)
}
