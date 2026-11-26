import { clientToolName, type Account } from '@bellum/contracts'
import { Badge, Text, Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { CheckCircle2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { crmPushApi } from '@/features/crm/api'
import { useAccountCrmProvenance } from '@/features/crm/hooks/useAccountCrmProvenance'
import { useCrmPresence } from '@/features/crm/hooks/useCrmPresence'
import { formatDate } from '@/lib/locale'
import { safeHref } from '@/lib/safe-href'

type CrmPresenceBadgeProps = {
  account: Account
}

/**
 * « Déjà dans mon CRM » header badge. Present-only : renders ONLY when a CRM is
 * connected AND it matched the account (`provider` set + `matched`). No CRM
 * connected, no match, or a still-loading/failed query → nothing (clean no-op).
 */
export function CrmPresenceBadge({ account }: CrmPresenceBadgeProps) {
  const { t } = useTranslation('accounts')
  const { data } = useCrmPresence({
    companyName: account.company_name,
    website: account.website,
    siren: account.siren,
  })

  // #4188.3 (R44) — le lien vers l'enregistrement ne vient QUE d'un envoi enregistré (id externe connu) ;
  // même clé de cache que le dialogue d'envoi (`CrmPushDialog`). Aucun lien composé à partir du nom.
  const exportsQuery = useQuery({
    queryKey: ['crm', 'push', 'account', account.id],
    queryFn: () => crmPushApi.accountExports(account.id),
    retry: false,
    enabled: Boolean(data?.provider && data.matched),
  })

  // #4680 — la présence se lit AUSSI en base : des contacts de provenance connue (import, ligne du CRM) déjà
  // rattachés au compte. Sans eux et sans connecteur, ce badge dit EXACTEMENT ce qu'il disait (rien).
  const known = useAccountCrmProvenance()?.knownContacts
  if (!data || !data.provider || !data.matched) {
    return known ? <ImportedPresence count={known.count} importedAt={known.importedAt} /> : null
  }

  const contactLine = data.contactsCount > 0 ? t('crmPresence.contacts', { count: data.contactsCount }) : null
  const dealLine = data.openDeals.length > 0 ? t('crmPresence.deals', { count: data.openDeals.length }) : null

  // #4188.3 (R44) — l'outil RÉELLEMENT branché qui porte l'enregistrement, nommé par la dérivation du registre.
  const tool = clientToolName(data.provider)
  const label = tool ? t('crmPresence.badgeIn', { tool }) : t('crmPresence.badge')
  const record = (exportsQuery.data?.items ?? []).find(item => item.provider === data.provider && item.record_url)
  const href = record?.record_url ? safeHref(record.record_url) : undefined

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex cursor-help items-center gap-1.5 outline-none">
          <Badge variant="success" className="gap-1 border-0" aria-label={label}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {label}
          </Badge>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="crm-presence-record-link"
              className="inline-flex min-h-11 items-center text-xs underline"
            >
              {t('crmPresence.openRecord')}
            </a>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px]">
        <Text element="p" size="xs" weight="medium">
          {t('crmPresence.tooltipTitle')}
        </Text>
        {(contactLine || dealLine) && (
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
            {[contactLine, dealLine].filter(Boolean).join(' · ')}
          </Text>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * #4680 — « Import de ton CRM » : la source est NOMMÉE telle qu'elle est (celle du CLIENT, jamais un fournisseur
 * deviné) et la date de l'import est DITE — ou « date non mesurée », jamais une date devinée.
 */
function ImportedPresence({ count, importedAt }: { count: number; importedAt: string | null }) {
  const { t } = useTranslation('accounts')
  const label = t('crmPresence.importedBadge')
  const date = formatDate(importedAt)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex cursor-help items-center gap-1.5 outline-none">
          <Badge variant="success" className="gap-1 border-0" aria-label={label} data-testid="crm-presence-imported">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {label}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px]">
        <Text element="p" size="xs" weight="medium">
          {t('crmPresence.importedTooltipTitle')}
        </Text>
        <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {t('crmPresence.importedContacts', { count })} ·{' '}
          {date ? t('crmPresence.importedOn', { date }) : t('crmPresence.importedDateUnknown')}
        </Text>
      </TooltipContent>
    </Tooltip>
  )
}
