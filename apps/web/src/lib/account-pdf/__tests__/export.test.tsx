import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Contact } from '@bellum/contracts'
import { useStandardPdfFonts } from '@/test/pdf-standard-fonts'
import { resolveBrand } from '@bellum/contracts'

/** La marque du produit — un espace qui n'a rien posé. */
const PRODUCT_BRAND = resolveBrand(null)
/** Un espace en marque blanche : c'est LUI qui doit nommer le fichier. */
const CLIENT_BRAND = resolveBrand({ brandName: 'AcmeSales' })

// The global test setup mocks the entire export module to avoid pulling
// @react-pdf/renderer into every page-level test. This file needs the real
// implementations, so we unmock before importing.
vi.unmock('@/lib/account-pdf/export')

const { exportAccountPdf, renderAccountPdfBlob } = await import('../export')

// Importing `../export` pulls in `styles.ts`, which registers Geist from a CDN.
// Swap those registrations for the built-in standard fonts so rendering stays
// hermetic (no network) while still exercising the real renderer.
beforeAll(() => {
  useStandardPdfFonts()
})

const baseAccount: Account = {
  id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  company_name: 'ACME Corp',
  siren: null,
  sector: 'Tech',
  employees: '1000',
  revenue: '100M',
  headquarters: 'Paris',
  website: 'https://acme.test',
  subsidiaries: [],
  it_challenges: [],
  recent_signals: [],
  priority_score: 8,
  priority_justification: null,
  raw_analysis: null,
  status: 'completed',
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('renderAccountPdfBlob — compte à 1 200 contacts (#4073)', () => {
  it('fabrique un PDF borné sans figer', async () => {
    const contacts = Array.from({ length: 1200 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      account_id: baseAccount.id,
      user_id: baseAccount.user_id,
      full_name: `Contact ${i}`,
      title: 'Directeur',
      entity: 'ACME',
      decision_role: 'user',
      priority: 3,
      email: null,
    })) as unknown as Contact[]
    const started = Date.now()
    const blob = await renderAccountPdfBlob(baseAccount, contacts, PRODUCT_BRAND)
    expect(blob.size).toBeGreaterThan(0)
    expect(Date.now() - started).toBeLessThan(15_000)
  }, 30_000)
})

describe('renderAccountPdfBlob', () => {
  it('returns a non-empty PDF blob', async () => {
    const blob = await renderAccountPdfBlob(baseAccount, [], PRODUCT_BRAND)
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe('application/pdf')
  }, 20_000)

  it('renders even when raw_analysis is null and lists are empty', async () => {
    const blob = await renderAccountPdfBlob(
      { ...baseAccount, raw_analysis: null, it_challenges: [], recent_signals: [], subsidiaries: [] },
      [],
      PRODUCT_BRAND,
    )
    expect(blob.size).toBeGreaterThan(0)
  }, 20_000)

  // #4073.1 (13/10/2026) — le brief des faits du compte est un paramètre à
  // part (lu de façon asynchrone par `useAccountFactsBrief`, jamais recalculé
  // depuis `account`) : un appel SANS lui doit continuer de fonctionner.
  it('accepte un brief de faits sans jeter', async () => {
    const blob = await renderAccountPdfBlob(baseAccount, [], PRODUCT_BRAND, {
      asOf: '2026-10-13T08:00:00Z',
      deals: [{ date: '2024-03-01T00:00:00Z', kind: 'deal_lost', label: 'Refonte SI RH' }],
      missions: [],
      recurringNeeds: [],
      exchanges: [],
    })
    expect(blob.size).toBeGreaterThan(0)
  }, 20_000)
})

describe('exportAccountPdf', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let originalCreate: typeof URL.createObjectURL | undefined
  let originalRevoke: typeof URL.revokeObjectURL | undefined
  let clickedAnchor: HTMLAnchorElement | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    clickedAnchor = null

    // Spy on appendChild — that's where exportAccountPdf hands us the anchor it
    // built. Capturing it there lets us assert the filename without invoking
    // jsdom's no-op anchor click.
    vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
      if (node instanceof HTMLAnchorElement) clickedAnchor = node
      return node
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalCreate) URL.createObjectURL = originalCreate
    if (originalRevoke) URL.revokeObjectURL = originalRevoke
    vi.restoreAllMocks()
  })

  it('triggers a download with a slugified filename', async () => {
    await exportAccountPdf(baseAccount, [], PRODUCT_BRAND)

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickedAnchor).not.toBeNull()
    expect(clickedAnchor!.download).toBe('bellum-acme-corp.pdf')
    expect(clickedAnchor!.href).toContain('blob:mock-url')
  }, 20_000)

  it('falls back to "compte" when the company name has no alphanumerics', async () => {
    await exportAccountPdf({ ...baseAccount, company_name: '???' }, [], PRODUCT_BRAND)
    expect(clickedAnchor!.download).toBe('bellum-compte.pdf')
  }, 20_000)

  it('nomme le fichier avec la marque de l’ESPACE, pas la nôtre', async () => {
    // Marque blanche, 01/09/2026. Le nom du fichier est ce qui SURVIT au
    // téléchargement — dans un dossier, dans une pièce jointe — bien après que
    // l'écran a disparu. Le contenu du PDF ne peut pas le rattraper.
    await exportAccountPdf(baseAccount, [], CLIENT_BRAND)
    expect(clickedAnchor!.download).toBe('acmesales-acme-corp.pdf')
  }, 20_000)

  it('revokes the object URL after a delay (so Safari can start the download)', async () => {
    await exportAccountPdf(baseAccount, [], PRODUCT_BRAND)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  }, 20_000)
})
