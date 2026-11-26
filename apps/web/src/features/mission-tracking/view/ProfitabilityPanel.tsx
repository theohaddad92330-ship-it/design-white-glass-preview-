import { Box, Text } from '@bellum/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMonth } from '@/lib/locale'
import { monthsBack, useMarginTrend } from '../margin-trend'

type Period = 'month' | 'quarter' | 'year'

/**
 * RENTABILITÉ DES MISSIONS — la marge brute, mois par mois, RÉELLE.
 *
 * La bascule Mois/Trimestre/Année de la maquette est conservée, mais
 * Trimestre et Année ne fabriquent AUCUN chiffre : il n'existe aucune
 * agrégation serveur à ces mailles (voir `margin-trend.ts`), et en calculer
 * une ici — une moyenne de pourcentages mensuels — serait une dérivation
 * neuve, non pondérée par le chiffre d'affaires, donc TROMPEUSE. Le panneau
 * le dit plutôt que de l'inventer.
 */
export function ProfitabilityPanel({ now = new Date() }: { now?: Date }) {
  const { t } = useTranslation('missionTracking')
  const [period, setPeriod] = useState<Period>('month')
  const months = useMemo(() => monthsBack(now, 6), [now])
  const { items, isLoading } = useMarginTrend(months)

  // ⚠️ Un mois NON MESURÉ ne pèse pas dans l'échelle, et surtout il ne s'y
  // replie pas sur zéro : `?? 0` ferait entrer une absence dans le calcul du
  // maximum comme si la marge avait été mesurée à 0 %. Ici ça ne change rien au
  // dessin — mais c'est exactement le geste que GA-19 compte, et la règle du
  // dépôt ne connaît pas d'exception « sans conséquence visible ».
  const measured = items.map(item => item.marginPercent).filter((value): value is number => value != null)
  const maxAbs = Math.max(1, ...measured.map(Math.abs))

  return (
    <Box className="flex flex-col gap-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Box className="flex flex-wrap items-center justify-between gap-3">
        <Text size="sm" weight="semibold">
          {t('profitability.title')}
        </Text>
        <Box className="flex gap-1" role="tablist" aria-label={t('profitability.title')}>
          {(['month', 'quarter', 'year'] as const).map(key => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={period === key}
              onClick={() => setPeriod(key)}
              className={
                period === key
                  ? 'rounded-md bg-[var(--bellum-surface-2)] px-2.5 py-1.5 text-xs font-medium pointer-coarse:min-h-11'
                  : 'rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--bellum-text-muted)] hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11'
              }
            >
              {t(`profitability.tabs.${key}`)}
            </button>
          ))}
        </Box>
      </Box>

      {period !== 'month' ? (
        <Text size="xs" color="text-muted-foreground">
          {t('profitability.unavailable', { period: t(`profitability.tabs.${period}`).toLowerCase() })}
        </Text>
      ) : null}

      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('common:states.loading')}
        </Text>
      ) : items.every(item => item.marginPercent === null) ? (
        <Text size="sm" color="text-muted-foreground">
          {t('profitability.empty')}
        </Text>
      ) : (
        <Box className="flex items-end gap-3" aria-hidden="true">
          {items.map(item => {
            const heightPercent =
              item.marginPercent === null ? 0 : Math.round((Math.abs(item.marginPercent) / maxAbs) * 100)
            return (
              <Box key={item.month} className="flex flex-1 flex-col items-center gap-1">
                <Box className="flex h-24 w-full items-end">
                  {item.marginPercent === null ? (
                    <Box className="h-1 w-full rounded-full bg-[var(--bellum-border)]" />
                  ) : (
                    <Box
                      className="w-full rounded-t-sm bg-[var(--bellum-primary-500)]"
                      style={{ height: `${Math.max(4, heightPercent)}%` }}
                    />
                  )}
                </Box>
                <Text size="xs" color="text-muted-foreground" className="text-center">
                  {formatMonth(item.month)?.slice(0, 3) ?? item.month}
                </Text>
              </Box>
            )
          })}
        </Box>
      )}

      {/* La table qui porte le VRAI chiffre — la barre est décorative,
          au lecteur d'écran comme au thème sombre où une hauteur seule ne
          suffit pas. */}
      <Box className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {items.map(item => (
          <Box key={item.month} className="flex items-center justify-between gap-2 text-xs">
            <Text element="span" size="xs" color="text-muted-foreground">
              {formatMonth(item.month)}
            </Text>
            <Text element="span" size="xs">
              {item.marginPercent === null ? t('common:unknownValue') : `${item.marginPercent.toFixed(1)} %`}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
