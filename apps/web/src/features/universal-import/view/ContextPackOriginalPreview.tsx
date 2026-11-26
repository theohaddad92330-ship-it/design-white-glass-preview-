import { Box, Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { talentDocumentPreviewMode, type ContextPackHistoryItem } from '@bellum/contracts'
import { fetchContextPackOriginalUrl } from '../api'

/**
 * #4573 — la ligne « original » d'un import de pack, la MÊME dans les deux historiques (Réglages › Imports et
 * Contacts › Imports & sources, GA-26) : un aperçu quand l'original est gardé ; sinon l'absence se NOMME — un import
 * antérieur dit qu'il n'a pas gardé son original, il ne fait pas semblant. Un lot de CV (sans état) n'en dit rien.
 */
export function ContextPackOriginalLine({
  item,
}: {
  item: Pick<ContextPackHistoryItem, 'id' | 'fileName' | 'original'>
}) {
  const { t } = useTranslation('importWizard')
  const [open, setOpen] = useState(false)
  if (!item.original) return null
  if (item.original !== 'kept') {
    return (
      <Text size="xs" className="text-[var(--text-muted)]" data-testid="context-pack-original-absent">
        {t(`universal.history.original.absent.${item.original}`)}
      </Text>
    )
  }
  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 pointer-coarse:min-h-11" onClick={() => setOpen(true)}>
        {t('universal.history.original.open')}
      </Button>
      <ContextPackOriginalPreview importId={item.id} fileName={item.fileName} open={open} onOpenChange={setOpen} />
    </>
  )
}

/**
 * #4573 — l'APERÇU de l'original d'un import de pack, sur le panneau des CV (#4034, `TalentDocumentPreview`) : PDF en
 * cadre, les autres formats en « Télécharger l'original » (aucun navigateur ne rend un DOCX). L'URL est signée côté
 * serveur, ne vaut que pour CET import, périme en cinq minutes, et se relit à chaque ouverture.
 */
function ContextPackOriginalPreview({
  importId,
  fileName,
  open,
  onOpenChange,
}: {
  importId: string
  fileName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('importWizard')
  const file = useQuery({
    queryKey: ['universal-import', 'history', 'original', importId],
    queryFn: () => fetchContextPackOriginalUrl(importId),
    enabled: open,
    // Une URL signée périme : jamais resservie depuis le cache à la réouverture.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  const mode = talentDocumentPreviewMode(file.data?.mimeType ?? null)
  const frameTitle = t('universal.history.original.frameTitle', { name: fileName })
  const downloadHref = file.data
    ? `${file.data.url}${file.data.url.includes('?') ? '&' : '?'}download=${encodeURIComponent(file.data.fileName)}`
    : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base">{t('universal.history.original.title')}</SheetTitle>
          <SheetDescription>{t('universal.history.original.description', { name: fileName })}</SheetDescription>
        </SheetHeader>
        <Box display="flex" className="flex-col gap-4 px-5 py-4">
          {file.isError ? (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('universal.history.original.error')}
            </Text>
          ) : file.data ? (
            <>
              {mode === 'frame' ? (
                <iframe
                  src={file.data.url}
                  title={frameTitle}
                  className="h-[70dvh] w-full rounded-md border border-border bg-background"
                />
              ) : (
                <Text size="sm" className="text-[var(--bellum-text-muted)]">
                  {t('universal.history.original.noBrowserPreview')}
                </Text>
              )}
              {downloadHref ? (
                <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5 self-start">
                  <a href={downloadHref} target="_blank" rel="noopener noreferrer">
                    <Download className="size-4" aria-hidden />
                    {t('universal.history.original.download')}
                  </a>
                </Button>
              ) : null}
            </>
          ) : (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('universal.history.original.loading')}
            </Text>
          )}
        </Box>
      </SheetContent>
    </Sheet>
  )
}
