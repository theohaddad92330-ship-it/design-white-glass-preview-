import {
  Box,
  BrailleLoader,
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@bellum/ui'
import { Download, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Account, Contact } from '@bellum/contracts'
import { useAccountPdfExport } from '@/features/accounts/hooks/useAccountPdfExport'
import { useAccountPdfPreviewUrl } from '@/features/accounts/hooks/useAccountPdfPreviewUrl'
import { capitalize } from '@bellum/utils'

type AccountPdfPreviewSheetProps = {
  account: Account
  contacts: Contact[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Right-side sheet rendering the dossier PDF inline via react-pdf's `PDFViewer`. */
export function AccountPdfPreviewSheet({ account, contacts, open, onOpenChange }: AccountPdfPreviewSheetProps) {
  const { t } = useTranslation('accounts')
  const { exportPdf, renderPdfBlob, isExporting } = useAccountPdfExport(account, contacts)
  // #4073 — un seul rendu par ouverture, le même document que le téléchargement.
  const preview = useAccountPdfPreviewUrl(renderPdfBlob, open)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="!w-full sm:!max-w-[50vw] flex flex-col gap-0 p-0 bg-[var(--bellum-surface-1)] border-l border-[var(--border-subtle)]"
      >
        <SheetHeader className="px-4 md:px-6 py-4 border-b border-[var(--border-subtle)] flex-row items-center justify-between gap-4">
          <Box className="min-w-0">
            <SheetTitle className="text-[var(--text-primary)] truncate">
              {t('pdf.previewTitle', { company: capitalize(account.company_name) })}
            </SheetTitle>
            <SheetDescription className="text-xs text-[var(--bellum-text-secondary)]">
              {t('pdf.generatedBy')}
            </SheetDescription>
          </Box>
          <Box display="flex" className="items-center gap-2 shrink-0">
            {/* #2081.14 — livrable commercial, décision Louis 19/09 : plus masqué par la règle d'espace. */}
            <Button
              variant="violet"
              size="sm"
              icon={isExporting ? undefined : Download}
              onClick={exportPdf}
              disabled={isExporting}
            >
              {isExporting ? (
                <span className="inline-flex items-center gap-2">
                  <BrailleLoader variant="grid-syncing" dotSize={2} dotGap={1} />
                  {t('pdf.downloading')}
                </span>
              ) : (
                t('common:actions.download')
              )}
            </Button>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common:actions.close')}
                className="w-8 h-8 text-[var(--text-ghost)]"
              >
                <X className="size-4" />
              </Button>
            </SheetClose>
          </Box>
        </SheetHeader>

        <Box className="flex-1 min-h-0 bg-[var(--bg-base)] p-6 overflow-hidden">
          {open && (
            <Box className="relative w-full h-full rounded-xl overflow-hidden border border-[var(--border-subtle)] shadow-2xl bg-[var(--bg-elevated)]">
              {preview.url && (
                <iframe
                  src={preview.url}
                  title={t('pdf.previewTitle', { company: capitalize(account.company_name) })}
                  className="w-full h-full border-0"
                />
              )}
              {preview.status === 'loading' && (
                <Box
                  display="flex"
                  className="absolute inset-0 items-center justify-center bg-[var(--bg-elevated)] text-[var(--bellum-text-accent)]"
                >
                  <BrailleLoader variant="grid-searching" dotSize={3} dotGap={1} />
                </Box>
              )}
              {preview.status === 'error' && (
                <Box
                  display="flex"
                  role="alert"
                  className="absolute inset-0 flex-col items-center justify-center gap-2 p-6 text-center bg-[var(--bg-elevated)]"
                >
                  <p className="text-sm text-[var(--text-primary)]">{t('pdf.previewError')}</p>
                  <p className="text-xs text-[var(--bellum-text-secondary)]">{preview.error}</p>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </SheetContent>
    </Sheet>
  )
}
