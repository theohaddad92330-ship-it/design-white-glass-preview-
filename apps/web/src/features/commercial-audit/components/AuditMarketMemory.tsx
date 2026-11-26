import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Text } from '@bellum/ui'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useMarketContextSearch } from '@/features/search/hooks/useMarketContextSearch'
import { deriveMarketAwarenessQuery } from '@/features/welcome/lib/market-awareness'
import { AuditCard } from './AuditCard'
import { buildAuditMarketMemoryAccounts } from '../lib/audit-market-memory'

/**
 * #2090.36 — UN BLOC FORT MÉMOIRE MARCHÉ, DANS L'AUDIT.
 *
 * `MarketAwarenessCard` (le même moteur : #1626/#1627) vit sur `/welcome`,
 * jamais dans l'audit — un commercial qui relit son audit trois mois plus
 * tard ne repasse pas par l'onboarding pour la revoir. Ce composant réutilise
 * le MÊME hook, le MÊME endpoint (`GET /companies/market-context-search`,
 * ZÉRO crédit) et le MÊME recoupement (`marketFitFor`) — jamais un second
 * calcul qui pourrait diverger (GA-26).
 *
 * ⚠️ Vocabulaire : « Compatible » / « Observé » / « À qualifier » — jamais
 * « Recrute », « Besoin ouvert », « Client certain », « Fournisseur en
 * place » ni « Externalise aujourd'hui » (#2090.42 / #2090.43, GA-259 :
 * gardé par `audit-market-memory-vocabulary.test.ts`).
 *
 * Rien n'est bloquant : sans zone ni expertise déclarée, ou sans résultat, ce
 * bloc ne rend RIEN — même discipline que `MarketAwarenessCard`.
 */
export function AuditMarketMemory() {
  const { t } = useTranslation('commercialAudit')
  const navigate = useNavigate()
  const { data: esnAnswers } = useEsnProfile()
  const query = deriveMarketAwarenessQuery(esnAnswers)
  const { data: read, isPending } = useMarketContextSearch(query)

  if (!query || isPending || !read || read.status !== 'ok' || read.matches.length === 0) return null

  const declared = esnAnswers?.expertise_areas ?? []
  const accounts = buildAuditMarketMemoryAccounts(read.matches, declared)

  const goToDiscover = () => {
    void navigate({
      to: '/discover',
      search: {
        ...(query.technology ? { mc_technology: query.technology } : {}),
        ...(query.location ? { mc_location: query.location } : {}),
      },
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text element="h2" size="lg" weight="semibold">
          {t('marketMemory.title')}
        </Text>
        <Badge variant="primary">{t('marketMemory.badge')}</Badge>
      </div>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('marketMemory.limit')}
      </Text>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map(account => (
          <AuditCard key={account.companyName} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Text element="h3" size="sm" weight="semibold">
                {account.companyName}
              </Text>
              <Badge variant={account.compatible ? 'success' : 'outline'}>
                {account.compatible ? t('marketMemory.compatible') : t('marketMemory.toQualify')}
              </Badge>
            </div>
            {account.matchedExpertises.length > 0 ? (
              <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('marketMemory.observed', { stack: account.matchedExpertises.join(' · ') })}
              </Text>
            ) : null}
          </AuditCard>
        ))}
      </div>

      <Button type="button" variant="default" size="sm" onClick={goToDiscover}>
        {t('marketMemory.cta')}
      </Button>
    </section>
  )
}
