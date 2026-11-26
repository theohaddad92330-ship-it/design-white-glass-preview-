import { Button, Text } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { usePistesToReview } from '@/features/crm-counters/usePistesToReview'

/**
 * #4191 (recette 15/10, D3) — LA LIGNE « N PISTES À REVOIR » DU PIPE.
 *
 * Le bloc « Détecté, à revoir » (une carte par détection) repoussait le kanban à y≈942 px. Les pistes
 * détectées vivent dans le panneau `PistesDrawer` (le tableau `PistesBoard`) ; le Pipe n'en garde que le
 * compte, sur une ligne, avec le chemin. #4545 — le panneau s'ouvre par l'URL (`?pistes=1`) : la ligne
 * pose ce paramètre, comme tous les autres chemins (un seul état, une seule porte).
 *
 * Aucune piste à revoir (ou compte non lu) : aucune ligne — on n'affiche pas ce qu'on n'a pas.
 */
export function PipelineDetectionsLink() {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  // #4191 (recette 3, F1) — LE compteur des pistes (`pistes_to_review`), plus la longueur de la liste :
  // la ligne, le résumé du Pipe, l'en-tête de Pistes et Pilotage disent le même nombre.
  const count = usePistesToReview()
  if (count === null || count === 0) return null
  return (
    <Text element="p" size="sm">
      <Button
        variant="link"
        className="h-auto min-h-11 p-0"
        onClick={() => void navigate({ to: '/projects', search: previous => ({ ...previous, pistes: 1 }) })}
      >
        {t('detections.reviewLink', { count })}
      </Button>
    </Text>
  )
}
