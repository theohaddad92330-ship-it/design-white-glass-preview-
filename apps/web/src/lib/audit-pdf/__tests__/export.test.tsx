import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auditHypothesesFrom, resolveBrand, type ProfileContext } from '@bellum/contracts'
import { useStandardPdfFonts } from '@/test/pdf-standard-fonts'
import { buildCommercialAudit } from '@/features/commercial-audit/lib/build-audit'

const PRODUCT_BRAND = resolveBrand(null)
const CLIENT_BRAND = resolveBrand({ brandName: 'AcmeSales' })

// The global test setup mocks the entire export module to avoid pulling
// @react-pdf/renderer into every page-level test. This file needs the real
// implementations, so we unmock before importing.
vi.unmock('@/lib/audit-pdf/export')

const { exportAuditPdf, renderAuditPdfBlob } = await import('../export')

beforeAll(() => {
  useStandardPdfFonts()
})

const CONTEXT: ProfileContext = { esnArchetype: 'boutiqueExpert', sellingPosture: 'expertiseRare' }
const audit = buildCommercialAudit(CONTEXT, [], null, null)
const NO_HYPOTHESES = auditHypothesesFrom(null)

describe('renderAuditPdfBlob', () => {
  it('returns a non-empty PDF blob', async () => {
    const blob = await renderAuditPdfBlob(audit, NO_HYPOTHESES, PRODUCT_BRAND)
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe('application/pdf')
  }, 20_000)
})

describe('exportAuditPdf', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let originalCreate: typeof URL.createObjectURL | undefined
  let originalRevoke: typeof URL.revokeObjectURL | undefined
  let clickedAnchor: HTMLAnchorElement | null = null

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    clickedAnchor = null

    vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
      if (node instanceof HTMLAnchorElement) clickedAnchor = node
      return node
    })
  })

  afterEach(() => {
    if (originalCreate) URL.createObjectURL = originalCreate
    if (originalRevoke) URL.revokeObjectURL = originalRevoke
    vi.restoreAllMocks()
  })

  it('triggers a download named after the space brand, not ours', async () => {
    await exportAuditPdf(audit, NO_HYPOTHESES, CLIENT_BRAND)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickedAnchor).not.toBeNull()
    expect(clickedAnchor!.download).toBe('acmesales-audit-commercial.pdf')
    expect(clickedAnchor!.href).toContain('blob:mock-url')
  }, 20_000)

  it('falls back to "bellum" when the brand name has no alphanumerics', async () => {
    await exportAuditPdf(audit, NO_HYPOTHESES, { ...PRODUCT_BRAND, name: '???' })
    expect(clickedAnchor!.download).toBe('bellum-audit-commercial.pdf')
  }, 20_000)
})
