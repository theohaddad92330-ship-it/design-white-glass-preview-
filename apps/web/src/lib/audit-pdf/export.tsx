import { pdf } from '@react-pdf/renderer'
import type { AuditHypothesis, Brand } from '@bellum/contracts'
import type { CommercialAudit } from '@/features/commercial-audit/lib/build-audit'
import { downloadBlob, slugifyForFilename } from '@/lib/pdf-download'
import { AuditPdfDocument } from './AuditPdfDocument'

/** Render the audit PDF in-memory and return the Blob (used by the download flow). */
export async function renderAuditPdfBlob(
  audit: CommercialAudit,
  hypotheses: readonly AuditHypothesis[],
  brand: Brand,
): Promise<Blob> {
  return pdf(<AuditPdfDocument audit={audit} hypotheses={hypotheses} brand={brand} />).toBlob()
}

/**
 * #2090.35 / #2074.9 — Generate the audit PDF in-browser via
 * `@react-pdf/renderer` and trigger a download. No popup, no print dialog —
 * même patron que `exportAccountPdf` (`account-pdf/export.tsx`).
 */
export async function exportAuditPdf(
  audit: CommercialAudit,
  hypotheses: readonly AuditHypothesis[],
  brand: Brand,
): Promise<void> {
  const blob = await renderAuditPdfBlob(audit, hypotheses, brand)
  const slug = slugifyForFilename(brand.name, 'bellum')
  downloadBlob(blob, `${slug}-audit-commercial.pdf`)
}
