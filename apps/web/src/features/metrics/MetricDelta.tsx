import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { MetricDeltaGap, MetricDeltaTarget } from '@bellum/contracts'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { trendTone, type TrendSense } from '@/lib/trend'
import { useMetricDelta, type MetricDeltaPeriod } from './useMetricSeries'

/**
 * LA VARIATION D'UN COMPTEUR, POUR TOUT LE PRODUIT — un seul rendu (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN COMPOSANT PARTAGÉ, ET PAS UN PAR ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 31/08/2026, cinq écrans disaient « non mesuré » sur leurs deltas — avec
 * TROIS formulations différentes, et deux qui ne disaient rien du tout. Cinq
 * écrans, une seule cause : aucune route ne rendait l'historique des photos.
 *
 * La cause est corrigée. Si chaque écran refait ensuite son affichage, ils
 * divergeront au premier changement de règle — et il y a des règles ici : quand
 * écrire des points plutôt qu'un pourcentage, quoi dire du premier mois, comment
 * distinguer « pas encore » de « en panne », ce que la couleur a le droit de
 * signifier. Une dérivation vit à un seul endroit (GA-26), et un rendu qui PORTE
 * une règle est une dérivation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL REFUSE D'AFFICHER
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Un verdict pendant le chargement.** Il rend `null` tant que la requête
 *     est en vol. Écrire « non mesuré » à cet instant est une AFFIRMATION là où
 *     il n'y a qu'une attente : l'utilisateur va chercher une panne inexistante.
 *     C'est le défaut « zéro de chargement » sous une autre forme.
 *  2. **Un pourcentage sur un taux.** Un taux passé de 30 % à 33 % a gagné
 *     3 POINTS ; « +10 % » serait vrai sur un autre calcul et faux pour ce que
 *     l'écran montre. Le contrat le porte déjà (`changeUnit: 'points'`).
 *  3. **Un « non mesuré » sans raison.** Les quatre absences du contrat sont
 *     nommées, et la plus fréquente — le PREMIER MOIS — dit qu'elle est normale
 *     et quand la comparaison arrivera. Un espace créé en août n'a aucune photo
 *     de juillet : ce n'est pas une panne, et personne ne doit ouvrir d'incident.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA COULEUR N'EST JAMAIS SEULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le signe (« + » / « − ») porte le sens en TEXTE : la variation se lit sans
 * couleur, au lecteur d'écran comme en niveaux de gris. La couleur n'appuie que
 * si `sense` dit ce que MONTER veut dire — « besoins sans profil positionné :
 * +40 % » en vert serait un contresens, et c'est pourquoi le défaut est
 * `neutral`. Le verdict passe par `trendTone`, qui vit déjà à un seul endroit.
 *
 * ⚠️ Le composant charge la série LUI-MÊME. C'est ce qui rend le branchement
 * d'un écran tenable en une ligne, et ça ne coûte pas une requête par tuile :
 * les cinq tuiles d'une page partagent la même clé TanStack, donc le même appel.
 */
export function MetricDelta({
  metric,
  sense = 'neutral',
  period = 'previousMonth',
  showPopulation = false,
  className,
}: {
  /** Le compteur comparé — une métrique photographiée, ou une population. */
  metric: MetricDeltaTarget
  /** Ce que MONTER veut dire. Sans réponse, la variation reste grise. */
  sense?: TrendSense
  /** « vs mois dernier » (défaut) ou « vs N-1 ». */
  period?: MetricDeltaPeriod
  /**
   * Afficher « sur N » à côté de la variation.
   *
   * Défaut `false`, et c'est délibéré : la plupart des tuiles montrent déjà leur
   * population juste au-dessus, et la redire est la loi 4 du tome 7 enfreinte.
   * Là où la tuile ne montre qu'un compteur nu, l'activer est ce qui rend la
   * hausse lisible — « 7 sur 42 » s'améliore quand « 7 » tout court semble se
   * dégrader.
   */
  showPopulation?: boolean
  className?: string
}) {
  const { t, i18n } = useTranslation('pilotage')
  const { pending, delta, monthsCovered } = useMetricDelta(metric, period)

  // Tant que la requête est en vol, on n'affirme RIEN. Voir le point 1.
  if (pending) return null

  const muted = `text-[var(--bellum-text-muted)]${className ? ` ${className}` : ''}`
  const periodLabel = t(period === 'yearAgo' ? 'delta.vsYearAgo' : 'delta.vsPreviousMonth')

  if (!delta.measured) {
    return <UnknownValue reason={t(gapKey(delta.gap, monthsCovered))} className={className} />
  }

  const { change, changeUnit, percent, to } = delta
  // ⚠️ Le moins TYPOGRAPHIQUE (U+2212), jamais le trait d'union : c'est le même
  // caractère que `TrendLine`, et deux signes différents pour la même idée se
  // remarquent dès qu'ils sont côte à côte sur une page.
  const sign = change > 0 ? '+' : '−'
  // La décimale suit la LANGUE de l'interface (« 154,2 » en français, « 154.2 » en anglais) :
  // l'interpolation brute d'un nombre écrit toujours le point.
  const numberFormat = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 })
  const magnitude = numberFormat.format(Math.abs(change))
  const relative =
    percent === null
      ? ''
      : ` ${t('delta.percentAside', { sign: percent > 0 ? '+' : '−', value: numberFormat.format(Math.abs(percent)) })}`
  const body =
    changeUnit === 'points' ? `${sign}${t('delta.points', { value: magnitude })}` : `${sign}${magnitude}${relative}`

  const tone = change === 0 ? 'neutral' : trendTone(change > 0 ? 'up' : 'down', sense)
  const toneClass =
    tone === 'good'
      ? 'text-[var(--success-soft-text)]'
      : tone === 'bad'
        ? 'text-[var(--warning-soft-text)]'
        : 'text-[var(--bellum-text-muted)]'

  return (
    <Text element="span" size="xs" className={muted}>
      {/* Une variation NULLE est un fait MESURÉ, pas une absence : « stable » le
          dit mieux que « +0 », qui se lit comme un compteur cassé. */}
      <span className={toneClass}>
        {change === 0
          ? t('delta.stable', { period: periodLabel })
          : t('delta.withPeriod', { change: body, period: periodLabel })}
      </span>
      {showPopulation && typeof to.denominator === 'number'
        ? ` · ${t('delta.outOf', { count: to.denominator })}`
        : null}
    </Text>
  )
}

/**
 * POURQUOI la variation n'a pas pu être calculée — en toutes lettres.
 *
 * ⚠️ `no_previous_snapshot` a DEUX lectures, et les confondre serait le
 * contraire du service rendu : sur un espace qui n'a qu'une photo (ou aucune),
 * c'est le PREMIER MOIS et la comparaison arrive le mois prochain ; sur un
 * espace qui en a douze, c'est un TROU dans la série, donc un balayage qui a
 * manqué un passage — et là, quelqu'un doit aller voir. `monthsCovered`, que la
 * réponse porte exactement pour cette question, tranche entre les deux.
 */
function gapKey(gap: MetricDeltaGap, monthsCovered: number): string {
  if (gap === 'no_previous_snapshot') return monthsCovered <= 1 ? 'delta.firstMonth' : 'delta.noPrevious'
  if (gap === 'no_current_snapshot') return 'delta.noCurrent'
  if (gap === 'denominator_missing') return 'delta.denominatorMissing'
  return 'delta.notOrdered'
}
