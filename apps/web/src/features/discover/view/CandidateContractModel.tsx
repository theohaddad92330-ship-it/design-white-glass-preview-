import { useTranslation } from 'react-i18next'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { formatDateRange } from '@/lib/locale'

const JOB_KINDS = ['permanent', 'fixedTerm', 'interim', 'freelance', 'other'] as const

/**
 * #2291.2 — COMMENT CETTE ENTREPRISE CONTRACTUALISE, OBSERVÉ (DÉCISION Louis
 * 19/09/2026 : l'observer, jamais le déduire).
 *
 * Chaque ligne porte sa PÉRIODE et son VOLUME — #4068.4 (12/10/2026) revient
 * sur #2291.3 : la source ne se nomme plus. Un type à zéro n'est jamais
 * écrit : « 0 indépendant » se lirait « n'y recourt pas », ce qu'aucune offre
 * absente ne prouve. Clé absente (jamais cherché) : rien ; `null` (cherché,
 * rien d'attribuable) : « non observé ».
 */
export function CandidateContractModel({ model }: { model: DiscoverCandidate['contractModel'] }) {
  const { t } = useTranslation('discover')
  if (model === undefined) return null
  if (model === null) {
    return (
      <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        {t('card.contractModel.notObserved')}
      </p>
    )
  }
  const offers = model.jobOffers
  const notices = model.publicContracts
  const period = (since: string, until: string) => formatDateRange(since, until) ?? until

  const noticeModes = notices
    ? [
        notices.regie > 0 ? t('card.contractModel.regie', { count: notices.regie }) : null,
        notices.fixedPrice > 0 ? t('card.contractModel.fixedPrice', { count: notices.fixedPrice }) : null,
      ].filter((part): part is string => part !== null)
    : []

  return (
    <div className="mb-2">
      <p className="mb-1 text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {t('card.contractModel.title')}
      </p>
      {offers && (
        <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {t('card.contractModel.jobOffers', {
            count: offers.total,
            breakdown: JOB_KINDS.filter(kind => offers.counts[kind] > 0)
              .map(kind => t(`card.contractModel.kind.${kind}`, { count: offers.counts[kind] }))
              .join(' · '),
            period: period(offers.since, offers.until),
          })}
        </p>
      )}
      {notices && (
        <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {t('card.contractModel.publicContracts', {
            count: notices.total,
            breakdown: noticeModes.length > 0 ? noticeModes.join(' · ') : t('card.contractModel.modeUnstated'),
            period: period(notices.since, notices.until),
          })}
        </p>
      )}
      <p className="mt-1 text-xs italic" style={{ color: 'var(--text-muted)' }}>
        {t('card.contractModel.disclaimer')}
      </p>
    </div>
  )
}
