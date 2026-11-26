import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { readProjectOrigin } from '@/features/projects/lib/projectOrigin'
import { ProjectDossierPage } from '@/features/projects/view/ProjectDossierPage'
import { useTranslation } from 'react-i18next'

/**
 * LE DOSSIER D'UN PROJET/AFFAIRE — `/projects/:id` (fondation de l'épopée #2801).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SEULE CHOSE QUI MANQUAIT ÉTAIT CETTE ADRESSE
 * ─────────────────────────────────────────────────────────────────────────────
 * `/projects` (le pipe, une LISTE) et `/projects/needs/:needId` (un BESOIN,
 * pas le projet) existaient déjà — aucune route n'ouvrait le PROJET lui-même.
 * `object-forms.ts` le mesurait : « Aucune route `projects/$id` n'existe ». Une
 * carte qui voudrait ouvrir « le projet » (#2106.9) n'avait donc aucun écran où
 * atterrir. Ce fichier ne fait que ça, et c'est ce qui manquait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE PARAMÈTRE S'APPELLE `id`, MÊME CONVENTION QUE LES AUTRES DOSSIERS
 * ─────────────────────────────────────────────────────────────────────────────
 * `ObjectMention` pose `params={{ id }}` pour TOUS les objets qu'elle sait
 * ouvrir — une table de correspondance avec un nom de paramètre par objet
 * serait un réglage qui vit à deux endroits (`/accounts/$id`, `/contacts/$id`,
 * `/missions/$id`, `/consultants/$id`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ PAS DE TIRET BAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * `routes/projects/needs_.$needId.tsx` en porte un parce qu'un `needs.tsx`
 * existe et deviendrait sa route PARENTE. Il n'existe AUCUN `routes/projects.tsx` :
 * `index.tsx` et `needs.tsx` sont des sœurs à plat sous `routes/projects/`, et
 * ce fichier en est une troisième. Un segment STATIQUE (`needs`) est classé
 * avant un segment DYNAMIQUE (`$id`) par TanStack Router — même garantie que
 * `/missions/board` face à `/missions/$id`.
 *
 * ⚠️ Même palier que la liste (`feature="needs"`, celui du pipe) : une clé de
 * palier neuve sans migration rendrait 403 pour tout le monde.
 */
/**
 * #3683.6 — l'OBJET D'ORIGINE dans l'URL (`features/projects/lib/projectOrigin.ts`) : tout
 * optionnel, `catch` sur une valeur périmée — un lien ancien ouvre le dossier, jamais une erreur.
 */
const projectSearchSchema = z.object({
  from: z.enum(['account']).optional().catch(undefined),
  fromId: z.string().min(1).optional().catch(undefined),
  fromTab: z.enum(['overview', 'veille', 'plan']).optional().catch(undefined),
  /**
   * Théo C projects-fiche.N6 — les trois onglets de la fiche affaire sont ADRESSABLES : `?onglet=profils`
   * ouvre « Profils & présentations », `?onglet=activite` l'historique. Une valeur abîmée ouvre « Besoin ».
   */
  onglet: z.enum(['besoin', 'profils', 'activite']).optional().catch(undefined),
})

export const Route = createFileRoute('/projects/$id')({
  validateSearch: projectSearchSchema,
  /**
   * #4340.1 — `/projects/pistes` (ancienne adresse des Pistes) : sans fichier de route, `$id` la
   * captait comme un identifiant et l'écran disait « Projet introuvable » en chargement direct.
   * Les Pistes : #4545 (25/10) — le panneau des pistes du Pipe (`/projects?pistes=1`), qui revient sur #4340
   * (Signaux). `beforeLoad`, jamais `<Navigate>` (GA-27).
   */
  beforeLoad: ({ params }) => {
    // #4340.1
    if (params.id === 'pistes') {
      throw redirect({ to: '/projects', search: { pistes: 1 }, replace: true })
    }
  },
  component: GatedProjectDossier,
})

function GatedProjectDossier() {
  const { t } = useTranslation('nav')
  const { id } = Route.useParams()
  const search = Route.useSearch()
  return (
    <PlanFeatureRoute feature="needs" withShell pageTitle={t('items.projects')}>
      <ProjectDossierPage
        projectId={id}
        origin={readProjectOrigin(search)}
        initialTab={search.onglet === 'profils' ? 'profiles' : search.onglet === 'activite' ? 'activity' : 'need'}
      />
    </PlanFeatureRoute>
  )
}
