import { ensureError, TechnicalError } from '@bellum/errors'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { AuditHypothesis } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useBrand } from '@/features/brand/brand-context'
import type { CommercialAudit } from '../lib/build-audit'

type UseAuditPdfExportResult = {
  exportPdf: () => Promise<void>
  isExporting: boolean
}

/**
 * #2090.35 / #2074.9 — Lazy-loads `@/lib/audit-pdf/export` on first call so
 * `@react-pdf/renderer` stays out of the initial bundle — même patron que
 * `useAccountPdfExport` (`features/accounts/hooks/useAccountPdfExport.ts`).
 */
export function useAuditPdfExport(
  audit: CommercialAudit,
  hypotheses: readonly AuditHypothesis[] = [],
): UseAuditPdfExportResult {
  const [isExporting, setIsExporting] = useState(false)
  const brand = useBrand()

  const exportPdf = useCallback(async () => {
    setIsExporting(true)
    try {
      const { exportAuditPdf } = await import('@/lib/audit-pdf/export')
      await exportAuditPdf(audit, hypotheses, brand)
      toast.success(i18n.t('commercialAudit:toast.pdfDownloaded'))
    } catch (error) {
      toast.error(i18n.t('commercialAudit:toast.pdfError'), { description: ensureError(error).message })
      throw new TechnicalError('Audit PDF export failed', { cause: ensureError(error) })
    } finally {
      setIsExporting(false)
    }
  }, [audit, hypotheses, brand])

  return { exportPdf, isExporting }
}
