import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { StorageUploadInput } from '@bellum/contracts'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const INPUT: StorageUploadInput = { fileName: 'ticket.jpg', contentType: 'image/jpeg', fileB64: 'Zm9v' }

/**
 * #1827.2 — ce que ce fichier garde :
 *
 *  1. Un succès de l'API voyage TEL QUEL — aucun champ n'est reconstruit ici.
 *  2. Une panne RÉSEAU rend `unavailable`, jamais une exception : l'appelant
 *     (`ExpenseDepositStart`) ne doit jamais avoir à distinguer « le serveur a
 *     répondu 'unavailable' » de « la requête n'est jamais partie ».
 *  3. `hasAnyProposal` ne dit VRAI que sur le statut `ok`, jamais sur un
 *     champ resté à `null` dans un autre statut.
 */
describe('extractReceipt', () => {
  beforeEach(() => apiFetch.mockReset())

  it('envoie le corps tel quel vers /expenses/receipts/extract', async () => {
    const { extractReceipt } = await import('./receipt-extraction')
    apiFetch.mockResolvedValue({
      status: 'ok',
      ocrUsed: true,
      costUsd: 0.002,
      fields: {
        amountCents: { value: 4500, confidence: 0.9, sourceExcerpt: 'Total 45,00' },
        spentOn: { value: '2026-03-01', confidence: 0.9, sourceExcerpt: '01/03/2026' },
        category: { value: 'taxi', confidence: 0.9, sourceExcerpt: 'TAXI' },
        vatRateBps: { value: null, confidence: 0, sourceExcerpt: '' },
      },
    })

    const result = await extractReceipt(INPUT)

    expect(apiFetch).toHaveBeenCalledWith({ path: '/expenses/receipts/extract', method: 'POST', body: INPUT })
    expect(result.status).toBe('ok')
    expect(result.fields.amountCents.value).toBe(4500)
  })

  it('une panne réseau rend `unavailable`, jamais une exception qui remonterait', async () => {
    const { extractReceipt } = await import('./receipt-extraction')
    // ⚠️ `mockRejectedValue` (la forme STICKY, pas `-Once`) fait échouer CE
    // test avec « Failed to fetch » non intercepté par Vitest, alors même que
    // `extractReceipt` capte et traite l'erreur (vérifié en isolant : le
    // `catch` s'exécute, `result.status` vaut bien `unavailable`— seule la
    // détection de rejet non géré de Vitest s'en plaint, à travers la
    // frontière de module que crée cet `import()`). `-Once` n'a pas ce défaut.
    apiFetch.mockRejectedValueOnce(new Error('Failed to fetch'))

    const result = await extractReceipt(INPUT)

    expect(result.status).toBe('unavailable')
    expect(result.costUsd).toBeNull()
    expect(result.fields.amountCents.value).toBeNull()
  })
})

describe('hasAnyProposal', () => {
  it('vrai seulement sur le statut ok avec au moins un champ lu', async () => {
    const { hasAnyProposal } = await import('./receipt-extraction')
    expect(
      hasAnyProposal({
        status: 'ok',
        ocrUsed: false,
        costUsd: 0.001,
        fields: {
          amountCents: { value: 100, confidence: 0.9, sourceExcerpt: 'x' },
          spentOn: { value: null, confidence: 0, sourceExcerpt: '' },
          category: { value: null, confidence: 0, sourceExcerpt: '' },
          vatRateBps: { value: null, confidence: 0, sourceExcerpt: '' },
        },
      }),
    ).toBe(true)
  })

  it('faux quand le statut ok ne porte aucun champ lu — le seuil de confiance a tout écarté', async () => {
    const { hasAnyProposal } = await import('./receipt-extraction')
    expect(
      hasAnyProposal({
        status: 'ok',
        ocrUsed: false,
        costUsd: 0.001,
        fields: {
          amountCents: { value: null, confidence: 0, sourceExcerpt: '' },
          spentOn: { value: null, confidence: 0, sourceExcerpt: '' },
          category: { value: null, confidence: 0, sourceExcerpt: '' },
          vatRateBps: { value: null, confidence: 0, sourceExcerpt: '' },
        },
      }),
    ).toBe(false)
  })

  it('faux sur un statut qui n’est pas ok, même si un champ semblait rempli', async () => {
    const { hasAnyProposal } = await import('./receipt-extraction')
    expect(
      hasAnyProposal({
        status: 'not_a_receipt',
        ocrUsed: false,
        costUsd: 0.001,
        fields: {
          amountCents: { value: null, confidence: 0, sourceExcerpt: '' },
          spentOn: { value: null, confidence: 0, sourceExcerpt: '' },
          category: { value: null, confidence: 0, sourceExcerpt: '' },
          vatRateBps: { value: null, confidence: 0, sourceExcerpt: '' },
        },
      }),
    ).toBe(false)
  })
})
