import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { ReverseMarketPage } from '@/features/consultants/view/reverse-market/ReverseMarketPage'

/**
 * #1933.5 — `?scope=` présélectionne « Besoins internes » (`mine` / `all`)
 * SANS lancer le classement : une amorce posée au montage, comme `?q=` sur le
 * vivier — jamais resynchronisée, et surtout jamais déclenchée seule. Lancer
 * `match-inverse` au chargement créerait une entrée de journal à chaque visite
 * du lien (voir la doc de `InternalNeedsSection`, `ReverseMarketPage.tsx`).
 * `.catch(undefined)` : une valeur abîmée dans un lien collé ouvre l'écran
 * avec son défaut (`all`) plutôt qu'une page en erreur.
 */
const reverseMarketSearchSchema = z.object({
  scope: z.enum(['mine', 'all']).optional().catch(undefined),
})

/**
 * « Où placer ce profil ? » — la prospection inversée depuis un consultant
 * (PDF 5 §6.2, BEL-ATS-010). Même palier que le vivier et sa fiche.
 *
 * ⚠️ Le fichier s'appelle `$id_.reverse-market.tsx`, avec un UNDERSCORE FINAL sur
 * le paramètre, et c'est la seule chose qui rend cette page atteignable.
 *
 * Sans lui, le routeur en fait un ENFANT de `/consultants/$id` — or `$id.tsx`
 * rend la fiche du consultant et n'a pas d'`<Outlet />`. La route matchait donc,
 * l'URL changeait, le titre de l'onglet changeait, et le composant ne s'affichait
 * NULLE PART : c'est la fiche du parent qu'on voyait. Aucune erreur, aucun test
 * en échec — le composant a les siens et ils passent tous —, simplement une page
 * que personne ne pouvait ouvrir. Mesuré en production le 11/09/2026.
 *
 * Même convention que `/accounts/$id_/brief`, pour la même raison.
 */
export const Route = createFileRoute('/consultants/$id_/reverse-market')({
  validateSearch: reverseMarketSearchSchema,
  component: GatedReverseMarket,
})

function GatedReverseMarket() {
  const { t } = useTranslation('nav')
  const { id } = Route.useParams()
  const { scope } = Route.useSearch()
  return (
    <PlanFeatureRoute feature="talent_pool" withShell pageTitle={t('items.consultants')}>
      <ReverseMarketPage talentId={id} initialScope={scope} />
    </PlanFeatureRoute>
  )
}
