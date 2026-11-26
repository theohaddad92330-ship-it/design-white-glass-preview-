import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import type { ProjectRow, ProjectSimilarMatch } from '@bellum/contracts'
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSimilarProjects } from '../hooks/useSimilarProjects'
import { STAGE_VARIANT, asStage } from '../model/project-index'

/**
 * « Comparer à un besoin similaire sur un autre compte » (restitution V2 §7).
 *
 * Shows the SAME need where it also exists in the portfolio — real rows of the
 * `opportunities` table, found server-side inside the workspace. Each match is
 * justified by the words the two needs share; nothing is generated, and when the
 * portfolio holds nothing comparable the panel says so instead of padding the
 * list with the newest rows.
 *
 * Read-only: no write, no credit — hence no confirmation step (unlike the
 * reminder, which is confirmed before it writes).
 */
export function SimilarProjectsDialog({
  opportunity,
  open,
  onOpenChange,
  onOpenAccount,
}: {
  opportunity: ProjectRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenAccount: (accountId: string) => void
}) {
  const { t } = useTranslation('projects')
  const { data, isPending, isError } = useSimilarProjects(opportunity.id, open)
  const matches = data?.matches ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--bellum-text-primary)]">{t('similar.title')}</DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">
            {t('similar.subtitle', { need: opportunity.label })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {isPending ? <Text size="sm">{t('similar.loading')}</Text> : null}

          {isError ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('similar.error')}
            </Text>
          ) : null}

          {!isPending && !isError && matches.length === 0 ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('similar.empty')}
            </Text>
          ) : null}

          {matches.map(match => (
            <SimilarMatchRow key={match.id} match={match} onOpenAccount={onOpenAccount} />
          ))}

          {matches.length > 0 ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('similar.hint')}
            </Text>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
            {t('similar.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SimilarMatchRow({
  match,
  onOpenAccount,
}: {
  match: ProjectSimilarMatch
  onOpenAccount: (accountId: string) => void
}) {
  const { t } = useTranslation('projects')
  const lifecycle = asStage(match.stage)

  return (
    <div className="rounded-lg border border-[var(--bellum-border)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Text size="sm" weight="medium" className="truncate">
            {match.company_name ?? t('similar.unknownCompany')}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {match.label}
          </Text>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onOpenAccount(match.account_id)}>
          {t('similar.openAccount')}
          <ArrowUpRight className="size-4" />
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{t(`kinds.${match.kind}`, { defaultValue: match.kind })}</Badge>
        {lifecycle ? <Badge variant={STAGE_VARIANT[lifecycle]}>{t(`lifecycle.states.${lifecycle}`)}</Badge> : null}
        {match.offer ? <Badge variant="primary">{match.offer}</Badge> : null}
      </div>

      {/* La justification du rapprochement : les mots que les deux besoins
          partagent. C'est tout ce qui a produit le match — on le montre plutôt
          qu'un score opaque. */}
      {match.shared_terms.length > 0 ? (
        <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('similar.sharedTerms', { terms: match.shared_terms.join(', ') })}
        </Text>
      ) : null}
    </div>
  )
}
