import { Badge, Box, Text } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Target } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PersonalPriority } from '@bellum/contracts'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { ScoreCircle } from '@/components/ui/ScoreCircle'
import { SectionTitle, ShellCard } from '../cockpit/cockpitShared'

function PriorityRow({ priority }: { priority: PersonalPriority }) {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate({ to: '/accounts/$id', params: { id: priority.account_id } })}
      className="group grid w-full grid-cols-[auto_minmax(0,1fr)_44px_24px] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--bellum-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
    >
      <CompanyAvatar name={priority.company_name} size="sm" logoUrl={priority.logo_url} website={priority.website} />
      <Box className="min-w-0">
        <Box display="flex" className="items-center gap-2">
          <Text size="sm" weight="medium" className="truncate text-foreground">
            {priority.company_name}
          </Text>
          {priority.overdue && (
            <Badge variant="outline" className="shrink-0 border-[var(--bellum-danger)] text-[var(--danger-soft-text)]">
              {t('personal.overdueBadge')}
            </Badge>
          )}
        </Box>
        <Text size="xs" className="truncate text-muted-foreground">
          {priority.reason}
        </Text>
      </Box>
      <ScoreCircle score={priority.priority_score} size="sm" />
      <ArrowRight className="size-4 text-[var(--bellum-text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

export function MyPrioritiesCard({ priorities }: { priorities: PersonalPriority[] }) {
  const { t } = useTranslation('dashboard')
  return (
    <ShellCard>
      <SectionTitle icon={Target} title={t('personal.prioritiesTitle')} />
      <Box className="mt-4 space-y-1">
        {priorities.length > 0 ? (
          priorities.map(priority => <PriorityRow key={priority.account_id} priority={priority} />)
        ) : (
          <Box className="py-6">
            <Text size="sm" className="text-muted-foreground">
              {t('personal.prioritiesEmpty')}
            </Text>
          </Box>
        )}
      </Box>
    </ShellCard>
  )
}
