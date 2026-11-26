import { resolveBrand } from '@bellum/contracts'
import { BrandContext } from './brand-context'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, type ReactNode } from 'react'
import { useSession } from '@/lib/hooks/use-session'
import { applyBrandToI18n } from '@/i18n'
import { brandApi } from './api'

/**
 * LA MARQUE, POUR TOUT L'ÉCRAN — marque blanche, palier P2.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FOURNISSEUR SUPPRIME
 * ─────────────────────────────────────────────────────────────────────────
 * Le mot « Bellum » vivait à 537 endroits et « Laura » à 356 — dont 601 dans
 * les seules traductions. Tant qu'un nom est écrit partout, aucun client ne
 * peut voir le sien : il n'y a pas UN endroit à changer, il y en a 893.
 *
 * Ici, il y en a un. `useBrand()` rend un objet toujours COMPLET : jamais de
 * `null`, donc jamais un `?? 'Bellum'` de dépannage dans un composant — c'est
 * la leçon des soixante-huit paragraphes qu'on avait dû borner un par un, avec
 * la certitude d'oublier le soixante-neuvième.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX SOURCES, DANS CET ORDRE
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **L'espace actif**, dès qu'on est connecté. Un utilisateur membre de
 *    plusieurs espaces voit la marque de celui qu'il a CHOISI, pas celle du
 *    domaine par lequel il est entré.
 * 2. **L'hôte**, sinon. C'est l'écran de connexion — le premier que les
 *    clients d'un client ouvrent, et celui où notre logo serait le plus
 *    visible s'il restait.
 *
 * ⚠️ Pendant le chargement on rend la marque du PRODUIT, pas un écran vide ni
 * un squelette : un nom qui apparaît après coup fait clignoter l'entête à
 * chaque navigation. Le repli est le nôtre parce qu'il est le seul qu'on
 * connaisse hors ligne — et il est corrigé dès la première réponse.
 */

export function BrandProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()

  const publicBrand = useQuery({
    queryKey: ['brand', 'public'],
    queryFn: () => brandApi.publicBrand(),
    // La marque d'un domaine ne change pas d'une minute à l'autre, et cette
    // requête part sur CHAQUE chargement de l'écran de connexion.
    staleTime: 5 * 60_000,
    enabled: !user,
  })

  const workspaceBrand = useQuery({
    queryKey: ['brand', 'workspace', user?.id],
    queryFn: () => brandApi.brand(),
    staleTime: 5 * 60_000,
    enabled: Boolean(user),
  })

  const brand = workspaceBrand.data ?? publicBrand.data ?? resolveBrand(null)

  /*
   * L'accent traverse la frontière du CSS.
   *
   * ⚠️ On repeint `--bellum-primary-500` sur la RACINE, et rien d'autre : tout
   * le produit lit déjà ce token — boutons, pastille active, anneau de focus,
   * liens. Repeindre les surfaces ou le texte serait une autre décision (et
   * casserait les contrastes vérifiés par `contrast.test.ts`, qui mesure des
   * couples posés). Un client change son accent, pas notre rampe de gris.
   *
   * On nettoie au démontage : sans ça, la couleur d'un espace resterait après
   * un changement d'espace, jusqu'au prochain rechargement complet.
   */
  useEffect(() => {
    const root = document.documentElement
    if (!brand.isCustom) {
      root.style.removeProperty('--bellum-primary-500')
      return undefined
    }
    root.style.setProperty('--bellum-primary-500', brand.accent)
    return () => {
      root.style.removeProperty('--bellum-primary-500')
    }
  }, [brand.isCustom, brand.accent])

  /*
   * Le titre de l'onglet porte la marque du client.
   *
   * C'est ce qu'on voit dans une barre d'onglets et dans un favori — l'endroit
   * où un nom étranger se remarque le plus, et le moins cher à corriger.
   */
  useEffect(() => {
    if (!brand.isCustom) return undefined
    const previous = document.title
    document.title = brand.name
    return () => {
      document.title = previous
    }
  }, [brand.isCustom, brand.name])

  /*
   * La marque entre dans les 601 clés de traduction qui la citent.
   *
   * ⚠️ C'est ce qui évite de passer `{ brand, copilot }` à 601 appels `t()` —
   * et d'en oublier, ce qui afficherait littéralement « {{brand}} » chez un
   * client. Voir `applyBrandToI18n`.
   */
  useEffect(() => {
    applyBrandToI18n(brand)
  }, [brand.name, brand.copilotName])

  const value = useMemo(() => brand, [brand])
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}
