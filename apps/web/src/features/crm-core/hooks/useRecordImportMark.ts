import { useQuery } from '@tanstack/react-query'
import { crmKeys } from '../api'
import { recordsApi } from '../api'

/**
 * #4051 — « Importé le <date> depuis <source> » : la trace d'import la plus récente de la fiche, lue dans la même
 * réponse que son historique (même clé, une seule requête). `null` = jamais importée.
 */
export function useRecordImportMark(entityType: 'account' | 'contact', entityId: string, enabled: boolean) {
  return useQuery({
    queryKey: crmKeys.history(entityType, entityId),
    queryFn: () => recordsApi.history(entityType, entityId),
    enabled,
    select: response => response.importedFrom ?? null,
  })
}
