import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import type { SavedSearch } from '@/features/discover/lib/discover-saved-searches'
import { searchCandidatesForSavedSearch } from '../fill-target-list-from-search'
import { useCreateTargetListFromSavedSearch } from '../useCreateTargetListFromSavedSearch'

interface CreateTargetListFromSavedSearchDialogProps {
  /** La recherche enregistrée à verser ; `null` = dialogue fermé. */
  search: SavedSearch | null
  onOpenChange: (open: boolean) => void
}

/**
 * #2157.57 — « Créer une cible depuis une recherche enregistrée » en DEUX temps : chercher → APERÇU → verser.
 * Même doctrine que `CreateTargetListFromSelectionDialog` (L5) : retenus, écartés NOMMÉS (retirés par l'utilisateur,
 * remettables), données manquantes NOMMÉES (jamais « 0 », une absence ne fait aucune ligne), retrait par ligne.
 * La différence : les candidats d'une recherche ne sont pas encore des comptes canoniques — la recherche part ici,
 * à l'ouverture, et RIEN n'est écrit (ni liste, ni compte au portefeuille) avant le clic « Créer la cible ».
 * Le versement est celui de {@link useCreateTargetListFromSavedSearch} (un seul chemin, GA-26). Aucun enrichissement
 * payant ni coût affiché (c132).
 */
export function CreateTargetListFromSavedSearchDialog({
  search,
  onOpenChange,
}: CreateTargetListFromSavedSearchDialogProps) {
  const { t } = useTranslation('targets')
  const create = useCreateTargetListFromSavedSearch()
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())

  const preview = useQuery({
    queryKey: ['target-lists', 'saved-search-preview', search?.id, search?.filters],
    queryFn: () => searchCandidatesForSavedSearch(search!.filters),
    enabled: search != null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  useEffect(() => {
    setRemoved(new Set())
  }, [search?.id])

  const found = preview.data ?? []
  const retained = found.filter(candidate => !removed.has(candidate.siren))
  const excluded = found.filter(candidate => removed.has(candidate.siren))
  // Donnée manquante : nommée seulement si elle est CONNUE absente (`null`), jamais devinée.
  const withoutSector = retained.filter(candidate => candidate.sector === null)

  const canSubmit = search != null && retained.length > 0 && !create.isPending

  const submit = () => {
    if (!canSubmit || !search) return
    create.mutate(
      { search, candidates: retained },
      {
        onSuccess: () => onOpenChange(false),
      },
    )
  }

  return (
    <Dialog open={search != null} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('createFromSavedSearch.cancel')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('createFromSavedSearch.title')}</DialogTitle>
          <DialogDescription>{t('createFromSavedSearch.description', { name: search?.label ?? '' })}</DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('createFromSavedSearch.searching')}
          </Text>
        ) : preview.isError ? (
          <Text size="sm" role="alert">
            {t('createFromSavedSearch.searchFailed')}
          </Text>
        ) : found.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('createFromSavedSearch.noResult')}
          </Text>
        ) : (
          <>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('createFromSavedSearch.retained', { count: retained.length })}
            </Text>
            {/* Chaque candidat, retirable un à un AVANT toute écriture. */}
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
              {retained.map(candidate => (
                <li key={candidate.siren} className="flex items-center justify-between gap-2">
                  <span>{candidate.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('createFromSavedSearch.removeRow', { label: candidate.name })}
                    onClick={() => setRemoved(prev => new Set(prev).add(candidate.siren))}
                  >
                    {t('createFromSavedSearch.remove')}
                  </Button>
                </li>
              ))}
            </ul>
            {excluded.length > 0 ? (
              <div data-testid="saved-search-excluded" className="flex flex-col gap-1">
                <p className="text-xs text-[var(--bellum-text-muted)]">
                  {t('createFromSavedSearch.excluded', { count: excluded.length })}
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {excluded.map(candidate => (
                    <li key={candidate.siren} className="flex items-center justify-between gap-2">
                      <span>{candidate.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('createFromSavedSearch.restoreRow', { label: candidate.name })}
                        onClick={() =>
                          setRemoved(prev => {
                            const next = new Set(prev)
                            next.delete(candidate.siren)
                            return next
                          })
                        }
                      >
                        {t('createFromSavedSearch.restore')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {withoutSector.length > 0 ? (
              <p data-missing className="text-xs text-[var(--bellum-text-muted)]">
                {t('createFromSavedSearch.withoutSector', { count: withoutSector.length })}
                {' : '}
                {withoutSector.map(candidate => candidate.name).join(', ')}
              </p>
            ) : null}
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('createFromSavedSearch.cancel')}
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {t('createFromSavedSearch.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
