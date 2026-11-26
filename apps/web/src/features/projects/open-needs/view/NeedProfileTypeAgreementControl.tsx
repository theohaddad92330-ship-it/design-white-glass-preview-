import type { OpenNeedRow, ProfileTypeAgreement } from '@bellum/contracts'
import { PROFILE_TYPE_AGREEMENTS } from '@bellum/contracts'
import { Badge, Box, Button } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { openNeedsKeys } from '../api'

/**
 * #2323.18 — la porte PRÉSENTER, « accord sur le type de profil » — même
 * patron que `NeedStaffableControl.tsx` pour la porte G3, sans dialogue :
 * aucune issue de l'issue #2323 n'exige de motif pour ce geste.
 *
 * Un verdict DÉJÀ posé reste affiché en badge, avec un bouton pour le
 * changer — jamais un contrôle qui redevient muet une fois répondu, à la
 * différence du staffable qui, lui, se clôt (deux issues qui ne bougent plus
 * une fois franchies). `unknown` reste éditable à tout moment : « pas encore
 * demandé au client » n'est jamais un état terminal.
 */
export function NeedProfileTypeAgreementControl({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const qc = useQueryClient()

  const cross = useMutation<OpenNeedRow, Error, ProfileTypeAgreement>({
    mutationFn: agreement =>
      apiFetch<OpenNeedRow, { agreement: ProfileTypeAgreement }>({
        path: `/projects/needs/${need.id}/profile-type-agreement`,
        method: 'PATCH',
        body: { agreement },
      }),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: openNeedsKeys.all })
      toast.success(t(`needSheet.profileTypeAgreement.${result.profile_type_agreement ?? 'unknown'}`))
    },
    onError: error => toast.error(t('needSheet.profileTypeAgreement.failed'), { description: error.message }),
  })

  const current = need.profile_type_agreement ?? 'unknown'
  const stop = (event: MouseEvent) => event.stopPropagation()

  return (
    <Box display="flex" className="flex-wrap items-center gap-1.5" onClick={stop}>
      {current !== 'unknown' ? <Badge variant="outline">{t(`needSheet.profileTypeAgreement.${current}`)}</Badge> : null}
      {PROFILE_TYPE_AGREEMENTS.filter(state => state !== current).map(state => (
        <Button
          key={state}
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-xs"
          disabled={cross.isPending}
          onClick={() => cross.mutate(state)}
        >
          {t('needSheet.profileTypeAgreement.setTo', { state: t(`needSheet.profileTypeAgreement.${state}`) })}
        </Button>
      ))}
    </Box>
  )
}
