import { Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SOFT_BRAKE_CONTACT_HREF } from '@/features/credits/lib/soft-brake'

/**
 * #4464.2 — LE lien pour parler à l'équipe, un seul (GA-26). Mesuré en production sur un espace verrouillé : le
 * texte « quota atteint » s'affichait sans aucun moyen de joindre l'équipe, parce que la branche « verrouillé »
 * n'avait que le texte nu. Toute branche qui dit « c'est en pause » monte ce lien.
 */
export function SoftBrakeContact() {
  const { t } = useTranslation('common')
  return (
    <a
      href={SOFT_BRAKE_CONTACT_HREF}
      className="inline-flex min-h-6 items-center gap-1 font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
    >
      <Mail className="size-3.5" aria-hidden />
      {t('softBrake.contact')}
    </a>
  )
}

/**
 * #4464 — le frein doux, en ligne : ce que voit quelqu'un dont l'espace a
 * beaucoup servi. Ni chiffre, ni « crédit », ni bouton « recharger » — une
 * phrase tutoyée et un lien pour parler à l'équipe.
 */
export function SoftBrake({ className }: { className?: string }) {
  const { t } = useTranslation('common')
  return (
    <p
      role="status"
      className={className ?? 'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--bellum-text-secondary)]'}
    >
      <span>{t('softBrake.title')}</span>
      <SoftBrakeContact />
    </p>
  )
}
