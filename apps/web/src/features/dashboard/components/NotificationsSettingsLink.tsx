import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { BellDot } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * `#2018.5` — LES NOTIFICATIONS À L'ACCUEIL, SANS DUPLICATION.
 *
 * Décision de Louis du 18/09/2026 : poser le réglage ici dupliquerait un
 * réglage qui vit déjà dans le module `notifications` — un réglage vit à un
 * seul endroit (GA-26). L'accueil ne redemande donc RIEN : ni interrupteur,
 * ni lecture de préférence, ni compteur — un simple lien qui renvoie vers
 * `/settings/notifications`, exactement comme `PilotageAccroche` renvoie vers
 * `/pilotage` plutôt que de rejouer un second cockpit.
 */
export function NotificationsSettingsLink() {
  const { t } = useTranslation('dashboard')

  return (
    <Box
      display="flex"
      className="mb-4 items-center justify-between gap-3 rounded-xl border border-[var(--bellum-border)] p-4"
    >
      <Box display="flex" className="items-center gap-2 min-w-0">
        <BellDot className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('notificationsLink.label')}
        </Text>
      </Box>
      <Link
        to="/settings/notifications"
        className="shrink-0 text-sm text-[var(--bellum-text-accent)] underline underline-offset-2"
      >
        {t('notificationsLink.cta')}
      </Link>
    </Box>
  )
}
