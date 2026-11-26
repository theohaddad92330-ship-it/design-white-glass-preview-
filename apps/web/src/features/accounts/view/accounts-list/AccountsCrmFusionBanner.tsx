import { hasPermission } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4603.4 — LE GESTE du rattrapage : une société venue du CRM ET analysée à part est le MÊME compte, deux fois.
 * `POST /accounts/crm-fusions/sweep` (simulation par défaut) existait sans appelant dans `apps/web` — le stock de
 * paires déjà créées n'était donc jamais rattrapé. Ici : la simulation se lit seule (comptée, rien d'écrit), la
 * fusion part au clic. Renversement daté de la doctrine (Louis 26/10/2026, `c142`) : ces paires-là se fusionnent sans
 * demander ; le PASSAGE reste un geste, ciblé (bornée par le serveur), réversible (journal des fusions).
 *
 * Réservé à `integrations:manage` (le droit de qui branche le CRM) : tout autre rôle ne déclenche aucune requête.
 * Aucune paire ⇒ aucune ligne, jamais « 0 » (GA-18/19). Une simulation qui échoue ne montre rien : jamais un compte
 * inventé.
 */
export function AccountsCrmFusionBanner() {
  const { t } = useTranslation('accounts', { keyPrefix: 'crmFusion' })
  const { user } = useSession()
  const { team } = useTeam()
  const qc = useQueryClient()
  const allowed = team ? hasPermission(team.workspace.role, 'integrations:manage') : false

  const simulation = useQuery({
    queryKey: [...accountKeys.list(user?.id), 'crm-fusion-simulation'],
    queryFn: () => accountsApi.crmFusionSweep(true),
    enabled: !!user && allowed,
    staleTime: 60_000,
    retry: false,
  })
  const merge = useMutation({
    mutationFn: () => accountsApi.crmFusionSweep(false),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.list(user?.id) })
    },
    onError: () => {
      toast.error(t('error'))
    },
  })

  if (!allowed) return null
  if (merge.data) {
    if (merge.data.merged === 0) return null
    return (
      <div role="status" data-testid="accounts-crm-fusion-banner" className={BANNER}>
        <Text element="p" size="sm" className="text-[var(--bellum-text-primary)]">
          {t('done', { count: merge.data.merged })}
        </Text>
      </div>
    )
  }
  const found = simulation.data?.found
  if (!found) return null
  return (
    <div data-testid="accounts-crm-fusion-banner" className={BANNER}>
      <Text element="p" size="sm" className="min-w-0 flex-1 text-[var(--bellum-text-primary)]">
        {t('found', { count: found })}
      </Text>
      <Button size="sm" onClick={() => merge.mutate()} disabled={merge.isPending}>
        {t('merge')}
      </Button>
    </div>
  )
}

const BANNER =
  'mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3'
