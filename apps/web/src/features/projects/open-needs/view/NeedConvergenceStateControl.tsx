import type { ConvergenceState, OpenNeedRow } from '@bellum/contracts'
import { CONVERGENCE_STATES } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { openNeedsKeys } from '../api'

/**
 * #3409.2 — la NATURE d'un besoin : `PATCH /projects/needs/:id/convergence-state`
 * (`ProjectPipelineService.changeNeedConvergenceState`) existait, testée,
 * depuis le 26/09 sans AUCUN appelant côté produit — ni lecture (voir
 * `openNeedRowSchema.convergence_state`, ajouté par ce même lot), ni
 * écriture. Même patron que `NeedProfileTypeAgreementControl.tsx` : un
 * verdict déjà posé reste en badge, avec un bouton par AUTRE niveau pour le
 * changer, jamais un contrôle muet.
 *
 * Seule différence : `projet_plausible` (« simple signal ») exige de citer
 * au moins un signal fondateur (#2305.35,
 * `assertConvergenceCitesFoundingSignals`) — un dialogue s'ouvre pour ce
 * niveau, comme `NeedStaffableControl.tsx` en ouvre un pour motiver un refus.
 */
export function NeedConvergenceStateControl({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const qc = useQueryClient()
  const [askSignals, setAskSignals] = useState(false)
  const [signalsDraft, setSignalsDraft] = useState('')

  const cross = useMutation<unknown, Error, { to: ConvergenceState; foundingSignalIds?: string[] }>({
    mutationFn: body =>
      apiFetch({
        path: `/projects/needs/${need.id}/convergence-state`,
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: openNeedsKeys.all })
      toast.success(t('needSheet.convergenceState.label'))
    },
    onError: error => toast.error(t('needSheet.convergenceState.failed'), { description: error.message }),
  })

  const current = need.convergence_state ?? null
  const stop = (event: MouseEvent) => event.stopPropagation()

  const foundingSignalIds = signalsDraft
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0)

  return (
    <Box display="flex" className="flex-wrap items-center gap-1.5" onClick={stop}>
      {current != null ? (
        <Badge variant="outline">{t(`needSheet.convergenceState.${current}`)}</Badge>
      ) : (
        <Badge variant="outline">{t('needSheet.convergenceState.notEvaluated')}</Badge>
      )}
      {CONVERGENCE_STATES.filter(state => state !== current).map(state => (
        <Button
          key={state}
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-xs"
          disabled={cross.isPending}
          onClick={() => {
            if (state === 'projet_plausible') {
              setSignalsDraft('')
              setAskSignals(true)
              return
            }
            cross.mutate({ to: state })
          }}
        >
          {t('needSheet.convergenceState.setTo', { state: t(`needSheet.convergenceState.${state}`) })}
        </Button>
      ))}

      <Dialog open={askSignals} onOpenChange={setAskSignals}>
        <DialogContent closeLabel={t('common:actions.close')} onClick={stop}>
          <DialogHeader>
            <DialogTitle>{t('needSheet.convergenceState.projet_plausible')}</DialogTitle>
            <DialogDescription>{t('needSheet.convergenceState.founding_signals_hint')}</DialogDescription>
          </DialogHeader>

          <Box className="space-y-1">
            <Label htmlFor="convergence-founding-signals">
              {t('needSheet.convergenceState.founding_signals_label')}
            </Label>
            <Input
              id="convergence-founding-signals"
              value={signalsDraft}
              onChange={event => setSignalsDraft(event.target.value)}
              placeholder={t('needSheet.convergenceState.founding_signals_placeholder')}
            />
          </Box>

          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setAskSignals(false)}>
              {t('needSheet.convergenceState.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={foundingSignalIds.length === 0 || cross.isPending}
              onClick={() => {
                cross.mutate({ to: 'projet_plausible', foundingSignalIds })
                setAskSignals(false)
              }}
            >
              {t('needSheet.convergenceState.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
