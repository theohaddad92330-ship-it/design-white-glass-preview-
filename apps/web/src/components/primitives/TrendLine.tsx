import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { describeTrend, trendTone, type TrendDisplay, type TrendSense } from '@/lib/trend'

/**
 * L'évolution d'un chiffre d'un mois à l'autre — LE rendu, pour tout le
 * produit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE REFUSE D'AFFICHER
 * ─────────────────────────────────────────────────────────────────────────────
 * Un pourcentage quand il n'y a rien à diviser. C'est la seule règle, et elle a
 * quatre visages (voir `lib/trend.ts`) : le mois dernier valait zéro, les deux
 * mois valent zéro, le mois dernier n'a pas été MESURÉ, ou la valeur du jour
 * elle-même est inconnue. Aucun des quatre n'autorise « +100 % ».
 *
 * ⚠️ « rien le mois précédent » et « pas de photo le mois dernier » ne sont pas
 * la même phrase, et c'est délibéré : la première affirme un zéro qu'on a
 * mesuré, la seconde dit qu'on n'a pas regardé. Les rendre identiques serait
 * faire dire à un silence ce qu'un chiffre n'a jamais dit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA COULEUR N'EST JAMAIS SEULE, ET ELLE N'EST PAS TOUJOURS LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le signe (« + » / « − ») porte le sens en TEXTE : la tendance se lit sans
 * couleur, au lecteur d'écran comme en niveaux de gris. La couleur ne fait
 * qu'appuyer, et seulement quand `sense` dit ce que monter veut dire — un
 * « contacts sans adresse : +40 % » en vert serait un contresens.
 *
 * `showCurrent` : le cumul du mois n'est répété que là où il n'est pas déjà
 * affiché juste au-dessus (les tuiles du cockpit). Sur une ligne où le chiffre
 * est à trois centimètres, le redire est la loi 4 du tome 7 enfreinte.
 */
export function TrendLine({
  trend: display,
  sense = 'neutral',
  showCurrent = false,
  keepPercentUnderSmallBase = false,
  absoluteOnly = false,
  className,
}: {
  /** Ce que l'écran a le droit de dire — voir {@link TrendDisplay}. */
  trend: TrendDisplay
  sense?: TrendSense
  showCurrent?: boolean
  /** Garde le pourcentage sous une base de 10 (/team, décision Louis 14/10). */
  keepPercentUnderSmallBase?: boolean
  /** Un stock compté : l'écart se dit en nombre (« +1 358 »), jamais en pourcentage. */
  absoluteOnly?: boolean
  className?: string
}) {
  const { t, i18n } = useTranslation('common')
  const muted = `text-[var(--bellum-text-muted)]${className ? ` ${className}` : ''}`

  // Le chiffre lui-même n'a pas été compté : on ne dit rien de son évolution.
  if (display.state === 'silent') return null

  // Un STOCK que rien ne photographie. Distinct de `noSnapshot`, qui attend
  // une photo à venir : ici il n'y en aura jamais, et le dire est la seule
  // réponse honnête.
  if (display.state === 'stock') {
    return (
      <Text element="span" size="xs" className={muted}>
        {t('trend.stock')}
      </Text>
    )
  }

  const trend = describeTrend(display.current, display.previous, keepPercentUnderSmallBase, absoluteOnly)
  if (!trend) return null

  if (trend.kind === 'noSnapshot') {
    return (
      <Text element="span" size="xs" className={muted}>
        {t('trend.noSnapshot')}
      </Text>
    )
  }

  if (trend.kind === 'none') {
    return (
      <Text element="span" size="xs" className={muted}>
        {t('trend.none')}
      </Text>
    )
  }

  const thisMonth = showCurrent
    ? `${t('trend.thisMonth', { count: trend.current, formatted: trend.current.toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB') })} · `
    : ''

  if (trend.kind === 'noBaseline') {
    return (
      <Text element="span" size="xs" className={muted}>
        {thisMonth}
        {t('trend.noBaseline')}
      </Text>
    )
  }

  const tone = trendTone(trend.direction, sense)
  const toneClass =
    tone === 'good'
      ? 'text-[var(--success-soft-text)]'
      : tone === 'bad'
        ? 'text-[var(--warning-soft-text)]'
        : 'text-[var(--bellum-text-muted)]'

  return (
    <Text element="span" size="xs" className={muted}>
      {thisMonth}
      <span className={toneClass}>
        {trend.kind === 'absolute'
          ? t('trend.deltaAbsolute', {
              sign: trend.direction === 'up' ? '+' : '−',
              change: trend.change.toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB'),
            })
          : t('trend.delta', { sign: trend.direction === 'up' ? '+' : '−', percent: trend.percent })}
      </span>
    </Text>
  )
}
