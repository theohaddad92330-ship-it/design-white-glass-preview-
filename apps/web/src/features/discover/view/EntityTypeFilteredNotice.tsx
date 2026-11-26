import { useTranslation } from 'react-i18next'
import { Filter } from 'lucide-react'

/**
 * #4746.6 — « la raison de l'exclusion lisible sur demande » : `coverage.filteredByEntityType` (compté par l'IA,
 * lu nulle part avant ce lot) dit combien de comptes résolus le filtre « Clients finaux » a retirés.
 * Ton neutre : c'est un choix de l'utilisateur, pas une panne. Compteur absent ou nul => aucune ligne (jamais « 0 »).
 */
export function EntityTypeFilteredNotice({
  removed,
  entityType,
}: {
  removed: number | undefined
  entityType: string | undefined
}) {
  const { t } = useTranslation('discover')
  if (entityType !== 'client' || !removed || removed <= 0) return null

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        <Filter className="h-[13px] w-[13px]" aria-hidden />
        {t('entityTypeFiltered.title', { count: removed })}
      </p>
      <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
        {t('entityTypeFiltered.description')}
      </p>
    </div>
  )
}
