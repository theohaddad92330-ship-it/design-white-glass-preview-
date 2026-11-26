import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { ACCESS_CLASSES, contextModeSchema, discoverResultTypeSchema } from '@bellum/contracts'
import { CustomerPage } from '@/components/page/CustomerPage'
import { Discover } from '@/features/discover/view/Discover'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { DisabledProductRoute } from '@/features/product-gating/DisabledProductRoute'
import { isProductRouteDisabled } from '@/features/product-gating/disabledRoutes'

/**
 * `class` (tome 3) : le SEUL filtre d'écran que ce schéma porte. Une recherche
 * qu'on ne peut ni partager ni retrouver n'est pas une recherche (§B du 30/08).
 *
 * `.catch(undefined)` — un lien collé de travers ou une valeur périmée rouvre
 * l'écran sur « toutes », jamais une page cassée (même défense que
 * `accounts/index.tsx`).
 *
 * `.passthrough()` — les autres critères de cet écran (secteurs, signaux,
 * département, effectif, mots-clés, tri…) sont déjà portés en URL par des
 * lecteurs indépendants : le pré-remplissage depuis le Copilote
 * (`discover-prefill.ts`) et `SituationPicker`. Ce schéma ne les connaît pas
 * tous, et n'a pas à : sans `.passthrough()`, zod les aurait tous JETÉS au
 * premier `validateSearch`, cassant ces deux chemins-là en silence.
 */
export const discoverSearchSchema = z
  .object({
    class: z.enum(ACCESS_CLASSES).optional().catch(undefined),
    /**
     * #2165.10 — LE TYPE DE RÉSULTAT, et il n'y en a qu'UN par recherche.
     *
     * Porté par l'URL pour la même raison que `class` : une recherche qui ne
     * se partage ni ne se retrouve n'est pas une recherche. Et c'est l'URL qui
     * rend l'exclusivité structurelle — un `useState` par type aurait permis
     * d'en allumer deux ; une seule clé ne le permet pas.
     *
     * `.catch(undefined)` → l'écran retombe sur les comptes, jamais une page
     * cassée (cf. `discoverResultTypeFrom`).
     */
    type: discoverResultTypeSchema.optional().catch(undefined),
    /**
     * #2454.4 / #2454.10 — le MODE de contexte (« Neutre » : profil habituel
     * ignoré). Dans l'URL pour qu'un lien le CONSERVE : une recherche neutre ne
     * redevient jamais personnalisée en changeant d'écran.
     */
    context: contextModeSchema.optional().catch(undefined),
  })
  .passthrough()

export const Route = createFileRoute('/discover/')({
  validateSearch: discoverSearchSchema,
  component: DiscoverPage,
})

/**
 * #3119 (beta, 26/09/2026) — « à mettre en premier dans pistes rapides,
 * enlever d'ici » : le lien « Analyser une liste » (#2293) quitte l'en-tête.
 * Il vit désormais en première entrée de `DiscoverQuickPresetsDialog`, pas
 * ici en double.
 */
export function DiscoverPage() {
  const { t } = useTranslation('routes')
  return (
    <CustomerPage anchorId="decouvrir" titleInScreen pageTitle={t('discover.pageTitle')}>
      {isProductRouteDisabled('discover') ? (
        <DisabledProductRoute route="discover" />
      ) : (
        <PlanFeatureRoute feature="discover">
          <Discover />
        </PlanFeatureRoute>
      )}
    </CustomerPage>
  )
}
