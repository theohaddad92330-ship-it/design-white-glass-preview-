import { cn } from '@bellum/ui'
import { Check, CircleHelp, UserSearch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CrmMatchStatus } from './organigrammeData'

const STATUS_STYLE: Record<CrmMatchStatus, { Icon: typeof Check; tone: string }> = {
  known: { Icon: Check, tone: 'text-[var(--success-soft-text)]' },
  uncertain: { Icon: CircleHelp, tone: 'text-[var(--bellum-warning-text)]' },
  notFound: { Icon: UserSearch, tone: 'text-[var(--bellum-text-muted)]' },
}

/**
 * #4056.1 — la superposition CRM sur une carte de l'organigramme : « Dans vos contacts »,
 * « Rapprochement incertain », « Détectée, non retrouvée ». Le LIBELLÉ porte le sens (icône
 * et teinte ne font que l'accompagner : la couleur seule ne suffit pas). Aucune fusion ici :
 * l'incertain se nomme, il ne se résout pas tout seul.
 */
export function OrgCrmMatchBadge({ status, className }: { status?: CrmMatchStatus | null; className?: string }) {
  const { t } = useTranslation('accountOrg')
  if (!status) return null
  const { Icon, tone } = STATUS_STYLE[status]
  return (
    <p
      data-org-crm-match={status}
      title={t(`orgGraph.crmMatch.${status}Hint`)}
      className={cn('mt-1 flex items-center gap-1 text-xs', tone, className)}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span>{t(`orgGraph.crmMatch.${status}`)}</span>
    </p>
  )
}
