import type { ConsultantEngagementConflict, ConsultantEngagementResult } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4196 (épopée #4191, lot L5) — « La fiche dit X (saisi le JJ/MM/AAAA) ; la
 * mission Y dit en mission » + « Aligner ».
 *
 * Quand une mission démarre, le consultant passe « en mission » — SAUF si sa
 * disponibilité a été saisie à la main : l'humain gagne, rien n'est écrasé. Cette
 * ligne NOMME alors l'écart au lieu de le taire, et « Aligner » est le geste humain
 * qui l'écrit. Pas d'écart, pas de ligne.
 */
export function ConsultantEngagementBanner({ consultantId }: { consultantId: string }) {
  const { t, i18n } = useTranslation(['missions', 'consultants'])
  const { user } = useSession()
  const qc = useQueryClient()
  const key = ['consultants', 'engagement', user?.id, consultantId] as const

  const query = useQuery<{ conflict: ConsultantEngagementConflict | null }>({
    queryKey: key,
    queryFn: () => apiFetch({ path: `/consultants/${consultantId}/engagement` }),
    enabled: !!user,
    staleTime: 15_000,
  })
  const align = useMutation<ConsultantEngagementResult, Error>({
    mutationFn: () => apiFetch({ path: `/consultants/${consultantId}/engagement/align`, method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['consultants'] })
      void qc.invalidateQueries({ queryKey: ['talents'] })
      void qc.invalidateQueries({ queryKey: ['record-links'] })
      toast.success(t('missions:engagement.aligned'))
    },
    onError: (error: Error) => toast.error(error.message || t('missions:lifecycle.error')),
  })

  const conflict = query.data?.conflict
  if (!conflict) return null
  const date = new Intl.DateTimeFormat(i18n.language, { timeZone: 'UTC' }).format(new Date(conflict.ficheEnteredAt))

  return (
    <Box
      display="flex"
      className="flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-5 py-3"
      role="status"
    >
      <Text size="sm" className="min-w-0 flex-1">
        {t('missions:engagement.conflict', {
          availability: t(`consultants:availability.${conflict.ficheAvailability}`),
          date,
          mission: conflict.missionLabel,
        })}
      </Text>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="pointer-coarse:min-h-11"
        isLoading={align.isPending}
        onClick={() => align.mutate()}
      >
        {t('missions:engagement.align')}
      </Button>
    </Box>
  )
}
