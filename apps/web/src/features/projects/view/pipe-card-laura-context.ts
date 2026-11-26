import type { TFunction } from 'i18next'

/**
 * #2170.53 (tranché sans Louis) — CE QU'UNE CARTE DIT À LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE TRANCHE LIVRE, ET CE QU'ELLE NE LIVRE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'épopée #2949 demandait un AGRÉGATEUR de contexte côté `copilot-bridge`
 * (compte + opportunité + besoins + profils, pour UNE carte du Kanban) —
 * `AskLaura` (primitive réutilisable) n'existant qu'au niveau PAGE
 * (`ProjectsPage.tsx`), jamais sur une carte. Construire cet agrégateur —
 * une route, un contrat de réponse, un test API — est un chantier de
 * plusieurs jours que l'épopée nomme elle-même hors périmètre d'un correctif.
 *
 * Ce que la carte a DÉJÀ, sans nouvel appel (GA-26) : `label` (l'opportunité),
 * `primary_need_title` (le besoin), `positioned_count` et `interview_count`
 * (les profils) — les quatre mêmes champs que `ROW_PROJECTION` calcule pour
 * s'afficher sur la carte elle-même. Cette fonction les recompose en une
 * question PRÉ-REMPLIE (jamais envoyée seule — le copilote prépare, le
 * commercial l'envoie), montée directement sur `ProjectCard` : c'est la plus
 * petite tranche qui rapproche l'écran de #2170.53 sans rouvrir un chantier
 * d'agrégateur que rien dans ce lot ne peut recetter.
 *
 * `accountId` reste le seul périmètre transporté par `AskLaura` (D44/#3002) :
 * cette fonction ne fait QUE composer le texte de la question.
 */

type CardLauraInput = {
  label: string
  primaryNeedTitle: string | null | undefined
  positionedCount: number | undefined
  interviewCount: number | undefined
  /** #2170.53 — le COMPTE de l'opportunité (`company_name`), absent = rien dit, jamais inventé. */
  accountName?: string | null
  /** #2170.53 — jours immobiles dans l'étape, SEULEMENT au-delà du seuil d'étape (`staleOf`) ; sinon `null`. */
  staleDays?: number | null
}

export function pipeCardLauraQuestion(t: TFunction<'projects'>, project: CardLauraInput): string {
  const parts = [t('pipeline.askLauraCardQuestion.base', { label: project.label })]
  // #2170.53 — le compte d'abord : sans lui, Laura ne sait pas de quel client on parle.
  if (project.accountName) {
    parts.push(t('pipeline.askLauraCardQuestion.account', { account: project.accountName }))
  }
  if (project.primaryNeedTitle) {
    parts.push(t('pipeline.askLauraCardQuestion.need', { need: project.primaryNeedTitle }))
  }
  if (project.positionedCount) {
    parts.push(t('pipeline.askLauraCardQuestion.positioned', { count: project.positionedCount }))
  }
  // #2170.5 — le stade dérivé « en entretien(s) », au pluriel : un entretien concerne une PERSONNE.
  if (project.interviewCount) {
    parts.push(t('pipeline.askLauraCardQuestion.interview', { count: project.interviewCount }))
  }
  // #2170.53 — « en entretien depuis neuf jours sans retour » : l'immobilité, quand elle passe le seuil.
  if (typeof project.staleDays === 'number') {
    parts.push(t('pipeline.askLauraCardQuestion.stale', { count: project.staleDays }))
  }
  return parts.join(' ')
}
