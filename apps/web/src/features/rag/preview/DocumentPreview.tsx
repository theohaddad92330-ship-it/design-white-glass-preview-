import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Button } from '@bellum/ui'
import { ragPreviewKind } from '@bellum/contracts'
import { ragApi } from '@/features/rag/api'
import { useRagDocumentContent } from '@/features/rag/hooks/useRagDocumentContent'

/**
 * #3803 — L'APERÇU D'UN DOCUMENT DÉPOSÉ, partagé par le chat (pièce jointe)
 * ET Connaissances (3803.6) : un seul composant, jamais deux aperçus qui
 * divergent (GA-26).
 *
 *  · original conservé → la visionneuse de son format (grille à onglets, PDF,
 *    docx, slides), chargée à la demande, + « Télécharger l'original » ;
 *  · md/txt/json → le texte, mis en forme ;
 *  · aucun original (déposé avant #3803) → le texte, ET la mention
 *    « Original non conservé » (3803.4) — jamais une absence muette.
 */
const SourceViewer = lazy(() => import('./SourceViewer').then(module => ({ default: module.SourceViewer })))

function formatText(content: string, fileName: string | undefined): string {
  if (!fileName?.toLowerCase().endsWith('.json')) return content
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

export function DocumentPreview({ documentId }: { documentId: string }) {
  const { t } = useTranslation('common')
  const { data, isLoading, isError } = useRagDocumentContent(documentId)
  // L'URL signée (cinq minutes) se demande AU CLIC, jamais d'avance.
  const [download, setDownload] = useState<'idle' | 'pending' | 'failed'>('idle')
  const startDownload = async () => {
    setDownload('pending')
    try {
      const signed = await ragApi.getSourceLink(documentId)
      window.open(signed.url, '_blank', 'noopener,noreferrer')
      setDownload('idle')
    } catch {
      setDownload('failed')
    }
  }

  if (isLoading) return <p className="text-sm text-[var(--bellum-text-muted)]">{t('documentPreview.loading')}</p>
  if (isError || !data) return <p className="text-sm text-[var(--bellum-text-muted)]">{t('documentPreview.failed')}</p>

  const source = data.source
  const kind = source ? ragPreviewKind(source.fileName) : null
  const text = data.content ? (
    <div className="max-h-[60dvh] overflow-y-auto whitespace-pre-wrap text-sm text-[var(--bellum-text-secondary)]">
      {formatText(data.content, source?.fileName)}
    </div>
  ) : (
    <p className="text-sm text-[var(--bellum-text-muted)]">{t('documentPreview.emptyDocument')}</p>
  )

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {source ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={download === 'pending'}
            onClick={() => void startDownload()}
          >
            <Download className="size-4" aria-hidden="true" />
            {t('documentPreview.download')}
          </Button>
          {download === 'failed' ? (
            <p role="alert" className="text-xs text-[var(--danger-soft-text)]">
              {t('documentPreview.downloadFailed')}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-[var(--bellum-border)] px-3 py-2">
          <p className="text-sm font-semibold">{t('documentPreview.notKept')}</p>
          <p className="text-xs text-[var(--bellum-text-muted)]">{t('documentPreview.notKeptHint')}</p>
        </div>
      )}
      {source && kind && kind !== 'text' ? (
        <Suspense fallback={<p className="text-sm text-[var(--bellum-text-muted)]">{t('documentPreview.loading')}</p>}>
          <SourceViewer documentId={documentId} kind={kind} fileName={source.fileName} fallback={text} />
        </Suspense>
      ) : (
        text
      )}
    </div>
  )
}
