import type { OpenNeedRow, StaffableVerdict } from '@bellum/contracts'
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
  Textarea,
} from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { i18n } from '@/i18n'
import { openNeedsKeys } from '../api'

const REASON_MAX = 200

/** Les motifs de non-staffabilité de l'espace : les siens d'abord, les
 *  propositions ensuite. Ils sont PROPOSÉS — le texte reste libre. */
function useUnstaffableReasons(enabled: boolean) {
  return useQuery({
    queryKey: ['projects', 'unstaffable-reasons', i18n.language],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      apiFetch<{ items: { label: string; used: boolean }[] }>({
        path: `/projects/needs/unstaffable-reasons?lang=${i18n.language.startsWith('en') ? 'en' : 'fr'}`,
      }),
  })
}

/**
 * La porte G3 — « Ce besoin est-il staffable ? » (PDF 2 §7.6).
 *
 * Trois issues, et une seule ouvre un formulaire : « non ». Ce n'est pas une
 * asymétrie de confort — c'est ce motif, et lui seul, qui produit le taux de
 * besoins refusés PAR CAUSE, c'est-à-dire ce que l'ESN ne sait pas faire.
 */
export function NeedStaffableControl({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const qc = useQueryClient()
  const [askReason, setAskReason] = useState(false)
  const [draft, setDraft] = useState('')
  const { data: reasons } = useUnstaffableReasons(askReason)

  const cross = useMutation<OpenNeedRow, Error, { verdict: StaffableVerdict; reason: string | null }>({
    mutationFn: body =>
      apiFetch<OpenNeedRow, { verdict: StaffableVerdict; reason: string | null }>({
        path: `/projects/needs/${need.id}/staffable`,
        method: 'PATCH',
        body,
      }),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: openNeedsKeys.all })
      qc.invalidateQueries({ queryKey: ['projects', 'unstaffable-reasons'] })
      toast.success(t(`staffable.done.${result.staffable ?? 'unknown'}`))
    },
    onError: error => toast.error(t('staffable.failed'), { description: error.message }),
  })

  const stop = (event: MouseEvent) => event.stopPropagation()

  return (
    <Box display="flex" className="items-center gap-1" onClick={stop}>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-xs"
        disabled={cross.isPending}
        onClick={() => cross.mutate({ verdict: 'yes', reason: null })}
      >
        {t('staffable.yes')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-xs"
        disabled={cross.isPending}
        onClick={() => {
          setDraft('')
          setAskReason(true)
        }}
      >
        {t('staffable.no')}
      </Button>

      <Dialog open={askReason} onOpenChange={setAskReason}>
        <DialogContent closeLabel={t('common:actions.close')} onClick={stop}>
          <DialogHeader>
            <DialogTitle>{t('staffable.dialog.title', { role: need.title })}</DialogTitle>
            <DialogDescription>{t('staffable.dialog.description')}</DialogDescription>
          </DialogHeader>

          <Box display="flex" className="flex-wrap gap-1">
            {(reasons?.items ?? []).map(item => (
              <Button
                key={item.label}
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={() => setDraft(item.label)}
              >
                {item.label}
              </Button>
            ))}
          </Box>

          <Textarea
            value={draft}
            maxLength={REASON_MAX}
            onChange={event => setDraft(event.target.value.slice(0, REASON_MAX))}
            placeholder={t('staffable.dialog.placeholder')}
            rows={3}
          />

          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setAskReason(false)}>
              {t('staffable.dialog.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={draft.trim().length === 0 || cross.isPending}
              onClick={() => {
                cross.mutate({ verdict: 'no', reason: draft.trim() })
                setAskReason(false)
              }}
            >
              {t('staffable.dialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
