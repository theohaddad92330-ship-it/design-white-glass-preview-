import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueries } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ANALYSIS_BATCH_MAX_ITEMS, type AnalysisBatch, type AnalysisBatchInput } from '@bellum/contracts'
import { toast } from 'sonner'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { apiFetch } from '@/lib/api'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { SoftBrake } from '@/features/credits/components/SoftBrake'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { launchPlanQueryOptions } from '@/features/search/hooks/useLaunchPlan'
import { exactBatchAnalysisCost } from '@/features/discover/lib/discover-batch-analyze-cost'
import { ActionPreview } from '@/components/ActionPreview'

/* ------------------------------------------------------------------ */
/*  #2809 (#2293.3) — la source `portfolio` de `POST /analysis-batches` :  */
/*  lancer un lot d'analyse COMPLET (pas seulement l'axe Signaux, déjà     */
/*  couvert par `RefreshSignalsDialog`) depuis la sélection de `/accounts`.*/
/*                                                                     */
/*  MÊME MOTEUR, MÊME DEVIS QUE DÉCOUVRIR (GA-26) — ce dialogue rejoue    */
/*  `AnalyzeSelectionDialog.tsx` (coût EXACT via `GET /analysis/launch-   */
/*  plan`, jamais un prix de grille recalculé) sans dépendre du modèle    */
/*  riche `DiscoverCandidate` (score/secteur/effectif…) qu'une ligne de   */
/*  portefeuille ne porte pas : les comptes ici sont DÉJÀ dans l'espace,  */
/*  identifiés par nom + SIREN, rien de plus n'est nécessaire pour ouvrir */
/*  ou relancer un dossier.                                              */
/*                                                                     */
/*  Un compte SANS SIREN (legacy/non-FR) est EXCLU du lot plutôt que      */
/*  deviné — « on n'affiche pas ce qu'on n'a pas » — et l'écran le NOMME. */
/* ------------------------------------------------------------------ */

interface AnalyzeBatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: { id: string; company_name: string; siren?: string | null }[]
  /** Appelé une fois le lot déposé — le caller vide sa sélection. */
  onDone: () => void
}

export function AnalyzeBatchDialog({ open, onOpenChange, accounts, onDone }: AnalyzeBatchDialogProps) {
  const { t } = useTranslation('accounts')
  const gate = useCreditGate()
  const [pending, setPending] = useState(false)
  const navigate = useNavigate()

  const withSiren = accounts.filter((account): account is { id: string; company_name: string; siren: string } =>
    Boolean(account.siren),
  )
  const noSiren = accounts.length - withSiren.length
  const targeted = withSiren.slice(0, ANALYSIS_BATCH_MAX_ITEMS)
  const capped = withSiren.length > targeted.length
  const count = targeted.length

  const isDemo = useIsDemo()
  const launchPlans = useQueries({
    queries: targeted.map(account => ({
      ...launchPlanQueryOptions(account.company_name, account.siren),
      enabled: open && !isDemo,
      retry: false,
      staleTime: 0,
    })),
  })
  const cost = exactBatchAnalysisCost({ isDemo, plans: launchPlans.map(query => query.data ?? null) })

  // #4464 — solde épuisé : frein doux (aucun chiffre), l'API reste seule juge du montant.
  const insufficientCredits = gate.known && !gate.canAnalyze && !gate.locked
  const canSubmit = count > 0 && !gate.locked && cost.measured && !insufficientCredits && !pending

  const submit = async () => {
    if (!canSubmit) return
    setPending(true)
    try {
      const items: AnalysisBatchInput[] = targeted.map(account => ({
        name: account.company_name,
        siren: account.siren,
      }))
      const batch = await apiFetch<AnalysisBatch, { source: 'portfolio'; items: AnalysisBatchInput[] }>({
        path: '/analysis-batches',
        method: 'POST',
        body: { source: 'portfolio', items },
      })
      toast.success(t('analyzeBatchDialog.success', { count }))
      onDone()
      onOpenChange(false)
      if (batch?.id) void navigate({ to: '/discover/lots/$batchId', params: { batchId: batch.id } })
    } catch {
      toast.error(t('analyzeBatchDialog.failed', { count }))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('analyzeBatchDialog.cancel')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('analyzeBatchDialog.title')}</DialogTitle>
          <DialogDescription>{t('analyzeBatchDialog.previewTitle')}</DialogDescription>
        </DialogHeader>

        <Box display="flex" className="max-h-40 flex-col gap-1 overflow-y-auto">
          {targeted.map(account => (
            <Text key={account.id} size="sm">
              {account.company_name}
            </Text>
          ))}
        </Box>

        {capped ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('analyzeBatchDialog.capped', { max: ANALYSIS_BATCH_MAX_ITEMS })}
          </Text>
        ) : null}
        {noSiren > 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('analyzeBatchDialog.noSiren', { count: noSiren })}
          </Text>
        ) : null}

        <ActionPreview
          title={t('analyzeBatchDialog.previewTitle')}
          rows={
            cost.measured
              ? [
                  {
                    label: t('analyzeBatchDialog.previewCountLabel'),
                    value: t('analyzeBatchDialog.countAnnounce', { count }),
                  },
                  ...(cost.demo
                    ? [{ label: t('analyzeBatchDialog.previewModeLabel'), value: t('analyzeBatchDialog.costDemo') }]
                    : []),
                  ...(cost.alreadyAnalyzed > 0
                    ? [
                        {
                          label: t('analyzeBatchDialog.alreadyAnalyzedLabel'),
                          value: t('analyzeBatchDialog.alreadyAnalyzed', { count: cost.alreadyAnalyzed }),
                        },
                      ]
                    : []),
                ]
              : [{ label: t('analyzeBatchDialog.previewCountLabel'), value: t('analyzeBatchDialog.costUnmeasured') }]
          }
        />

        {gate.locked ? (
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {t('analyzeBatchDialog.locked')}
          </Text>
        ) : null}
        {insufficientCredits ? <SoftBrake /> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('analyzeBatchDialog.cancel')}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {t('analyzeBatchDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
