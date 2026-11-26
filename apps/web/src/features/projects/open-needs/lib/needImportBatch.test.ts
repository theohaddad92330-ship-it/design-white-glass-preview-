import { describe, expect, it, vi } from 'vitest'
import type { NeedImportRow } from '../model/need-import'
import { runNeedImportCreation, runNeedImportExtraction } from './needImportBatch'

function file(name: string, sizeBytes = 100): File {
  return new File(['x'.repeat(sizeBytes)], name, { type: 'application/pdf' })
}

describe('runNeedImportExtraction — règle 1 : un échec n’arrête pas les autres', () => {
  it('extrait 3 fichiers → 3 lignes, dans l’ordre des fichiers déposés', async () => {
    const extractOne = vi.fn(async (f: File) => ({
      status: 'extracted' as const,
      file: f.name,
      title: f.name,
      skills: [],
      rfpId: `rfp-${f.name}`,
      duplicateOf: null,
    }))
    const rows = await runNeedImportExtraction([file('a.pdf'), file('b.pdf'), file('c.pdf')], extractOne)
    expect(rows.map(r => r.file)).toEqual(['a.pdf', 'b.pdf', 'c.pdf'])
    expect(extractOne).toHaveBeenCalledTimes(3)
  })

  it('un échec AU MILIEU est NOMMÉ, les deux autres restent extraits', async () => {
    const extractOne = vi.fn(async (f: File): Promise<NeedImportRow> => {
      if (f.name === 'b.pdf') return { status: 'failed', file: f.name, reason: 'Je n’ai pas pu lire ce document.' }
      return { status: 'extracted', file: f.name, title: f.name, skills: [], rfpId: `rfp-${f.name}`, duplicateOf: null }
    })
    const rows = await runNeedImportExtraction([file('a.pdf'), file('b.pdf'), file('c.pdf')], extractOne)
    expect(rows[0]?.status).toBe('extracted')
    expect(rows[1]).toEqual({ status: 'failed', file: 'b.pdf', reason: 'Je n’ai pas pu lire ce document.' })
    expect(rows[2]?.status).toBe('extracted')
  })

  it('borne la concurrence — jamais plus de N extractions en vol à la fois', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const extractOne = vi.fn(async (f: File): Promise<NeedImportRow> => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 5))
      inFlight -= 1
      return { status: 'extracted', file: f.name, title: f.name, skills: [], rfpId: 'rfp-1', duplicateOf: null }
    })
    await runNeedImportExtraction([file('a.pdf'), file('b.pdf'), file('c.pdf'), file('d.pdf')], extractOne, 2)
    expect(maxInFlight).toBeLessThanOrEqual(2)
  })
})

describe('runNeedImportCreation — même discipline, côté écriture', () => {
  const row: Extract<NeedImportRow, { status: 'extracted' }> = {
    status: 'extracted',
    file: 'a.pdf',
    title: 'Architecte cloud',
    skills: [],
    rfpId: 'rfp-1',
    duplicateOf: null,
  }
  const rowB = { ...row, file: 'b.pdf', title: 'Développeur PHP' }

  it('crée les deux, dans l’ordre', async () => {
    const createOne = vi.fn(async (r: typeof row) => ({
      file: r.file,
      status: 'created' as const,
      need: { id: `n-${r.file}` } as never,
    }))
    const outcomes = await runNeedImportCreation([row, rowB], createOne)
    expect(outcomes.map(o => o.file)).toEqual(['a.pdf', 'b.pdf'])
    expect(outcomes.every(o => o.status === 'created')).toBe(true)
  })

  it('un échec de création est NOMMÉ, l’autre reste créé', async () => {
    const createOne = vi.fn(async (r: typeof row) => {
      if (r.file === 'b.pdf') return { file: r.file, status: 'failed' as const, reason: 'Le compte est introuvable.' }
      return { file: r.file, status: 'created' as const, need: { id: 'n-1' } as never }
    })
    const outcomes = await runNeedImportCreation([row, rowB], createOne)
    expect(outcomes[0]).toEqual({ file: 'a.pdf', status: 'created', need: { id: 'n-1' } })
    expect(outcomes[1]).toEqual({ file: 'b.pdf', status: 'failed', reason: 'Le compte est introuvable.' })
  })
})
