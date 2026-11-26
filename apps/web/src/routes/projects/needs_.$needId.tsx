import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { NeedDetailPage } from '@/features/projects/open-needs/view/NeedDetailPage'
import { NEED_DETAIL_FAMILIES, NEED_DETAIL_LEGACY_TABS } from '@/features/projects/open-needs/model/need-detail-tabs'

/**
 * LA FICHE D'UN BESOIN — `/projects/needs/:needId`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI SOUS `/projects/needs`, ET PAS SOUS `/needs`
 * ─────────────────────────────────────────────────────────────────────────────
 * `/needs` est une URL HÉRITÉE : elle est réécrite vers `/projects` depuis le jour
 * où le produit a cessé d'avoir quatre mots pour le même objet
 * (`lib/legacy-addresses.ts`, #4359). Y accrocher la fiche donnerait un
 * préfixe qui renvoie ailleurs et un enfant qui reste — c'est-à-dire deux
 * réponses pour le même chemin. La fiche vit donc sous sa liste, qui est
 * `/projects/needs`.
 *
 * ⚠️ Le nom du fichier porte un tiret bas : `needs_.$needId` et non
 * `needs.$needId`. Sans lui, TanStack ferait de `needs.tsx` la route PARENTE de
 * celle-ci, et la liste devrait rendre un `<Outlet />` — c'est-à-dire que la
 * fiche s'afficherait DANS le tableau des besoins. Le tiret bas coupe
 * l'imbrication en gardant le chemin. C'est déjà la convention du dépôt
 * (`routes/accounts/$id_.brief.tsx`).
 *
 * ⚠️ Même palier que la liste (`feature="needs"`) et AUCUNE clé de palier
 * nouvelle : en poser une sans migration rendrait 403 pour tout le monde, ce
 * que le dépôt a déjà payé une fois.
 *
 * `?tab=` — #2175.1-.6, .41. **Sans `validateSearch`, TanStack Router jette
 * la recherche avant que l'écran la voie** (même défaut déjà corrigé sur
 * `/projects`, voir `routes/projects/index.tsx`). Les quatre nouvelles
 * familles ET les cinq anciens noms d'onglet sont tous des valeurs valides :
 * un lien collé avant ce lot doit continuer d'ouvrir la bonne famille
 * (`needDetailFamilyOf`, lue par `NeedDetailPage.tsx`). `.catch(undefined)` :
 * une valeur abîmée ouvre Synthèse plutôt qu'une page en erreur.
 */
const needDetailTabSchema = z
  .enum([...NEED_DETAIL_FAMILIES, ...NEED_DETAIL_LEGACY_TABS])
  .optional()
  .catch(undefined)

export const Route = createFileRoute('/projects/needs_/$needId')({
  validateSearch: z.object({ tab: needDetailTabSchema }),
  component: GatedNeedSheet,
})

function GatedNeedSheet() {
  const { t } = useTranslation('projects')
  const { needId } = Route.useParams()
  return (
    <PlanFeatureRoute feature="needs" withShell pageTitle={t('needSheet.title')}>
      <NeedDetailPage needId={needId} />
    </PlanFeatureRoute>
  )
}
