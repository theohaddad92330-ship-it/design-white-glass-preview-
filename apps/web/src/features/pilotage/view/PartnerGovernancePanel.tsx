import { Card, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Handshake } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PARTNER_PIPELINE_KEY, fetchPartnerRelations } from '@/features/partner-pipeline/api/partner-pipeline-api'
import { useSession } from '@/lib/hooks/use-session'
import { summarizePartnerGovernance } from './partner-governance-summary'

/**
 * #3270.6 — SURFACE PILOTAGE de la gouvernance rang 2 : ce qui est cadré chez
 * mes partenaires et ce qu'il faut encore valider avant d'envoyer un profil.
 *
 * Référence visuelle : `WorkspaceLearningPanel.tsx` (même `Card`, même titre à
 * icône, mêmes lignes séparées par un filet). Aucune lecture neuve : la liste
 * est celle de l'écran Partenaires (`PARTNER_PIPELINE_KEY`), le statut et le
 * risque viennent du serveur (GA-26). Sans relation, ou lecture en échec, le
 * panneau se tait : une absence ne fait aucune ligne.
 */
export function PartnerGovernancePanel() {
  const { t } = useTranslation('pilotage')
  const { t: tPartner } = useTranslation('partnerPipeline')
  const { user } = useSession()
  const { data } = useQuery({
    queryKey: PARTNER_PIPELINE_KEY,
    queryFn: fetchPartnerRelations,
    enabled: !!user,
    staleTime: 60_000,
  })
  const summary = useMemo(() => (Array.isArray(data) ? summarizePartnerGovernance(data) : null), [data])

  if (!summary || summary.total === 0) return null

  return (
    <Card className="mt-6 p-4">
      <div className="flex items-center gap-2">
        <Handshake className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text size="sm" weight="semibold">
          {t('partnerGovernance.title')}
        </Text>
      </div>
      <Text size="xs" className="mt-1 block text-[var(--bellum-text-secondary)]">
        {t('partnerGovernance.intro', { count: summary.total })}
      </Text>
      <Text size="xs" className="mt-2 block text-[var(--bellum-text-muted)]">
        {summary.byStatus.map(row => `${tPartner(`governance.status.${row.status}`)} ${row.count}`).join(' · ')}
      </Text>

      {summary.toFrame.length === 0 ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('partnerGovernance.allFramed')}
        </Text>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {summary.toFrame.map(row => (
            <div
              key={row.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[var(--bellum-border)] pt-2 first:border-0 first:pt-0"
            >
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                {row.name}
              </Text>
              {row.nextValidation && (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {tPartner('governance.nextValidation', {
                    dimension: tPartner(`governance.dimension.${row.nextValidation}`),
                  })}
                </Text>
              )}
            </div>
          ))}
          {summary.toFrameTotal > summary.toFrame.length && (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('partnerGovernance.more', { count: summary.toFrameTotal - summary.toFrame.length })}
            </Text>
          )}
        </div>
      )}
      <Link
        to="/accounts/partners"
        className="mt-3 inline-flex items-center text-xs text-[var(--bellum-text-accent)] hover:underline pointer-coarse:min-h-11"
      >
        {t('partnerGovernance.open')}
      </Link>
    </Card>
  )
}
