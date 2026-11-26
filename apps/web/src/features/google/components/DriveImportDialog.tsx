import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Spinner,
  Text,
} from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { googleApi, type DriveFile } from '@/features/google/api'
import { useGoogleStatus } from '@/features/google/hooks/useGoogleStatus'
import { GoogleConnectNotice } from '@/features/google/components/GoogleConnectNotice'

type DriveImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Longueur minimale d'une recherche par contenu — c'est le contrat du serveur
 * (`driveSearchQuerySchema` : `q` de 2 à 200 caractères). En dessous, la requête
 * partirait pour revenir en 400 : on ne l'envoie pas.
 */
const MIN_CONTENT_QUERY_LENGTH = 2

/**
 * Les seuls types que l'ingestion accepte (`ingestDriveFile` : Google Doc exporté
 * en texte, PDF extrait côté serveur ; tout le reste est refusé en 400).
 *
 * La recherche par contenu, elle, ne filtre PAS les types — elle rendrait un
 * tableur ou une image. Les proposer mènerait l'utilisateur à un clic qui échoue ;
 * on les écarte ici plutôt que de lui faire découvrir la limite après coup.
 */
const IMPORTABLE_MIME_TYPES = new Set(['application/vnd.google-apps.document', 'application/pdf'])

/**
 * Pick a Google Drive doc (Google Docs / PDF) and ingest it into the existing RAG
 * store. Listing + ingest reuse the backend endpoints; nothing is invented — an
 * empty Drive shows an empty state, never a placeholder file.
 *
 * La recherche interroge DEUX routes : `/google/drive/files` (le NOM) et
 * `/google/drive/search` (le CONTENU, `fullText contains`). La seconde était
 * livrée côté serveur depuis le garde-fou n°25 et aucun écran ne l'appelait —
 * si bien que « la proposition où on parle de Kubernetes » ne rendait rien, le
 * fichier s'appelant `Proposition_ACME_v3.pdf`. Les deux listes sont fusionnées
 * et dédoublonnées par id ; ce qui ne doit sa présence qu'au contenu le dit.
 */
export function DriveImportDialog({ open, onOpenChange }: DriveImportDialogProps) {
  const { t } = useTranslation('google')
  const queryClient = useQueryClient()
  const { data: status } = useGoogleStatus()
  const connected = status?.connected ?? false
  const canRead = status?.capabilities?.drive ?? false

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const filesQuery = useQuery({
    queryKey: ['google-drive-files', debounced],
    queryFn: () => googleApi.driveFiles({ search: debounced || undefined }),
    enabled: open && connected && canRead,
    staleTime: 15_000,
  })

  // La recherche par CONTENU. Elle ne remplace pas celle par nom : un document
  // dont le NOM porte le mot cherché reste le résultat le plus probable, et le
  // `fullText` de Drive n'indexe pas tout (un PDF scanné sans OCR, par exemple).
  const contentQuery = useQuery({
    queryKey: ['google-drive-content', debounced],
    queryFn: () => googleApi.driveSearch({ q: debounced }),
    enabled: open && connected && canRead && debounced.length >= MIN_CONTENT_QUERY_LENGTH,
    staleTime: 15_000,
  })

  const ingest = useMutation({
    mutationFn: (fileId: string) => googleApi.driveIngest(fileId),
    onSuccess: () => {
      toast.success(t('drive.imported'))
      queryClient.invalidateQueries({ queryKey: ['rag-documents'] })
      onOpenChange(false)
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : t('drive.error')),
  })

  const namedFiles = filesQuery.data?.files ?? []
  // Dédoublonnage par id : un document dont le nom ET le contenu portent le mot
  // revient dans les deux listes, et deux lignes identiques laisseraient croire
  // à deux fichiers.
  const namedIds = new Set(namedFiles.map(f => f.id))
  const contentOnlyFiles = (contentQuery.data?.items ?? []).filter(
    f => !namedIds.has(f.id) && IMPORTABLE_MIME_TYPES.has(f.mimeType ?? ''),
  )
  const files = [...namedFiles, ...contentOnlyFiles]
  const contentOnlyIds = new Set(contentOnlyFiles.map(f => f.id))

  // Un échec ne se déguise pas en « rien trouvé » : une recherche qui n'a pas pu
  // partir et un espace documentaire vide ne se ressemblent pas.
  const searchFailed = filesQuery.isError || contentQuery.isError
  const isLoading = filesQuery.isLoading || contentQuery.isLoading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--bellum-text-primary)]">
            <FileText className="size-4" aria-hidden />
            {t('drive.title')}
          </DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">{t('drive.subtitle')}</DialogDescription>
        </DialogHeader>

        {!connected || !canRead ? (
          // #2078.23 — importer est une lecture : l'invite ne demande pas l'écriture.
          <GoogleConnectNotice level="read" message={t('drive.notConnected')} />
        ) : (
          <Box className="space-y-3">
            <Box className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--bellum-text-muted)]" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('drive.searchPlaceholder')}
                className="pl-8"
              />
            </Box>

            <ScrollArea className="h-64 rounded-md border border-[var(--bellum-border)]">
              {isLoading ? (
                <Box display="flex" className="h-64 items-center justify-center">
                  <Spinner />
                </Box>
              ) : searchFailed ? (
                <Box display="flex" className="h-64 items-center justify-center px-4">
                  <Text size="sm" color="text-[var(--danger-soft-text)]">
                    {t('drive.searchFailed')}
                  </Text>
                </Box>
              ) : files.length === 0 ? (
                <Box display="flex" className="h-64 items-center justify-center px-4">
                  <Text size="sm" color="text-[var(--bellum-text-muted)]">
                    {t('drive.empty')}
                  </Text>
                </Box>
              ) : (
                <Box className="divide-y divide-[var(--bellum-border)]">
                  {files.map((file: DriveFile) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => setSelected(file.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bellum-surface-2)] ${
                        selected === file.id ? 'bg-[var(--bellum-surface-2)]' : ''
                      }`}
                    >
                      <FileText className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
                      <Text size="sm" className="truncate text-[var(--bellum-text-primary)]">
                        {file.name ?? t('drive.untitled')}
                      </Text>
                      {contentOnlyIds.has(file.id) ? (
                        // Le nom ne porte pas le mot cherché : sans cette mention,
                        // la ligne a l'air hors sujet et l'utilisateur s'en méfie.
                        <Text size="xs" className="ml-auto shrink-0 text-[var(--bellum-text-muted)]">
                          {t('drive.foundInContent')}
                        </Text>
                      ) : null}
                    </button>
                  ))}
                </Box>
              )}
            </ScrollArea>
          </Box>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={ingest.isPending}>
            {t('common:actions.cancel')}
          </Button>
          {connected && canRead ? (
            <Button
              variant="black"
              size="sm"
              icon={FileText}
              disabled={!selected}
              isLoading={ingest.isPending}
              onClick={() => selected && ingest.mutate(selected)}
            >
              {t('drive.import')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
