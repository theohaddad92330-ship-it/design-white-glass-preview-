import { Box, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { WorkspaceProfile } from '@bellum/contracts'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'
import { useWorkspaceProfile } from '@/features/profile/hooks/useWorkspaceProfile'

const OPTIONS: readonly WorkspaceProfile[] = ['staffing', 'forfait_conseil']

/**
 * #4291.5 (#4270.1) — le profil d'espace « forfait / conseil », modifiable dans Réglages › Règles d'espace.
 *
 * Il se choisit à l'accueil (réponse `workspace_profile` du profil ESN) et la barre latérale comme les onglets de
 * section le lisent. Il n'avait aucun endroit où se changer que la page Offre du profil, que personne ne trouvait :
 * « 0 occurrence “forfait” sur 4 pages de réglages ». Il vit ICI et nulle part ailleurs (GA-26) — la page Offre du
 * profil ne le repose plus. Même donnée, même requête que `useWorkspaceProfile` : un seul cache.
 */
export function WorkspaceProfileSetting({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation('workspaceRules')
  const name = useId()
  const queryClient = useQueryClient()
  const current = useWorkspaceProfile()
  const save = useMutation({
    mutationFn: (value: WorkspaceProfile) => esnProfileApi.updateMine({ workspace_profile: value }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: esnProfileKeys.mine })
      toast.success(t('workspaceProfile.saved'))
    },
    onError: () => toast.error(t('workspaceProfile.saveFailed')),
  })

  return (
    <SettingsBlock label={t('workspaceProfile.label')} description={t('workspaceProfile.description')}>
      <Box role="radiogroup" aria-label={t('workspaceProfile.label')} className="flex flex-col gap-1 px-4 py-3">
        {OPTIONS.map(option => (
          <label
            key={option}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2 has-[:disabled]:cursor-default"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={current === option}
              disabled={!canEdit || save.isPending}
              onChange={() => save.mutate(option)}
              className="mt-1"
            />
            <span className="min-w-0">
              <Text element="span" size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                {t(`workspaceProfile.${option}`)}
              </Text>
              <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
                {t(`workspaceProfile.${option}Hint`)}
              </Text>
            </span>
          </label>
        ))}
        {current === null ? (
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
            {t('workspaceProfile.notChosen')}
          </Text>
        ) : null}
      </Box>
    </SettingsBlock>
  )
}
