import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountPdfPreviewUrl } from './useAccountPdfPreviewUrl'

const createObjectURL = vi.fn(() => 'blob:pdf-1')
const revokeObjectURL = vi.fn()

beforeEach(() => {
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  Object.assign(URL, { createObjectURL, revokeObjectURL })
})

const blob = () => new Blob(['%PDF'], { type: 'application/pdf' })

describe('useAccountPdfPreviewUrl', () => {
  it("fabrique le PDF UNE fois, même quand l'appelant se re-rend avec un nouveau rendeur", async () => {
    const render = vi.fn(async () => blob())
    const { result, rerender } = renderHook(({ fn }) => useAccountPdfPreviewUrl(fn, true), {
      initialProps: { fn: render as () => Promise<Blob> },
    })
    // Nouvelle identité de fonction à chaque rendu : c'était la boucle de PDFViewer.
    rerender({ fn: async () => blob() })
    rerender({ fn: async () => blob() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.url).toBe('blob:pdf-1')
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('ne fabrique rien tant que la feuille est fermée', () => {
    const render = vi.fn(async () => blob())
    const { result } = renderHook(() => useAccountPdfPreviewUrl(render, false))
    expect(render).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('passe en erreur avec la cause, sans rester en chargement', async () => {
    const { result } = renderHook(() =>
      useAccountPdfPreviewUrl(async () => {
        throw new Error('police absente')
      }, true),
    )
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('police absente')
    expect(result.current.url).toBeNull()
  })

  it("libère l'URL à la fermeture", async () => {
    const { result, rerender } = renderHook(({ open }) => useAccountPdfPreviewUrl(async () => blob(), open), {
      initialProps: { open: true },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => rerender({ open: false }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pdf-1')
  })
})
