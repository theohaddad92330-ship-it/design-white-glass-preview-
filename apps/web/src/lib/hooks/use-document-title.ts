import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { routeMetaFor } from '@/lib/route-titles'

/**
 * Keeps `document.title` and the meta description in sync with the active route.
 *
 * Mounted once at the root, so a route can never forget to set a title and
 * inherit the previous screen's one. Depending on the resolved language also
 * means the tab title follows a language switch, which the previous per-route
 * `beforeLoad` could not do (it only ran on navigation).
 *
 * #4625 — le titre suit l'état RENDU, pas seulement la route correspondante : une route qui lance `notFound()`
 * (`/accounts/duplicates` → `/accounts/$id`) ou une adresse qu'aucune route ne reconnaît rend « Page introuvable »,
 * et l'onglet le dit. Défaut de famille réglé ICI, une fois (GA-26), pas route par route.
 */
export function useDocumentTitle(): void {
  const { t, i18n } = useTranslation()
  const routeIds = useRouterState({ select: state => state.matches.map(match => match.routeId) })
  // Même test que le routeur : une route qui lance `notFound()` (`status`) OU une adresse que rien ne reconnaît.
  // #4638 — `globalNotFound` a disparu des types de @tanstack/react-router à la montée 1.95 → 1.170 ; le champ
  // qui porte « aucune route ne reconnaît cette adresse » s'appelle maintenant `RouteMatch._notFound`
  // (router-core, `Matches.d.ts`). Il commence par `_` : une montée ultérieure peut le redéplacer, et c'est
  // `use-document-title.not-found.test.tsx` qui le dira — il monte un vrai routeur sur les deux cas de #4625.
  const notFoundRendered = useRouterState({
    select: state => state.matches.some(match => match.status === 'notFound' || match._notFound === true),
  })
  const key = `${notFoundRendered ? 'notFound:' : ''}${routeIds.join('>')}`

  useEffect(() => {
    if (notFoundRendered) {
      document.title = t('routes:notFound.title')
      return
    }
    const meta = routeMetaFor(routeIds)
    if (!meta) return
    document.title = t(meta.titleKey)
    if (meta.descriptionKey) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', t(meta.descriptionKey))
    }
    // `key` is the stable projection of routeIds (a new array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, i18n.language, t])
}
