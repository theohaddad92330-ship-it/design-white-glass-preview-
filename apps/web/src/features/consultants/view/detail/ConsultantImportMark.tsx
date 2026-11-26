import { useQuery } from '@tanstack/react-query'
import { ImportMarkLine } from '@/features/crm-core/view/ImportMarkLine'
import { consultantsApi } from '../../api'

/** #4051 — « Importé le <date> depuis <fichier> » sur la fiche consultant ; rien si elle n'a jamais été importée. */
export function ConsultantImportMark({ consultantId }: { consultantId: string }) {
  const { data } = useQuery({
    queryKey: ['consultant', consultantId, 'import-mark'],
    queryFn: () => consultantsApi.importMark(consultantId),
    select: response => response.importedFrom,
  })
  return <ImportMarkLine mark={data} />
}
