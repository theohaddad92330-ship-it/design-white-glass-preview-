import type { OpenNeedRow } from '@bellum/contracts'
import { Badge, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'

/**
 * #3681 — LES DEMANDES ACTUELLES D'UN COMPTE : intitulé, périmètre, statut,
 * date utile, geste. Rien de ce qu'on ne sait pas ne fait une ligne (ni tiret,
 * ni zéro).
 *
 * ⚠️ UNE ANNONCE DE RECRUTEMENT INTERNE N'EST PAS UNE MISSION. Le seul témoin
 * est le TYPE du besoin (`contract_kind === 'recrutement'`), jamais une lecture
 * du titre : elle est nommée à part, sans geste, et ne compte pas comme demande
 * ouverte accessible à une ESN.
 */
export function AccountOpenDemands({ needs }: { needs: readonly OpenNeedRow[] }) {
  const { t } = useTranslation('projects')
  if (needs.length === 0) return null
  return (
    <section className="space-y-2" data-testid="open-demands" aria-label={t('accountTab.openDemands.title')}>
      <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
        {t('accountTab.openDemands.title')}
      </Text>
      {needs.map(need => {
        const deadline = formatDate(need.deadline_at)
        const start = deadline ? null : formatDate(need.start_on)
        const meta = [
          need.location?.trim() || null,
          need.headcount > 1 ? t('accountTab.openDemands.headcount', { count: need.headcount }) : null,
          deadline ? t('accountTab.openDemands.deadline', { date: deadline }) : null,
          start ? t('accountTab.openDemands.startsOn', { date: start }) : null,
        ].filter((part): part is string => part !== null)
        return (
          <div
            key={need.id}
            className="flex flex-col gap-2 rounded-md border border-[var(--bellum-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]" className="break-words">
                {need.title}
              </Text>
              {meta.length > 0 ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {meta.join(' · ')}
                </Text>
              ) : null}
              <Badge variant="outline" className="px-1 py-0 text-xs">
                {t('accountTab.openDemands.statusOpen')}
              </Badge>
            </div>
            <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
              <Link to="/projects/needs/$needId" params={{ needId: need.id }}>
                {t('accountTab.openDemands.see')}
              </Link>
            </Button>
          </div>
        )
      })}
    </section>
  )
}

/** Les annonces de recrutement interne : nommées, sans geste, jamais « à pourvoir ». */
export function InternalHireNotes({ needs }: { needs: readonly OpenNeedRow[] }) {
  const { t } = useTranslation('projects')
  if (needs.length === 0) return null
  return (
    <div className="space-y-1" data-testid="internal-hires">
      {needs.map(need => (
        <Text key={need.id} size="xs" color="text-[var(--bellum-text-muted)]">
          {t('accountTab.openDemands.internalHire', { title: need.title })}
        </Text>
      ))}
    </div>
  )
}
