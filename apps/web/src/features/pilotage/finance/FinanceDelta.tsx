import { DELTA_PERCENT_DECIMALS, DELTA_POINTS_DECIMALS, type MetricDelta } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { appLocale } from '@/lib/locale'

/**
 * LE rendu d'une variation période contre période, pour tout l'écran Finance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL NE CALCULE RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Il reçoit un `MetricDelta` déjà résolu par `metricDelta` (contrats). C'est la
 * seule porte : aucun composant ne soustrait deux photos lui-même, sans quoi les
 * cas de bord — base à zéro, base négative, population vide — seraient traités
 * deux fois et divergeraient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL REFUSE D'AFFICHER
 * ─────────────────────────────────────────────────────────────────────────────
 * Un zéro à la place d'une absence. La branche `measured: false` **ne porte pas
 * de champ `change`** : il n'y a littéralement rien à afficher, et c'est voulu.
 * Chaque raison a sa phrase, parce que « le premier mois de ton espace » et
 * « le balayage n'est pas passé » appellent deux réactions différentes — la
 * première est normale, la seconde s'ouvre en incident.
 *
 * ⚠️ **Un taux se lit en POINTS.** Un taux passé de 30 % à 33 % a gagné 3
 * points ; annoncer « +10 % » serait vrai sur un autre calcul et faux pour ce
 * que l'écran montre. Le contrat le porte (`changeUnit: 'points'`,
 * `percent: null`) — ce composant ne fait que l'obéir.
 *
 * Le SIGNE porte le sens en TEXTE : la variation se lit sans couleur, au lecteur
 * d'écran comme en niveaux de gris.
 */
export function FinanceDelta({
  delta,
  /** Le mois de RÉFÉRENCE, déjà formaté (« juil. 2026 »). */
  previousLabel,
  className,
}: {
  delta: MetricDelta
  previousLabel?: string | null
  className?: string
}) {
  const { t } = useTranslation('pilotage')
  const muted = `block text-[var(--bellum-text-muted)]${className ? ` ${className}` : ''}`

  if (!delta.measured) {
    return (
      <Text size="xs" className={muted}>
        {t('delta.notMeasured')} — {t(GAP_KEYS[delta.gap])}
      </Text>
    )
  }

  // `Intl` plutôt qu'un `toFixed` : le séparateur décimal d'un chiffre français
  // est la virgule, et « +12.4 % » au milieu d'un écran français se lit comme un
  // chiffre importé d'ailleurs.
  const sign = delta.change > 0 ? '+' : ''
  const value =
    delta.changeUnit === 'points'
      ? t('delta.points', { value: `${sign}${format(delta.change, DELTA_POINTS_DECIMALS)}` })
      : delta.percent !== null
        ? `${delta.percent > 0 ? '+' : ''}${format(delta.percent, DELTA_PERCENT_DECIMALS)} %`
        : t('delta.countThisMonth', { value: `${sign}${format(delta.change, 0)}` })

  return (
    <Text size="xs" className={muted}>
      {previousLabel ? t('delta.versus', { month: previousLabel }) : t('delta.vsPreviousMonth')} {value}
    </Text>
  )
}

/** Une raison, une phrase. Résolues par une table plutôt que par un `switch` :
 *  une clé oubliée se voit ici, pas au troisième `case` d'un bloc. */
const GAP_KEYS = {
  no_previous_snapshot: 'delta.firstMonth',
  no_current_snapshot: 'delta.noCurrent',
  denominator_missing: 'delta.denominatorMissing',
  periods_not_ordered: 'delta.notOrdered',
} as const

function format(value: number, decimals: number): string {
  return new Intl.NumberFormat(appLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)
}
