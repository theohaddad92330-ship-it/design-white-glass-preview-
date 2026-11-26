import { memo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Text } from '@bellum/ui'
import { TagsField } from '@/features/onboarding/components/TagsField'
import { esnProfileKeys } from '@/features/profile/api'
import { InferredPlacedRoles } from './InferredPlacedRoles'
import { useEsnProfile } from '../hooks/useEsnProfile'
import { useEsnProfileWorkspaceMeta } from '../hooks/useEsnProfileWorkspaceMeta'
import { useSaveEsnProfile } from '../hooks/useSaveEsnProfile'
import { SettingsCard } from './SettingsCard'

/** Plafond aligné sur la question du complément (`PROFILE_QUESTIONS`, `MAX_MULTI`). */
const PLACED_ROLES_MAX = 6

/**
 * #3923 — DÉCISION LOUIS 09/10 : les métiers que l'espace place réellement se
 * déclarent à DEUX endroits — la question du complément Temps 2
 * (`PROFILE_QUESTIONS`, clé `placed_roles`) et ce champ de « Mon profil ».
 * UN seul stockage (GA-26) : `esn_profiles.placed_roles`, écrit par la MÊME
 * sauvegarde que le profil (`useSaveEsnProfile`). Lu par `signalRelevance`
 * (Découvrir) : une offre d'emploi hors métier passe après les autres.
 * Aucun métier déclaré se dit tel quel — jamais un métier deviné.
 */
export const PlacedRolesSection = memo(function PlacedRolesSection() {
  const { t } = useTranslation('profile')
  const profile = useEsnProfile()
  const { data: meta } = useEsnProfileWorkspaceMeta()
  const save = useSaveEsnProfile()
  const queryClient = useQueryClient()
  if (profile.isLoading || profile.isError) return null

  const values = profile.data?.placed_roles ?? []
  const locked = (meta?.shared ?? false) && !(meta?.canEditCompany ?? true)
  const label = t('placedRoles.label')
  const savePlacedRoles = (next: string[]) =>
    save.mutate(
      { placed_roles: next },
      {
        onSuccess: () => {
          toast.success(t('placedRoles.saved'))
          // Le déclaré a bougé : les déduits proposés se relisent (déjà déclarés exclus).
          void queryClient.invalidateQueries({ queryKey: esnProfileKeys.placedRolesInference })
        },
        onError: () => toast.error(t('placedRoles.error')),
      },
    )

  return (
    <SettingsCard title={t('placedRoles.title')} description={t('placedRoles.description')}>
      <div className="space-y-3">
        {values.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('placedRoles.empty')}
          </Text>
        ) : null}
        {locked ? (
          <>
            {values.length > 0 ? <Text size="sm">{values.join(', ')}</Text> : null}
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('placedRoles.locked')}
            </Text>
          </>
        ) : (
          <TagsField
            values={values}
            max={PLACED_ROLES_MAX}
            ariaLabel={label}
            placeholder={t('placedRoles.placeholder')}
            onChange={savePlacedRoles}
          />
        )}
        {/* Métiers placés DÉDUITS (11/10/2026) — badge « déduit », indices, Confirmer / Retirer. */}
        <InferredPlacedRoles
          locked={locked}
          onConfirm={role => {
            if (values.some(value => value.trim().toLowerCase() === role.trim().toLowerCase())) return
            if (values.length >= PLACED_ROLES_MAX) {
              toast.error(t('placedRoles.inferred.full'))
              return
            }
            savePlacedRoles([...values, role])
          }}
        />
      </div>
    </SettingsCard>
  )
})
