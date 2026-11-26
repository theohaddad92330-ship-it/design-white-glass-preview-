import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { RagPreviewKind } from '@bellum/contracts'
import { ragApi } from '@/features/rag/api'
import { SpreadsheetGrid } from './SpreadsheetGrid'
import { parsePptx, type Slide } from './slides'
import { parseCsv, parseXlsx, type SpreadsheetSheet } from './spreadsheet'
import { docxToSafeHtml } from './word-document'

/**
 * #3803 (3803.2/3803.3) — LA VISIONNEUSE de l'original, chargée À LA DEMANDE
 * (`React.lazy` depuis `DocumentPreview`) : fflate, DOMPurify et les lecteurs
 * n'entrent jamais dans le bundle initial.
 *
 * Les octets viennent de l'API (`GET /rag-documents/:id/source`), qui a déjà
 * vérifié que l'appelant peut LIRE le document. Une lecture qui échoue
 * retombe sur le texte (`fallback`), jamais sur une page blanche.
 */
type Rendered =
  | { kind: 'spreadsheet'; sheets: SpreadsheetSheet[] }
  | { kind: 'document'; html: string }
  | { kind: 'slides'; slides: Slide[] }
  | { kind: 'pdf'; bytes: Uint8Array<ArrayBuffer> }

function render(kind: Exclude<RagPreviewKind, 'text'>, fileName: string, bytes: Uint8Array<ArrayBuffer>): Rendered {
  switch (kind) {
    case 'spreadsheet':
      return {
        kind,
        sheets: fileName.toLowerCase().endsWith('.csv') ? parseCsv(new TextDecoder().decode(bytes)) : parseXlsx(bytes),
      }
    case 'document':
      return { kind, html: docxToSafeHtml(bytes) }
    case 'slides':
      return { kind, slides: parsePptx(bytes) }
    case 'pdf':
      return { kind, bytes }
  }
}

function PdfFrame({ bytes, fileName }: { bytes: Uint8Array<ArrayBuffer>; fileName: string }) {
  const { t } = useTranslation('common')
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    // Une URL `blob:` locale, révoquée à la fermeture : le PDF ne quitte pas ce navigateur.
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [bytes])
  if (!url) return null
  return (
    <iframe
      src={url}
      title={t('documentPreview.pdfTitle', { name: fileName })}
      className="h-[70dvh] w-full rounded-md border border-[var(--bellum-border)]"
    />
  )
}

function SlideCards({ slides }: { slides: readonly Slide[] }) {
  const { t } = useTranslation('common')
  if (slides.length === 0) {
    return <p className="text-sm text-[var(--bellum-text-muted)]">{t('documentPreview.noSlides')}</p>
  }
  return (
    <ol className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto">
      {slides.map((slide, index) => (
        <li key={index} className="rounded-md border border-[var(--bellum-border)] p-3">
          <p className="text-xs text-[var(--bellum-text-muted)]">
            {t('documentPreview.slideLabel', { number: index + 1 })}
          </p>
          <h3 className="text-sm font-semibold">{slide.title || t('documentPreview.slideUntitled')}</h3>
          {slide.body.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-sm text-[var(--bellum-text-secondary)]">
              {slide.body.map((line, lineIndex) => (
                <li key={lineIndex}>{line}</li>
              ))}
            </ul>
          ) : null}
          {slide.notes.length > 0 ? (
            <div className="mt-2 border-t border-[var(--bellum-border)] pt-2 text-xs text-[var(--bellum-text-muted)]">
              <p className="font-semibold">{t('documentPreview.slideNotes')}</p>
              {slide.notes.map((line, lineIndex) => (
                <p key={lineIndex}>{line}</p>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

export function SourceViewer({
  documentId,
  kind,
  fileName,
  fallback,
}: {
  documentId: string
  kind: Exclude<RagPreviewKind, 'text'>
  fileName: string
  fallback: React.ReactNode
}) {
  const { t } = useTranslation('common')
  const source = useQuery({
    queryKey: ['rag-documents', documentId, 'source'],
    queryFn: () => ragApi.getSourceBytes(documentId),
    staleTime: Infinity,
  })
  const rendered = useMemo(() => {
    if (!source.data) return null
    try {
      return render(kind, fileName, new Uint8Array(source.data))
    } catch {
      return 'failed' as const
    }
  }, [source.data, kind, fileName])

  if (source.isLoading) return <p className="text-sm text-[var(--bellum-text-muted)]">{t('documentPreview.loading')}</p>
  if (source.isError || rendered === 'failed' || rendered === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[var(--bellum-text-muted)]">{t('documentPreview.renderFailed')}</p>
        {fallback}
      </div>
    )
  }
  switch (rendered.kind) {
    case 'spreadsheet':
      return <SpreadsheetGrid sheets={rendered.sheets} />
    case 'document':
      return rendered.html ? (
        // Assaini par DOMPurify (`docxToSafeHtml` → `sanitizeDocumentHtml`) : balises fermées, aucun attribut.
        <div
          className="docx-preview max-h-[60dvh] overflow-y-auto text-sm text-[var(--bellum-text-secondary)] [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2 [&_td]:border [&_td]:border-[var(--bellum-border)] [&_td]:px-2"
          dangerouslySetInnerHTML={{ __html: rendered.html }}
        />
      ) : (
        <p className="text-sm text-[var(--bellum-text-muted)]">{t('documentPreview.emptyDocument')}</p>
      )
    case 'slides':
      return <SlideCards slides={rendered.slides} />
    case 'pdf':
      return <PdfFrame bytes={rendered.bytes} fileName={fileName} />
  }
}
