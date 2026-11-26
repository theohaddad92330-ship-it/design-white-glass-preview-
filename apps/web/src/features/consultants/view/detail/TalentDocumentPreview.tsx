import { Box, Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Text } from '@bellum/ui'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { talentDocumentPreviewMode, type TalentDocument } from '@bellum/contracts'
import { useTalentDocumentFileUrl, useTalentDocumentText } from '../../talent-api'
import { CvDropZone } from '../CvDropZone'

/**
 * #4034.4/.5 — l'APERÇU d'un CV (Louis 12/10/2026 : « je veux voir le fichier,
 * l'aperçu du CV ajouté »). L'onglet Documents ne disait que « nom · CV · N
 * caractères extraits ».
 *
 * Un panneau (Sheet : titre, Échap, focus piégé, bouton fermer nommé) :
 *  - l'ORIGINAL, quand il a été conservé : PDF en cadre, image en image,
 *    DOCX/RTF/DOC en « Télécharger l'original » (aucun navigateur ne les rend) ;
 *    l'URL est signée et périme en cinq minutes, relue à chaque ouverture ;
 *  - sinon (CV importé avant #4034, démo) : la phrase qui le DIT et la zone de
 *    dépôt existante — rien d'inventé ;
 *  - toujours, le TEXTE extrait mis en page (largeur de lecture D81).
 */
export function TalentDocumentPreview({
  talentId,
  document,
  open,
  onOpenChange,
}: {
  talentId: string
  document: TalentDocument | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('consultants')
  const documentId = open && document ? document.id : null
  const hasOriginal = document?.hasOriginal === true
  const file = useTalentDocumentFileUrl(talentId, documentId, open && hasOriginal)
  const text = useTalentDocumentText(talentId, documentId)
  const name = document?.filename ?? ''

  const mode = talentDocumentPreviewMode(file.data?.mimeType ?? document?.mimeType ?? null)
  const downloadHref = file.data ? withDownload(file.data.url, file.data.filename) : null
  const frameTitle = t('detail.documentPreview.frameTitle', { name })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base">{t('detail.documentPreview.title')}</SheetTitle>
          <SheetDescription>{t('detail.documentPreview.description', { name })}</SheetDescription>
        </SheetHeader>

        <Box display="flex" className="flex-col gap-4 px-5 py-4">
          {hasOriginal ? (
            file.isError ? (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {t('detail.documentPreview.fileError')}
              </Text>
            ) : file.data ? (
              <>
                {mode === 'frame' ? (
                  <iframe
                    src={file.data.url}
                    title={frameTitle}
                    className="h-[70dvh] w-full rounded-md border border-border bg-background"
                  />
                ) : mode === 'image' ? (
                  <img
                    src={file.data.url}
                    alt={frameTitle}
                    className="max-h-[70dvh] w-full rounded-md border border-border object-contain"
                  />
                ) : (
                  <Text size="sm" className="text-[var(--bellum-text-muted)]">
                    {t('detail.documentPreview.noBrowserPreview')}
                  </Text>
                )}
                {downloadHref ? (
                  <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5 self-start">
                    <a href={downloadHref} target="_blank" rel="noopener noreferrer">
                      <Download className="size-4" aria-hidden />
                      {t('detail.documentPreview.download')}
                    </a>
                  </Button>
                ) : null}
              </>
            ) : (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {t('detail.documentPreview.loading')}
              </Text>
            )
          ) : (
            <>
              <Text size="sm">{t('detail.documentPreview.noOriginal')}</Text>
              <CvDropZone attachToTalentId={talentId} />
            </>
          )}

          <section aria-label={t('detail.documentPreview.extractedTitle')} className="flex flex-col gap-2">
            <Text element="h3" size="sm" weight="semibold">
              {t('detail.documentPreview.extractedTitle')}
            </Text>
            {text.data?.partial ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('detail.documentPreview.partial')}
              </Text>
            ) : null}
            {text.isError ? (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {t('detail.documentPreview.textError')}
              </Text>
            ) : text.data ? (
              text.data.text.trim().length > 0 ? (
                <Text size="sm" leading="relaxed" className="whitespace-pre-wrap break-words">
                  {text.data.text}
                </Text>
              ) : (
                <Text size="sm" className="text-[var(--bellum-text-muted)]">
                  {t('detail.documentPreview.noText')}
                </Text>
              )
            ) : (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {t('detail.documentPreview.loading')}
              </Text>
            )}
          </section>
        </Box>
      </SheetContent>
    </Sheet>
  )
}

/** Le magasin force le téléchargement sous le nom d'origine avec `download=`. */
function withDownload(url: string, filename: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(filename)}`
}
