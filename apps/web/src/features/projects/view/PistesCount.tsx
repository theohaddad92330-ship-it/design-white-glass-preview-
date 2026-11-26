import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { usePistesToReview } from '@/features/crm-counters/usePistesToReview'

/**
 * #4191 (recette 2, E2) — le nombre de pistes de `/projects/pistes`, lu sur LE compteur partagé
 * (`pistes_to_review`) : le même que la ligne « N pistes » du Pipe et que « besoins détectés » de
 * Pilotage. Non mesuré : rien, jamais « 0 » (GA-18/19).
 *
 * #4545 — ZÉRO se tait aussi : `pistes_to_review` compte les DÉTECTIONS à confirmer, alors que le tableau
 * dessous montre aussi les besoins par compte. « 0 piste à revoir » au-dessus de 2 708 lignes était faux ; une
 * absence ne fait aucune ligne. Le compteur partagé (`usePistesToReview`) n'est pas touché : Pilotage et le
 * Pipe disent toujours le même nombre.
 */
export function PistesCount() {
  const { t } = useTranslation('projects')
  const count = usePistesToReview()
  if (count === null || count === 0) return null
  return (
    <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]" data-testid="pistes-count">
      {t('pistes.count', { count })}
    </Text>
  )
}
