import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { PROFILE_QUESTION_OPTIONS } from '@bellum/contracts'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useSaveEsnProfile } from '@/features/profile/hooks/useSaveEsnProfile'

/**
 * #3386 — le rôle MÉTIER du siège (Directeur d'agence, Business Manager…), réglé à UN
 * seul endroit : Réglages › Profil › Identité (GA-26). Il ouvrait l'écran Équipe, où
 * il a été retiré — deux endroits pour un même réglage. Il ordonne /briefing (c76 :
 * l'ordre des blocs change, jamais leur contenu).
 *
 * Aucune donnée neuve : c'est `esn_profiles.user_role`, la même réponse que le
 * profil progressif, enregistrée par la MÊME sauvegarde (`useSaveEsnProfile`) et
 * choisie dans le MÊME catalogue (`PROFILE_QUESTION_OPTIONS.user_role`). Un rôle métier
 * se déclare, il ne s'attribue pas à quelqu'un d'autre. Non renseigné se dit « Non renseigné », jamais un rôle deviné.
 */
export function BusinessRoleField() {
  const { t } = useTranslation('profile')
  const profile = useEsnProfile()
  const save = useSaveEsnProfile()
  if (profile.isLoading || profile.isError) return null

  const current = typeof profile.data?.user_role === 'string' ? profile.data.user_role : ''
  const label = t('identity.businessRole.label')

  return (
    <div className="space-y-1.5">
      <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
        {label}
      </Text>
      <Select
        value={current || undefined}
        disabled={save.isPending}
        onValueChange={next =>
          save.mutate(
            { user_role: next },
            {
              onSuccess: () => toast.success(t('identity.businessRole.saved')),
              onError: () => toast.error(t('identity.businessRole.error')),
            },
          )
        }
      >
        <SelectTrigger
          aria-label={label}
          className="max-w-xs border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)]"
        >
          <SelectValue placeholder={t('identity.businessRole.unset')} />
        </SelectTrigger>
        <SelectContent>
          {PROFILE_QUESTION_OPTIONS.user_role.map(role => (
            <SelectItem key={role} value={role}>
              {role}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('identity.businessRole.hint')}
      </Text>
    </div>
  )
}
