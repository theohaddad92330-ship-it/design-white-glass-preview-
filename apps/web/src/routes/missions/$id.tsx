import { createFileRoute } from '@tanstack/react-router'
import { MissionDossierPage } from '@/features/missions/view/MissionDossierPage'

/**
 * LE DOSSIER D'UNE MISSION — `/missions/:id` (D200, 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SEULE CHOSE QUI MANQUAIT ÉTAIT CETTE ADRESSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Six routes `/missions/*` existaient, toutes des LISTES. Le contenu d'une
 * mission — cinq onglets, quatre routes d'API — vivait uniquement dans un
 * tiroir, c'est-à-dire dans la mémoire d'un écran : une mission ne pouvait être
 * ni partagée par lien, ni ouverte dans un onglet, ni mise en favori, ni
 * mentionnée ailleurs. Ce fichier ne fait qu'une chose, et c'est la seule qui
 * manquait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE PARAMÈTRE S'APPELLE `id`, ET CE N'EST PAS UN DÉTAIL
 * ─────────────────────────────────────────────────────────────────────────────
 * `ObjectMention` — la primitive F1 — pose `params={{ id }}` pour TOUS les
 * objets qu'elle sait ouvrir, parce qu'une table de correspondance par objet
 * avec un nom de paramètre par objet serait un réglage qui vit à deux endroits.
 * C'est déjà la convention des trois dossiers existants (`/accounts/$id`,
 * `/contacts/$id`, `/consultants/$id`). Nommer celui-ci `$missionId` aurait
 * forcé la primitive à connaître un cas particulier dès le premier objet
 * ajouté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ PAS DE TIRET BAS ICI, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────────
 * `routes/projects/needs_.$needId.tsx` en porte un parce qu'un `needs.tsx`
 * existe et deviendrait sa route PARENTE. Il n'y a AUCUN `routes/missions.tsx` :
 * les six routes de mission sont des sœurs à plat sous la racine. Ajouter le
 * tiret bas ici n'aurait rien coupé et aurait fait croire à une imbrication qui
 * n'existe pas.
 *
 * ⚠️ Aucune collision avec `/missions/board`, `/missions/cra` et les autres :
 * TanStack Router classe un segment STATIQUE avant un segment dynamique. C'est
 * une garantie du routeur, pas un ordre de déclaration — l'arbre est GÉNÉRÉ.
 *
 * ⚠️ Aucun `PlanFeatureRoute` : les six routes sœurs n'en portent pas. En poser
 * un ici rendrait 403 sur le dossier d'une mission que la LISTE affiche — et
 * une clé de palier neuve sans migration rend 403 pour tout le monde, ce que ce
 * dépôt a déjà payé une fois.
 */
export const Route = createFileRoute('/missions/$id')({
  component: MissionDossierRoute,
})

function MissionDossierRoute() {
  const { id } = Route.useParams()
  return <MissionDossierPage missionId={id} />
}
