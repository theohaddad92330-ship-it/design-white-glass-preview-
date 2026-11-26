import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { OpenNeedsPage } from '@/features/projects/open-needs/view/OpenNeedsPage'

/**
 * `?match=<besoin>` — le panneau de matching est PARTAGEABLE.
 *
 * Un classement qu'on ne peut pas envoyer à un collègue oblige à le décrire de
 * mémoire. `.catch(undefined)` : une valeur abîmée dans un lien collé ouvre
 * l'écran sans panneau plutôt qu'une page en erreur.
 */
const needsSearchSchema = z.object({
  match: z.string().optional().catch(undefined),
  /**
   * `?q=` — la recherche AMORCÉE depuis le lanceur (`⌘K`).
   *
   * Une amorce et non une synchronisation : la valeur est posée au montage,
   * puis l'écran vit sa vie. Synchroniser dans les deux sens réécrirait l'URL à
   * chaque frappe, ce qui remplit l'historique du navigateur — « retour » ne
   * ramènerait plus à l'écran précédent mais à la lettre précédente.
   */
  q: z.string().optional().catch(undefined),
  /**
   * #2571 — `?fromRfp=<id>` amorce la prévisualisation d'un besoin proposé
   * depuis un appel d'offres déjà analysé (`/rfp/:id`). Un identifiant abîmé
   * dans un lien collé ouvre l'écran sans le bloc plutôt qu'une page en erreur.
   */
  fromRfp: z.string().guid().optional().catch(undefined),
  /**
   * #2777 — `?account_id=<compte>` amorce le MÊME filtre `NeedFilters.account_id`
   * que `ImportNeedsDialog` pose déjà côté client, et que le serveur sait déjà
   * lire (`open-needs.service.ts`, `need.account_id = :accountId`) : un besoin
   * SANS projet (`project_id: null`, écrit par la cascade du compte rendu) n'a
   * jamais d'autre vue que ce plateau transverse — le dossier compte y renvoie.
   */
  account_id: z.string().guid().optional().catch(undefined),
  /**
   * #4499 (Louis 23/10/2026) — `?onglet=besoins` : l'onglet « Besoins » de la barre Pipeline · Besoins ·
   * Présentations (`AffairesTabs`). Le contrat d'Affaires y envoie « Créer un besoin », « Exporter les besoins »
   * et la file de qualification : l'onglet est donc un lien profond NOMMÉ comme les quatre autres. L'URL nue
   * continue de rediriger vers le Pipe (F1-FIX #4344) — aucun ancien lien ne change de destination.
   */
  onglet: z.literal('besoins').optional().catch(undefined),
})

/**
 * F1-FIX #4344 (Louis 19/10/2026) — « Besoins ouverts » QUITTE Talents ET n'est plus un écran à part :
 * un besoin client est une affaire, il se lit dans le Pipe (colonne « Besoin exprimé »).
 *
 * `/projects/needs` NU redirige donc vers `/projects` (`beforeLoad`, jamais `<Navigate>` — GA-27 ;
 * `replace`, sinon « précédent » reboucle). Seuls les LIENS PROFONDS nommés gardent l'écran, parce
 * qu'un appelant réel en dépend et que les écarter casserait son geste : `match` (panneau de
 * matching d'un besoin), `fromRfp` (besoin proposé depuis un appel d'offres), `account_id` (plateau
 * des besoins SANS projet d'un compte), `q` (recherche amorcée du lanceur).
 */
export const Route = createFileRoute('/projects/needs')({
  validateSearch: needsSearchSchema,
  beforeLoad: ({ search }) => {
    const deepLinked = search.match || search.q || search.fromRfp || search.account_id || search.onglet
    if (!deepLinked) throw redirect({ to: '/projects', replace: true })
  },
  component: GatedPage,
})

/** Même palier que le pipe : c'est le même objet, vu par le recruteur. Aucune
 *  clé de palier NOUVELLE — en poser une sans migration rendrait 403 pour tout
 *  le monde, ce que le dépôt a déjà payé une fois. */
function GatedPage() {
  const { t } = useTranslation('projects')
  return (
    <PlanFeatureRoute feature="needs" withShell pageTitle={t('openNeeds.title')}>
      <OpenNeedsPage />
    </PlanFeatureRoute>
  )
}
