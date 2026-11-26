import { Badge, Box, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Handshake } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PARTNER_PIPELINE_KEY, fetchPartnerRelations } from '@/features/partner-pipeline/api/partner-pipeline-api'
import { partnerGovernanceOnAccount } from '@/features/partner-pipeline/model/partnerGovernanceOnAccount'
import { apiFetch } from '@/lib/api'

/**
 * #3270.6 — SURFACE OPPORTUNITÉ : le cadre des ESN rang 2 en place chez le
 * compte de cette opportunité, avant d'envisager de leur confier un profil.
 *
 * Référence visuelle : `ProjectContactsPanel.tsx` (même section dans le tiroir :
 * titre à icône, lignes `rounded-md border bg-card`). Aucune lecture neuve : la
 * liste des partenaires du compte est celle de l'onglet Partenaires (même clé
 * de cache), les relations gouvernées celle de l'écran Partenaires. Statut et
 * risque viennent du serveur (GA-26). Sans présence rang 2 gouvernée, ou lecture
 * en échec : AUCUNE section — une absence ne fait pas de ligne, et une ESN
 * dont le nom traîne autour du compte n'est jamais présentée comme une route.
 */
interface AccountPartnersRead {
  partners?: { id: string; name: string; rank: string; partner_relation_id?: string | null }[]
}

export function ProjectPartnerGovernancePanel({ accountId }: { accountId: string | null }) {
  const { t } = useTranslation('projects')
  const { t: tPartner } = useTranslation('partnerPipeline')
  const { t: tPartners } = useTranslation('partners')

  const { data: onAccount } = useQuery({
    queryKey: ['partners', accountId],
    queryFn: () => apiFetch<AccountPartnersRead>({ path: `/accounts/${accountId}/partners` }),
    enabled: !!accountId,
    staleTime: 60_000,
  })
  const { data: relations } = useQuery({
    queryKey: PARTNER_PIPELINE_KEY,
    queryFn: fetchPartnerRelations,
    enabled: !!accountId,
    staleTime: 60_000,
  })

  const rows = useMemo(() => partnerGovernanceOnAccount(onAccount?.partners, relations), [onAccount, relations])
  if (rows.length === 0) return null

  return (
    <Box className="space-y-3" data-testid="project-partner-governance">
      <Box display="flex" className="items-center gap-2">
        <Handshake className="size-4 text-muted-foreground" aria-hidden />
        <Text element="h4" size="sm" weight="medium">
          {t('detailPartnerGovernance.title')}
        </Text>
      </Box>
      <Text size="xs" color="text-muted-foreground">
        {t('detailPartnerGovernance.help')}
      </Text>
      {rows.map(row => (
        <Box key={row.key} className="space-y-1 rounded-md border border-border bg-card p-2">
          <Box display="flex" className="items-center justify-between gap-2">
            <Text size="sm" weight="medium" className="truncate">
              {row.name}
            </Text>
            <Badge variant="outline" className="shrink-0">
              {tPartner(`governance.status.${row.status}`)}
            </Badge>
          </Box>
          <Text size="xs" color="text-muted-foreground">
            {tPartners(`detail.governance.risk.${row.risk}`)}
            {row.nextValidation
              ? ` · ${tPartner('governance.nextValidation', {
                  dimension: tPartner(`governance.dimension.${row.nextValidation}`),
                })}`
              : ''}
          </Text>
        </Box>
      ))}
      <Link
        to="/accounts/partners"
        className="inline-flex items-center text-xs text-[var(--bellum-text-accent)] hover:underline pointer-coarse:min-h-11"
      >
        {t('detailPartnerGovernance.open')}
      </Link>
    </Box>
  )
}
