import type { RecordPanelKind } from '@bellum/contracts'
import { useNavigate } from '@tanstack/react-router'
import { RecordLinksZone } from './RecordLinksZone'
import { useRecordLinks } from './useRecordLinks'

/**
 * #4198 (lot L7) — la zone « Objets liés » sur une fiche PLEINE PAGE.
 *
 * Même source (`GET /record-links/:kind/:id`) et même composant de zone que le
 * panneau latéral : une fiche pleine page n'a pas de panneau à remplacer, un
 * clic ouvre donc la fiche pleine page de l'objet. Rien tant que la lecture
 * n'a rien rendu : on n'affiche pas ce qu'on n'a pas.
 */
export function PageRecordLinks({ kind, id }: { kind: RecordPanelKind; id: string }) {
  const navigate = useNavigate()
  const { data } = useRecordLinks(kind, id)
  // Une réponse sans `links` (lecture partielle, proxy, mock) ne doit pas faire
  // tomber la fiche entière qui monte cette zone.
  const links = data?.links
  if (!Array.isArray(links)) return null
  return (
    <RecordLinksZone
      groups={links}
      onOpen={(target, targetId) => {
        switch (target) {
          case 'opportunity':
            return void navigate({ to: '/projects/$id', params: { id: targetId } })
          case 'need':
            return void navigate({ to: '/projects/needs/$needId', params: { needId: targetId } })
          case 'mission':
            return void navigate({ to: '/missions/$id', params: { id: targetId } })
          case 'consultant':
            return void navigate({ to: '/consultants/$id', params: { id: targetId } })
          case 'submission':
            return void navigate({ to: '/projects/presentations' })
        }
      }}
    />
  )
}
