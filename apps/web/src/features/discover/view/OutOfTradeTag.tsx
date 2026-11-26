import { useTranslation } from 'react-i18next'

/**
 * #4284.10 (recette 21/10, L2) — la marque « hors de ton métier » d'une OFFRE (carte de /mes-cibles, « Autres
 * recrutements » de la fiche compte, ligne de la veille). Une offre hors métier n'est jamais cachée : elle est
 * rangée plus bas et se DIT. Même parole que la marque du compte (`OutOfTradeMark`) ; l'appelant décide
 * (`isOutOfTradeHiring`) — ici rien n'est deviné.
 */
export function OutOfTradeTag({ testId = 'offer-out-of-trade' }: { testId?: string }) {
  const { t } = useTranslation('discover')
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs"
      style={{ color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}
      title={t('card.outOfTradeOfferHelp')}
    >
      {t('card.outOfTrade')}
    </span>
  )
}
