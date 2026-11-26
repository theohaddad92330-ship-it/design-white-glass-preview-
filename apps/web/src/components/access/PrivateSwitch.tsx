import { Checkbox, Text } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api'

type PrivateSwitchKind = 'projects' | 'needs' | 'missions'

/**
 * #4158.34 — l'interrupteur « Privé » de la fiche d'un projet, d'un besoin ou
 * d'une mission. Défaut : partagé (absent = faux). Le serveur tranche le droit
 * (porteur ou `team:manage`) : un refus remet la case à l'état réel au rechargement,
 * jamais un état deviné ici.
 */
export function PrivateSwitch({
  kind,
  id,
  isPrivate,
  invalidate,
}: {
  kind: PrivateSwitchKind
  id: string
  isPrivate: boolean | undefined
  /** Clés de cache à rafraîchir après le geste (la fiche et ses listes). */
  invalidate: ReadonlyArray<readonly unknown[]>
}) {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()
  const inputId = useId()
  const update = useMutation({
    retry: false,
    mutationFn: (next: boolean) =>
      apiFetch<{ id: string; is_private: boolean }, { is_private: boolean }>({
        path: `/privacy/${kind}/${id}`,
        method: 'PATCH',
        body: { is_private: next },
      }),
    onSettled: () => {
      for (const queryKey of invalidate) void queryClient.invalidateQueries({ queryKey })
    },
  })
  const checked = update.isPending ? (update.variables ?? false) : (isPrivate ?? false)

  return (
    <div className="flex min-h-11 items-center gap-2">
      <Checkbox
        id={inputId}
        checked={checked}
        disabled={update.isPending}
        onCheckedChange={value => update.mutate(value === true)}
      />
      <Text element="label" size="sm" htmlFor={inputId} title={t('privacySwitch.hint')}>
        {t('privacySwitch.label')}
      </Text>
      {update.isError ? (
        <Text size="xs" role="alert" className="text-[var(--bellum-text-secondary)]">
          {t('privacySwitch.error')}
        </Text>
      ) : null}
    </div>
  )
}
