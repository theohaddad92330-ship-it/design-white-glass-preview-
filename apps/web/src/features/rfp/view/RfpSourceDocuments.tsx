import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { Box, Button, Card, Text } from '@bellum/ui'
import type { SignedDownload, StoredFile } from '@bellum/contracts'
import { rfpApi, rfpKeys } from '../api'

/**
 * #2957 (#2180.54) — les documents SOURCES d'un dossier d'appel d'offres, tels
 * que déposés à l'import : ce que le texte extrait (`source_text`, la carte
 * « Ce que le document dit ») ne montre pas — le fichier lui-même, ré-ouvrable.
 *
 * Lecture seule : aucun dépôt ni retrait ici. Les fichiers arrivent UNE fois,
 * à l'import (`RfpService.persistDraft`) — cet écran ne fait qu'ouvrir ce qui
 * a déjà été conservé. Un import sans fichier (texte collé) n'a rien à
 * montrer : la carte reste absente plutôt que vide (doctrine « on n'affiche
 * pas ce qu'on n'a pas »).
 */
export function RfpSourceDocuments({ rfpId }: { rfpId: string }) {
  const { t } = useTranslation('rfp')

  const { data } = useQuery({
    queryKey: rfpKeys.sourceDocuments(rfpId),
    queryFn: () => rfpApi.sourceDocuments(rfpId),
  })
  const files: StoredFile[] = data?.files ?? []

  const open = useMutation<SignedDownload, Error, string>({
    mutationFn: objectId => rfpApi.downloadSourceDocument(rfpId, objectId),
    onSuccess: signed => {
      window.open(signed.url, '_blank', 'noopener,noreferrer')
    },
  })

  // Aucun fichier conservé — jamais une carte vide (« on n'affiche pas ce
  // qu'on n'a pas »). Un import par texte collé, ou fait avant ce lot, se lit
  // exactement pareil : pas de fichier à ouvrir, la donnée n'est pas absente
  // pour autant.
  if (files.length === 0) return null

  return (
    <Card className="p-4">
      <Text size="sm" weight="semibold">
        {t('sourceDocuments.title')}
      </Text>
      <ul className="mt-2 space-y-1">
        {files.map(file => (
          <li key={file.id} className="flex items-center gap-2">
            <FileText className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
            <Text element="span" size="xs" className="min-w-0 flex-1 truncate">
              {file.fileName}
            </Text>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={open.isPending}
              aria-label={t('sourceDocuments.open', { name: file.fileName })}
              onClick={() => open.mutate(file.id)}
            >
              {t('sourceDocuments.openShort')}
            </Button>
          </li>
        ))}
      </ul>
      {open.isError ? (
        <Box className="mt-1">
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {t('sourceDocuments.openError')}
          </Text>
        </Box>
      ) : null}
    </Card>
  )
}
