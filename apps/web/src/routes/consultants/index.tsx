import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { ConsultantsPage } from '@/features/consultants/view/ConsultantsPage'

/**
 * `?q=` — la recherche AMORCÉE depuis le lanceur (`⌘K` → « Talent »).
 *
 * Une amorce et non une synchronisation : la valeur est posée au montage, puis
 * l'écran vit sa vie. Synchroniser dans les deux sens réécrirait l'URL à chaque
 * frappe et remplirait l'historique du navigateur, si bien que « retour » ne
 * ramènerait plus à l'écran précédent mais à la lettre précédente.
 *
 * `.catch(undefined)` : une valeur abîmée dans un lien collé ouvre le vivier
 * sans filtre plutôt qu'une page en erreur.
 */
/**
 * `?new=1` — la TROISIÈME porte d'enregistrement d'un consultant (BEL-BO-003).
 *
 * Les deux premières sont dans le vivier lui-même : le bouton « Ajouter » et le
 * dépôt de CV. La troisième vient d'ailleurs — d'un besoin ouvert qu'on ne peut
 * pas matcher parce que le vivier est vide. Là, le produit disait « vivier
 * vide » et laissait l'utilisateur chercher tout seul où l'on ajoute quelqu'un.
 *
 * Un paramètre d'URL et non un état global : le lien est partageable, et le
 * chemin de retour reste le bouton « précédent » du navigateur.
 */
/**
 * `?name=` — #1903.16 : le nom DICTÉ à Laura, pour préremplir le formulaire que
 * `?new=` ouvre. Une amorce comme les deux autres — posée au montage, jamais
 * resynchronisée : corriger le nom dans le formulaire ne doit pas le faire
 * revenir. Bornée à 200 caractères, la limite du formulaire lui-même
 * (`consultantUpsertSchema.full_name`, `packages/contracts`) : au-delà, ce
 * n'est plus un nom dicté, et un lien collé de travers ne doit pas planter
 * l'écran.
 */
/**
 * #2152.39/.40, #2182.1/.2 — `?view=` : LA VUE DU VIVIER.
 *
 * Trois vues, une page. « Positionnements » et « À réveiller » étaient deux
 * onglets de section ; ils deviennent deux vues d'ici, **et leurs routes
 * survivent** en redirection (`/consultants/submissions`, `/consultants/pool`).
 * La raison écrite le 27/08/2026 — *« les deux écrans existaient et n'étaient
 * atteignables que par une URL tapée à la main »* — est honorée par la vue, pas
 * contournée : l'écran reste à un clic, et son adresse continue de marcher.
 *
 * `.catch(undefined)` comme ses trois voisines : un lien collé de travers ouvre
 * le Vivier plutôt qu'une page en erreur. La vue par défaut (`talents`) ne
 * s'écrit pas dans l'URL — `/consultants` nu est l'adresse du Vivier, et un
 * second nom pour la même chose finirait par diverger.
 */
/**
 * #2183.52 — `?reviewStatus=` : la CIBLE du CTA « Voir les exceptions » posé
 * après un import (CSV ou ZIP). Une amorce comme `q` : posée au montage
 * seulement, jamais resynchronisée — filtrer puis revenir sur ses pas ne doit
 * pas la faire réapparaître.
 */
/**
 * Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — `?matchProjectId=` : l'AFFAIRE
 * que Laura propose de matcher quand elle reconnaît l'intention « pousser un
 * profil ». Même amorce que `availability` : posée au montage sur
 * `ConsultantsPage`, jamais resynchronisée. Elle ne rouvre PAS le panneau de
 * matching (`matchPanelOpen` reste `false` à l'arrivée, #1795/#1808/#1809/#1813
 * — jamais restauré ouvert depuis l'URL) : elle ne fait que présélectionner
 * l'affaire pour quand la personne l'ouvre elle-même.
 */
/**
 * #2075.27/.28 — `?availability=` : la CIBLE du choix « consultant à
 * positionner » posé après la validation de l'audit commercial
 * (`ValidateContextStatus.tsx`). Même amorce que `reviewStatus` — le vrai
 * VIVIER filtré, jamais un nom de consultant inventé (l'audit ne connaît
 * aucun consultant précis). MÊME enum que `talentSearchQuerySchema.availability`
 * (`packages/contracts/src/schemas/talent.ts`) — sans `en_mission`, que la
 * recherche du vivier n'accepte pas comme critère : un lien collé ne doit
 * jamais porter une valeur que l'écran refuserait.
 */
/**
 * #1952.4 (épopée #2844) — `?importCv=1` : LAURA OUVRE LE DÉPÔT, PAS LE JOB.
 *
 * La conversation ne transporte aucun fichier — absence structurelle
 * inchangée (`long-job-catalog.ts`). Ce que Laura peut proposer est un lien
 * vers le dépôt DÉJÀ existant (`CvZipImportDialog`, #2326.12) : le job en lot
 * démarre depuis CE dépôt, au clic humain, jamais depuis ce paramètre. Une
 * amorce comme `new` — posée au montage, jamais resynchronisée.
 */
const consultantsSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  new: z.boolean().optional().catch(undefined),
  name: z.string().max(200).optional().catch(undefined),
  view: z.enum(['talents', 'submissions']).optional().catch(undefined),
  reviewStatus: z.enum(['needs_review', 'qualified']).optional().catch(undefined),
  availability: z
    .enum(['immediate', 'sous_1_mois', 'sous_3_mois', 'indisponible', 'inconnu'])
    .optional()
    .catch(undefined),
  matchProjectId: z.string().guid().optional().catch(undefined),
  importCv: z.boolean().optional().catch(undefined),
})

export const Route = createFileRoute('/consultants/')({
  validateSearch: consultantsSearchSchema,
  /**
   * #4528.2 (Louis 24/10/2026, revient sur #4502 côté Talents, garde #4349) — une présentation ne vit qu'à UN
   * endroit : Affaires › Présentations. `/consultants?view=submissions` et `/consultants#positionnements` y mènent ;
   * le reste de la recherche (`q`, filtres) n'a pas de sens là-bas : il n'est pas transporté. Le palier d'Affaires
   * s'applique à l'arrivée, comme aujourd'hui. `replace: true` — sinon « précédent » reboucle. `beforeLoad`,
   * jamais `<Navigate>` (GA-27).
   */
  beforeLoad: ({ search, location }) => {
    if (search.view === 'submissions' || location.hash === 'positionnements') {
      throw redirect({ to: '/projects/presentations', replace: true })
    }
  },
  component: GatedPage,
})

/** L'écran reste atteignable quel que soit le palier : s'il n'est pas inclus, il
 *  dit ce qu'il fait, quelle offre l'ouvre et à quel prix. */
function GatedPage() {
  const { t } = useTranslation('nav')
  return (
    <PlanFeatureRoute feature="talent_pool" withShell pageTitle={t('items.consultants')}>
      <ConsultantsPage />
    </PlanFeatureRoute>
  )
}
