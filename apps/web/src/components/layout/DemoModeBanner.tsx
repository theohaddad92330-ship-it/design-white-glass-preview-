import { Banner, bannerActionClassName } from './Banner'
import { FlaskConical } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useExitDemo } from '@/features/auth/hooks/useExitDemo'
import { useCredits } from '@/features/credits/hooks/useCredits'

/**
 * Permanent « Mode démo » strip shown on every page when the active workspace
 * is a demo space (`is_demo` from the credits payload — demo mode C1). Makes it
 * impossible to mistake the fictional seeded dossiers for real prospect data:
 * the banner states that data is fictional, credits are never consumed and real
 * analyses are disabled. Renders nothing on regular workspaces (including while
 * the credits query is still loading — `is_demo` is absent from the defaults).
 *
 * #2602.1 — recette en production du 18/09/2026 : une session entrée en
 * démonstration (`POST /demo/session`) n'en ressortait JAMAIS — aucun bandeau
 * « quitter », rien dans le menu compte, rien dans les Réglages. Seule issue
 * trouvée : fermer l'onglet. Ce bandeau EST déjà l'indicateur permanent — donc
 * c'est lui qui porte le geste de sortie, à portée de clic, plutôt qu'un
 * second endroit qui dirait la même chose (GA-26 : un réglage vit à un seul
 * endroit). Le geste passe par `useExitDemo` (29/09/2026 : navigation dure, car
 * le `navigate` de `useLogout` était annulé au premier clic) : révoque
 * l'appareil, vide le cache réact-query, renvoie vers `/login` — la session de démo n'a pas de « vraie » session à
 * restaurer en dessous (voir doc de `DemoController`), donc /login est bien
 * le point de sortie vers l'espace réel : le commercial s'y reconnecte lui.
 */
export const DemoModeBanner = memo(function DemoModeBanner() {
  const { t } = useTranslation('common')
  const { data: credits } = useCredits()
  const { exit, isPending } = useExitDemo()
  if (credits?.is_demo !== true) return null

  return (
    <Banner
      tone="warning"
      icon={FlaskConical}
      title={t('demo.bannerTitle')}
      wrap="desktop"
      titleClassName="shrink-0 whitespace-nowrap"
      bodyClassName="block min-w-0 truncate md:overflow-visible md:whitespace-normal"
      actions={
        <button
          type="button"
          onClick={() => void exit()}
          disabled={isPending}
          className={bannerActionClassName('warning')}
        >
          {t('demo.exitButton')}
        </button>
      }
    >
      {t('demo.bannerBody')}
    </Banner>
  )
})
