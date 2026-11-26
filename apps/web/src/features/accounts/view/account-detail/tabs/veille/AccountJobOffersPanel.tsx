import { useState, type FormEvent } from 'react'
import { Briefcase, ExternalLink, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ACCOUNT_JOB_OFFER_TERM_MAX, ACCOUNT_JOB_OFFERS_MAX, ACCOUNT_JOB_OFFERS_STEP } from '@bellum/contracts'
import { Box, Button, Input, Text } from '@bellum/ui'
import { useOfferContractLabel } from '@/lib/offer-contract-label'
import { useAccountJobOffers } from '@/features/accounts/hooks/useAccountJobOffers'

function publishedLabel(value: string | null, locale: string): string | null {
  if (!value) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString(locale)
}

/**
 * Louis 30/10 — « rechercher d'autres métiers, en afficher plus, 5 par 5, jusqu'à 50 ». La collecte du
 * dossier suit les métiers du profil ; ici le commercial nomme un AUTRE métier (ou aucun : tous métiers),
 * puis déroule les offres du compte cinq par cinq. Rien ne part avant le geste.
 */
export function AccountJobOffersPanel({ accountId }: { accountId: string }) {
  const { t, i18n } = useTranslation('accountWatch')
  const contractLabel = useOfferContractLabel()
  const [draft, setDraft] = useState('')
  const [term, setTerm] = useState<string | null>(null)
  const [visible, setVisible] = useState(ACCOUNT_JOB_OFFERS_STEP)
  const query = useAccountJobOffers(accountId, term)
  const offers = query.data?.offers ?? []
  const shown = offers.slice(0, visible)
  const remaining = offers.length - shown.length

  function submit(event: FormEvent) {
    event.preventDefault()
    setTerm(draft.split(/\s+/).filter(Boolean).join(' '))
    setVisible(ACCOUNT_JOB_OFFERS_STEP)
  }

  return (
    <Box
      as="section"
      data-testid="account-job-offers"
      rounded="lg"
      className="space-y-3 border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
      aria-labelledby="account-job-offers-title"
    >
      <div className="flex items-center gap-2">
        <Briefcase className="size-4 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
        <Text element="h3" id="account-job-offers-title" size="sm" weight="semibold">
          {t('jobOffers.title')}
        </Text>
      </div>
      <Text size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('jobOffers.hint', { max: ACCOUNT_JOB_OFFERS_MAX })}
      </Text>
      <form className="flex flex-wrap gap-2" onSubmit={submit}>
        <Input
          className="min-w-0 flex-1"
          value={draft}
          maxLength={ACCOUNT_JOB_OFFER_TERM_MAX}
          onChange={e => setDraft(e.target.value)}
          placeholder={t('jobOffers.placeholder')}
          aria-label={t('jobOffers.label')}
        />
        <Button type="submit" icon={Search} isLoading={query.isFetching}>
          {t('jobOffers.search')}
        </Button>
      </form>

      {term === null || query.isPending ? null : query.isError ? (
        <Text size="sm" role="alert" data-testid="account-job-offers-error">
          {t('jobOffers.error')}
        </Text>
      ) : !query.data?.searched ? (
        <Text size="sm" role="status" data-testid="account-job-offers-unsearched">
          {t('jobOffers.unsearched')}
        </Text>
      ) : offers.length === 0 ? (
        <Text size="sm" role="status" data-testid="account-job-offers-empty">
          {term ? t('jobOffers.emptyTerm', { term }) : t('jobOffers.empty')}
        </Text>
      ) : (
        <div className="space-y-2">
          <Text size="sm" role="status" data-testid="account-job-offers-count">
            {t('jobOffers.count', { count: offers.length, shown: shown.length })}
          </Text>
          <ul className="divide-y divide-[var(--bellum-border)]" data-testid="account-job-offers-list">
            {shown.map((offer, index) => {
              const date = publishedLabel(offer.publishedAt, i18n.language)
              const meta = [
                offer.employer,
                offer.city,
                // #5000.1 — jamais tu : « non précisé » quand l'annonce ne déclare rien.
                contractLabel(offer.contractType),
                // #5010.1 — site d'origine (hôte de l'URL, liste fermée) ; rien s'il n'est pas connu.
                offer.origin,
                date,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li
                  key={`${offer.url ?? offer.title}-${index}`}
                  className="flex items-start justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <Text size="sm" weight="medium">
                      {offer.title}
                    </Text>
                    {meta ? (
                      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                        {meta}
                      </Text>
                    ) : null}
                  </div>
                  {offer.url ? (
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[var(--bellum-text-secondary)]"
                      aria-label={t('jobOffers.open', { title: offer.title })}
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {remaining > 0 ? (
            <Button
              type="button"
              variant="outline"
              data-testid="account-job-offers-more"
              onClick={() => setVisible(v => Math.min(v + ACCOUNT_JOB_OFFERS_STEP, ACCOUNT_JOB_OFFERS_MAX))}
            >
              {t('jobOffers.more', { count: Math.min(ACCOUNT_JOB_OFFERS_STEP, remaining) })}
            </Button>
          ) : offers.length >= ACCOUNT_JOB_OFFERS_MAX ? (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="account-job-offers-cap">
              {t('jobOffers.cap', { max: ACCOUNT_JOB_OFFERS_MAX })}
            </Text>
          ) : null}
        </div>
      )}
    </Box>
  )
}
