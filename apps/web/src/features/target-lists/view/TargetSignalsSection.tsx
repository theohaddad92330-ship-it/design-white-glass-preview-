import { Box } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { PlanFeatureLocked } from '@/features/plan-features/PlanFeatureLocked'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { WatchlistBoard } from '@/features/watchlist/view/WatchlistBoard'

/** #1687 — le MOTIF d'écran, jamais dérivé. Un geste de filtre fait ICI se
 *  compte ICI : l'analytique produit mesure l'ÉCRAN, jamais la personne. */
const TARGETS_SCREEN = '/signals'

/**
 * #2151.60 — LA VEILLE, PORTÉE DANS « MES CIBLES ».
 *
 * Décision de Louis, 16/09/2026 : `/watchlist` redirige vers `/mes-cibles`
 * **après** que son contenu y ait été porté — la redirection seule aurait détruit
 * le flux de signaux quotidien. Le plateau entier vient de `WatchlistBoard`
 * (les compteurs et facettes sortent de `countWatchlistFacets`, jamais d'un second
 * calcul, GA-26) ; les RÈGLES de veille voyagent par leur porte (le bouton-icône
 * de l'en-tête) — leur éditeur reste à un seul endroit, Réglages › Notifications.
 *
 * LE PALIER SUIT LE CONTENU : `/watchlist` est derrière la feature de palier
 * `watchlist`, `/mes-cibles` n'est derrière aucun palier. Le verrou se pose donc
 * sur le BLOC et nomme la fonction, son palier et son prix.
 *
 * #4088.1 — LE REPLI GLOBAL DISPARAÎT (renverse #2747) : la page EST la veille,
 * plus rien à replier ni à titrer ici — le titre vit dans l'en-tête de l'écran.
 */
export function TargetSignalsSection() {
  const { t } = useTranslation('targets')
  const { allowed } = usePlanFeature('watchlist')

  return (
    <Box as="section" aria-label={t('signals.heading')} className="flex min-w-0 flex-col gap-3">
      {allowed ? (
        // `ownScroll` absent, et c'est la décision : `/mes-cibles` défile déjà.
        <WatchlistBoard screen={TARGETS_SCREEN} />
      ) : (
        <Box className={PAGE_GUTTER_X}>
          <PlanFeatureLocked feature="watchlist" compact />
        </Box>
      )}
    </Box>
  )
}
