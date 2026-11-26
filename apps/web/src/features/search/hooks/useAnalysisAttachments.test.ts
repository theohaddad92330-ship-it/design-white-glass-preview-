import { act, renderHook } from '@testing-library/react'
import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ingest = vi.fn()
const ingestZip = vi.fn()
const updateScope = vi.fn()
vi.mock('@/features/rag/api', () => ({
  ragApi: {
    ingest: (...a: unknown[]) => ingest(...a),
    ingestZip: (...a: unknown[]) => ingestZip(...a),
    updateScope: (...a: unknown[]) => updateScope(...a),
  },
}))

import { ApiError } from '@/lib/api-error'
import { useAnalysisAttachments } from './useAnalysisAttachments'

const file = (name: string, body = 'x,y\n1,2') => new File([body], name)
const labels = { sendFailed: 'échec' }
const SCOPE_ACCOUNT = '11111111-1111-4111-8111-111111111111'

// #3623.1a — `new Uint8Array(…)` : sous jsdom, `TextEncoder` rend un tableau d'un AUTRE royaume,
// que fflate (`instanceof Uint8Array`) prendrait pour un dossier — un navigateur n'a qu'un royaume.
// Le `.buffer` de `zipSync` se type `ArrayBufferLike` (TS 5.7) : un `File` veut un `ArrayBuffer` concret.
const validZip = (name: string, entries: Record<string, string> = { 'a.csv': 'x,y\n1,2' }) =>
  new File(
    [
      zipSync(Object.fromEntries(Object.entries(entries).map(([path, body]) => [path, new Uint8Array(strToU8(body))])))
        .buffer as ArrayBuffer,
    ],
    name,
  )

beforeEach(() => {
  ingest.mockReset()
  ingestZip.mockReset()
  updateScope.mockReset()
})

describe('useAnalysisAttachments (#3623)', () => {
  it('envoie le CONTENU d’un CSV, en portée personnelle avant que le compte existe', async () => {
    ingest.mockResolvedValue({ id: 'doc-1', partial: false, duplicate: false })
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([file('recherches.csv')])
    })
    let ok = false
    await act(async () => {
      ok = await result.current.sendAll()
    })
    expect(ok).toBe(true)
    expect(ingest).toHaveBeenCalledWith(
      // #3803.2 — le nom voyage avec le texte : le serveur peut ranger l'original (grille CSV).
      expect.objectContaining({
        title: 'recherches.csv',
        content: 'x,y\n1,2',
        filename: 'recherches.csv',
        scope: 'personal',
      }),
    )
    expect(result.current.entries[0]).toMatchObject({ phase: 'done', newDocumentIds: ['doc-1'], bound: false })
  })

  it('un classeur part en base64 pour extraction serveur', async () => {
    ingest.mockResolvedValue({ id: 'doc-2', partial: false, duplicate: false })
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([file('grille.xlsx', 'binaire')])
    })
    await act(async () => {
      await result.current.sendAll()
    })
    const input = ingest.mock.calls[0]![0]
    expect(input.filename).toBe('grille.xlsx')
    expect(typeof input.fileB64).toBe('string')
    expect(input.content).toBeUndefined()
  })

  it('un .zip passe par la route d’archive et rend le sort de chaque entrée', async () => {
    ingestZip.mockResolvedValue({
      total: 3,
      outcomes: [
        { status: 'ingested', file: 'a.csv', id: 'z1', partial: false },
        { status: 'duplicate_existing', file: 'b.csv', existingId: 'old' },
        { status: 'failed', file: 'c.pdf', reason: 'illisible' },
      ],
    })
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([validZip('pack.zip')])
    })
    await act(async () => {
      await result.current.sendAll({ accountId: SCOPE_ACCOUNT })
    })
    expect(ingestZip).toHaveBeenCalledWith(expect.objectContaining({ scope: 'account', accountId: SCOPE_ACCOUNT }))
    expect(result.current.entries[0]).toMatchObject({
      phase: 'done',
      readCount: 2,
      newDocumentIds: ['z1'],
      reason: 'c.pdf — illisible',
      bound: true,
    })
  })

  // #4294.1 — chaque pièce d'une archive est NOMMÉE avec son sort ; celle qui échoue dit pourquoi.
  it('#4294.1 — une archive nomme chaque pièce AVANT envoi, puis son sort après', async () => {
    ingestZip.mockResolvedValue({
      total: 2,
      outcomes: [
        { status: 'ingested', file: 'bon.pdf', id: 'z1', partial: false },
        { status: 'failed', file: 'faux.pdf', reason: 'ce fichier n’est pas un PDF' },
      ],
    })
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([validZip('pack.zip', { 'bon.pdf': 'x', 'faux.pdf': 'pas un pdf' })])
    })
    expect(result.current.entries[0]?.pieces).toEqual([
      { name: 'bon.pdf', fate: 'pending' },
      { name: 'faux.pdf', fate: 'pending' },
    ])
    await act(async () => {
      await result.current.sendAll({ accountId: SCOPE_ACCOUNT })
    })
    expect(result.current.entries[0]?.pieces).toEqual([
      { name: 'bon.pdf', fate: 'read' },
      { name: 'faux.pdf', fate: 'failed', reason: 'ce fichier n’est pas un PDF' },
    ])
    // Le lancement n'est JAMAIS bloqué : une pièce cassée laisse l'archive « envoyée » (acquis).
    expect(result.current.entries[0]?.phase).toBe('done')
  })

  it('#4294.1 — sait dire NON : un fichier simple ne porte aucune pièce', async () => {
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([new File(['a,b'], 'x.csv', { type: 'text/csv' })])
    })
    expect(result.current.entries[0]?.pieces).toBeUndefined()
  })

  it('une archive dont AUCUNE entrée n’est lue est en échec, avec la raison', async () => {
    ingestZip.mockResolvedValue({
      total: 1,
      outcomes: [{ status: 'failed', file: 'a.pdf', reason: 'scan sans texte' }],
    })
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([validZip('pack.zip')])
    })
    let ok = true
    await act(async () => {
      ok = await result.current.sendAll()
    })
    expect(ok).toBe(false)
    expect(result.current.entries[0]).toMatchObject({ phase: 'error', reason: 'a.pdf — scan sans texte' })
  })

  it('#3623.1a — un .zip illisible (extension seule) est refusé NOMMÉ à l’ajout, jamais envoyé', async () => {
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([file('pack.zip', 'PK')])
    })
    expect(result.current.entries).toHaveLength(0)
    expect(result.current.refusals).toEqual([{ name: 'pack.zip', reason: 'unreadable_archive' }])
    await act(async () => {
      await result.current.sendAll()
    })
    expect(ingestZip).not.toHaveBeenCalled()
  })

  it('#3623.1a — un .zip lisible mais vide (aucune entrée réelle) est refusé NOMMÉ à l’ajout', async () => {
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([validZip('vide.zip', {})])
    })
    expect(result.current.entries).toHaveLength(0)
    expect(result.current.refusals).toEqual([{ name: 'vide.zip', reason: 'unreadable_archive' }])
  })

  it('#3623.1a — un .zip lisible sans AUCUN format lu est refusé NOMMÉ à l’ajout', async () => {
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([validZip('photos.zip', { 'photo.png': 'binaire' })])
    })
    expect(result.current.entries).toHaveLength(0)
    expect(result.current.refusals).toEqual([{ name: 'photos.zip', reason: 'no_readable_entry' }])
  })

  it('un refus 4xx de l’API garde sa raison lisible ; le reste dit l’échec', async () => {
    ingest.mockRejectedValueOnce(new ApiError('carnet d’adresses refusé', 422)).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([file('a.csv'), file('b.csv', 'z')])
    })
    let ok = true
    await act(async () => {
      ok = await result.current.sendAll()
    })
    expect(ok).toBe(false)
    expect(result.current.entries.map(e => e.reason)).toEqual(['carnet d’adresses refusé', 'échec'])
  })

  it('rattache au compte les seuls documents NOUVEAUX — un doublon garde sa portée', async () => {
    ingest
      .mockResolvedValueOnce({ id: 'new', partial: false, duplicate: false })
      .mockResolvedValueOnce({ id: 'old', partial: false, duplicate: true })
    updateScope.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([file('a.csv'), file('b.csv', 'z')])
    })
    await act(async () => {
      await result.current.sendAll()
    })
    let bound = false
    await act(async () => {
      bound = await result.current.bindToAccount(SCOPE_ACCOUNT)
    })
    expect(bound).toBe(true)
    expect(updateScope).toHaveBeenCalledTimes(1)
    expect(updateScope).toHaveBeenCalledWith('new', 'account', { accountId: SCOPE_ACCOUNT })
    expect(result.current.entries.every(e => e.bound)).toBe(true)
  })

  it('un rattachement qui échoue le DIT et reste rejouable', async () => {
    ingest.mockResolvedValue({ id: 'd', partial: false, duplicate: false })
    updateScope.mockRejectedValueOnce(new Error('503'))
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([file('a.csv')])
    })
    await act(async () => {
      await result.current.sendAll()
    })
    let bound = true
    await act(async () => {
      bound = await result.current.bindToAccount(SCOPE_ACCOUNT)
    })
    expect(bound).toBe(false)
    expect(result.current.entries[0]).toMatchObject({ bound: false, reason: 'échec' })
  })

  it('refuse un format inconnu avec sa raison et ne l’envoie pas', async () => {
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([file('prog.exe')])
    })
    expect(result.current.entries).toHaveLength(0)
    expect(result.current.refusals).toEqual([{ name: 'prog.exe', reason: 'unsupported' }])
    await act(async () => {
      await result.current.sendAll()
    })
    expect(ingest).not.toHaveBeenCalled()
  })

  it('#3623 — les documents envoyés en `personal` sont listés pour le lancement, pas ceux posés au compte ni les retirés', async () => {
    ingest
      .mockResolvedValueOnce({ id: 'doc-a', partial: false, duplicate: false })
      .mockResolvedValueOnce({ id: 'doc-dup', partial: false, duplicate: true })
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([file('a.csv'), file('b.csv', 'z')])
    })
    await act(async () => {
      await result.current.sendAll()
    })
    // Un doublon garde sa portée : il n'est jamais rattaché (et jamais listé).
    expect(result.current.personalDocumentIds()).toEqual(['doc-a'])
    act(() => result.current.remove(result.current.entries[0]!.key))
    expect(result.current.personalDocumentIds()).toEqual([])
  })

  it('#3623 — envoyé directement au compte, rien n’est listé', async () => {
    ingest.mockResolvedValue({ id: 'doc-x', partial: false, duplicate: false })
    const { result } = renderHook(() => useAnalysisAttachments(labels))
    await act(async () => {
      await result.current.addFiles([file('a.csv')])
    })
    await act(async () => {
      await result.current.sendAll({ accountId: SCOPE_ACCOUNT })
    })
    expect(result.current.personalDocumentIds()).toEqual([])
  })
})
