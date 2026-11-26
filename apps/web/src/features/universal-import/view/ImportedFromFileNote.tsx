import { Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchContextPackHistory } from '../api'

/**
 * #4426.2 — « Tiré de ton fichier <nom> » : un réglage posé par l'assistant « Dépose tes documents » (niveaux de
 * décideurs, grille de qualification) dit d'où il vient, à l'endroit où il vit (GA-26). Lu dans l'historique des
 * imports (même requête que /settings/import) : le dernier import RÉUSSI de cette destination. Aucun import ⇒ RIEN.
 */
export function ImportedFromFileNote({ destination }: { destination: 'target_personas' | 'qualification_grid' }) {
  const { t } = useTranslation('importWizard')
  const { data } = useQuery({
    queryKey: ['universal-import', 'history', 'assistant'],
    queryFn: fetchContextPackHistory,
    staleTime: 30_000,
  })
  const latest = (data ?? [])
    .filter(item => item.destination === destination && item.status === 'done')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!latest) return null
  return (
    <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="imported-from-file">
      {t('universal.importedFromFile', { name: latest.fileName })}
    </Text>
  )
}
