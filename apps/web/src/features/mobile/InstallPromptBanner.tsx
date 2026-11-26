import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Banner, bannerActionClassName } from '@/components/layout/Banner'
import { useIsInstalled, useIsMobile } from './useIsMobile'
import { useInstallPrompt } from './useInstallPrompt'
import { isInstallEligible, markInstallEligible } from './install-eligibility'

/**
 * #2435.11 — L'INVITE D'INSTALLATION, APRÈS UN PREMIER SUCCÈS SEULEMENT.
 *
 * `hasFirstSuccess` est calculé par l'APPELANT (`ChatMain`, sur le fil réel :
 * au moins une réponse de Laura, jamais une bulle d'échec) — ce composant ne
 * sait rien du fil, il sait seulement AFFICHER ou non, une fois l'éligibilité
 * acquise. Mémorisée (`install-eligibility.ts`) pour qu'ouvrir un fil vierge
 * ensuite ne fasse pas disparaître l'invite déjà méritée.
 *
 * Rien ne s'affiche sans les QUATRE conditions réunies : mobile, pas déjà
 * installée, le navigateur a réellement tiré `beforeinstallprompt`
 * (`canInstall`), et l'éligibilité. Chacune peut, seule, tout masquer.
 */
export function InstallPromptBanner({ hasFirstSuccess }: { hasFirstSuccess: boolean }) {
  const { t } = useTranslation('chat')
  const isMobile = useIsMobile()
  const installed = useIsInstalled()
  const { canInstall, promptInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (hasFirstSuccess) markInstallEligible()
  }, [hasFirstSuccess])

  const eligible = hasFirstSuccess || isInstallEligible()

  if (!isMobile || installed || !canInstall || dismissed || !eligible) return null

  return (
    <Banner
      icon={Download}
      wrap="desktop"
      bodyClassName="block truncate"
      actions={
        <button type="button" className={bannerActionClassName('neutral')} onClick={() => void promptInstall()}>
          {t('install.action')}
        </button>
      }
      onDismiss={() => setDismissed(true)}
      dismissLabel={t('install.dismiss')}
    >
      {t('install.prompt')}
    </Banner>
  )
}
