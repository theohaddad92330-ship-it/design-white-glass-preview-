import { useTranslation } from 'react-i18next'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import type { FitAxisResult, FitTier } from '@/features/discover/lib/discover-ranking'
import { fitAxesFor, fitTierFor, HIGH_POTENTIAL_MIN_MEASURED } from '@/features/discover/lib/discover-ranking'
import { SCORE_BLOCKS } from '@/features/discover/lib/discover-score'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'

/* ------------------------------------------------------------------ */
/*  Palier de fit NOMMÉ (maquette p.20).                                */
/*                                                                     */
/*  Le score chiffré vit à côté, auditable (CandidateScore). Ce badge   */
/*  ne fait que NOMMER le palier déjà calculé — « Fit élevé / moyen /    */
/*  faible » — pour que la lecture d'un coup d'œil ne dépende pas de la  */
/*  lecture d'une fraction. Il ne s'affiche jamais quand le score est    */
/*  indisponible : un palier posé sur « rien mesuré » serait un faux.    */
/*                                                                     */
/*  `candidate` est OPTIONNEL : les deux appelants existants             */
/*  (`CandidateCard`, `CandidateRow`) restent hors du périmètre de ce    */
/*  chantier et continuent de passer `tier` seul — le badge rend alors   */
/*  EXACTEMENT ce qu'il rendait avant. Le fournir ajoute, à côté du       */
/*  palier, les cinq axes NOMMÉS qui l'expliquent (archive-05, item 15 : */
/*  Sujets 30 · Maturité 25 · Mission 20 · Précédent 15 · Appétence 10). */
/*  Ce n'est PAS un second score : `fitTierFor` reste seul juge du       */
/*  palier (T5-B) ; `fitAxesFor` ne fait que le DÉCOMPOSER.              */
/* ------------------------------------------------------------------ */

/* Les tonalités passent par les tokens de pastille : un fond translucide + un
 * texte pâle écrits en dur se lisaient sur du noir et disparaissaient sur du
 * blanc. Cf. src/styles/tokens.css et son test de contraste. */
const TONE: Record<FitTier, { bg: string; color: string; border: string }> = {
  high: { bg: 'var(--success-soft-bg)', color: 'var(--success-soft-text)', border: 'var(--success-soft-border)' },
  medium: { bg: 'var(--warning-soft-bg)', color: 'var(--warning-soft-text)', border: 'var(--warning-soft-border)' },
  low: { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', border: 'var(--border-subtle)' },
}

export function FitBadge({ tier, candidate }: { tier: FitTier; candidate?: DiscoverCandidate }) {
  const { t } = useTranslation('discover')
  const tone = TONE[tier]

  const pill = (
    <span
      title={t('card.fitHint', { minMeasured: HIGH_POTENTIAL_MIN_MEASURED, blocks: SCORE_BLOCKS.length })}
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}
    >
      {t(`card.fit.${tier}`)}
    </span>
  )

  if (!candidate) return pill

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {pill}
      <FitAxesDetail candidate={candidate} />
    </span>
  )
}

/**
 * #3551 — toute note a son libellé : le palier quand il se calcule, sinon
 * « Fit non évalué » (un score sans maximum mesurable). Sans score : rien.
 */
export function ScoreFitBadge({ candidate }: { candidate: DiscoverCandidate }) {
  const { t } = useTranslation('discover')
  const tier = fitTierFor(candidate)
  if (tier) return <FitBadge tier={tier} />
  if (candidate.score === null) return null
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
    >
      {t('card.fit.unrated')}
    </span>
  )
}

/**
 * Le fit, décomposé — à côté du palier, jamais à sa place.
 *
 * Réutilise la primitive `ScoreWithAxes` (déjà gardée par GA-18/GA-19) plutôt
 * que d'en refaire une seconde : un axe non évaluable sort du dénominateur, et
 * sous {@link FIT_AXES_MIN_MEASURED} axes mesurés `ScoreWithAxes` affiche déjà
 * « pas assez d'éléments pour calculer une note » — exactement le refus de
 * chiffre que la doctrine demande, sans phrase inventée ici.
 */
function FitAxesDetail({ candidate }: { candidate: DiscoverCandidate }) {
  const { t } = useTranslation('discover')
  const breakdown = fitAxesFor(candidate)

  const axes = breakdown.axes.map(axis => ({
    label: axisLabel(axis, t),
    score: axis.score,
    weight: axis.max,
    detail: axisDetail(axis, t),
  }))

  return <ScoreWithAxes score={breakdown.score} max={breakdown.max ?? 0} axes={axes} />
}

/** Un axe non évaluable porte sa raison DANS son libellé : `ScoreWithAxes` ne
 *  rend, pour les axes non évaluables, qu'une liste de libellés jointe — la
 *  raison doit donc y être pour être NOMMÉE, pas seulement l'axe. */
function axisLabel(axis: FitAxisResult, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (axis.score !== null) return t(`card.fitAxes.${axis.key}.label`)
  return t(`card.fitAxes.${axis.key}.labelWithReason`, { reason: t(`card.fitAxes.reasons.${axis.reason}`) })
}

/** Le seul axe dont la valeur mérite un mot d'explication au-delà du chiffre :
 *  « Précédent » est binaire, et 15 ou 0 ne dit pas de lui-même « déjà client »
 *  ou « pas encore ». Les autres axes portent leur explication ailleurs
 *  (`CandidateScore`, qui détaille déjà les facteurs `signals`/`it_surface`). */
function axisDetail(axis: FitAxisResult, t: (key: string) => string): string | undefined {
  if (axis.key !== 'precedent' || axis.score === null) return undefined
  return t(axis.score > 0 ? 'card.fitAxes.precedent.detailCustomer' : 'card.fitAxes.precedent.detailProspect')
}
