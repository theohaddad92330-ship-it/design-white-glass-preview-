import { displayedSeniority } from '@bellum/contracts'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'

/**
 * #4016 L4.3 — la séniorité d'une fiche, avec la tranche DÉDUITE des années quand
 * personne ne l'a posée (`displayedSeniority`). Une valeur saisie s'affiche telle
 * quelle ; une valeur déduite porte « estimé » et dit sur quoi elle repose
 * (GA-412). `inconnu` reste une absence, jamais un rang.
 */
export function SeniorityLabel({ seniority, yearsExperience }: { seniority: string; yearsExperience?: number | null }) {
  const { t } = useTranslation('consultants')
  const { value, estimated } = displayedSeniority({ seniority, years_experience: yearsExperience })
  return (
    <>
      {t(`seniority.${value}`)}
      {estimated && yearsExperience != null ? (
        <>
          {' '}
          <EstimatedBadge basis={t('seniority.estimateBasis', { count: yearsExperience })} />
        </>
      ) : null}
    </>
  )
}

/** Le texte seul (sans badge) — pour un `title` de cellule tronquée ; l'écran rend le badge par {@link SeniorityLabel}. */
export function seniorityText(t: TFunction<'consultants'>, seniority: string, yearsExperience?: number | null): string {
  return t(`seniority.${displayedSeniority({ seniority, years_experience: yearsExperience }).value}`)
}
