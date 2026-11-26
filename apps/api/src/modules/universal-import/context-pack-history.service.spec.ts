import { ContextPackHistoryService } from './context-pack-history.service'

// #4422.1 — chaque import de l'assistant (hors comptes, déjà un job universel) écrit sa ligne d'historique.
function build(cvJobs: Record<string, unknown>[] = [], originals?: Record<string, jest.Mock>) {
  const rows: Record<string, unknown>[] = []
  const repo = {
    create: jest.fn((value: Record<string, unknown>) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      const row = {
        id: `00000000-0000-4000-8000-00000000000${rows.length + 1}`,
        created_at: new Date('2026-10-22T09:00:00Z'),
        ...value,
      }
      rows.push(row)
      return row
    }),
    find: jest.fn(async () => [...rows].reverse()),
  }
  const cvRepo = { find: jest.fn(async () => cvJobs) }
  return {
    service: new ContextPackHistoryService(repo as never, cvRepo as never, originals as never),
    repo,
    rows,
    cvRepo,
  }
}

describe('ContextPackHistoryService (#4422.1)', () => {
  it('écrit la ligne avec le bilan tel que l’importeur l’a rendu, dans l’espace et au nom de l’appelant', async () => {
    const { service, rows } = build()
    await service.record('ws-1', 'u-1', {
      fileName: 'Campagnes.xlsx',
      destination: 'sequences',
      status: 'done',
      imported: 9,
      skipped: 1,
      scripts: 54,
      message: null,
    })
    expect(rows[0]).toMatchObject({
      workspace_id: 'ws-1',
      user_id: 'u-1',
      file_name: 'Campagnes.xlsx',
      destination: 'sequences',
      status: 'done',
      imported: 9,
      skipped: 1,
      scripts: 54,
    })
  })

  it('un échec s’enregistre aussi, avec son message — jamais un import muet', async () => {
    const { service, rows } = build()
    await service.record('ws-1', 'u-1', {
      fileName: 'Postes.xlsx',
      destination: 'target_personas',
      status: 'failed',
      imported: null,
      skipped: 0,
      scripts: null,
      message: 'colonnes obligatoires introuvables',
    })
    expect(rows[0]).toMatchObject({ status: 'failed', imported: null, message: 'colonnes obligatoires introuvables' })
  })

  it('la lecture rend les lignes de l’espace, datées, sans inventer de volume', async () => {
    const { service, repo } = build()
    await service.record('ws-1', 'u-1', {
      fileName: 'Grille.xlsx',
      destination: 'qualification_grid',
      status: 'done',
      imported: 9,
      skipped: 0,
      scripts: null,
      message: null,
    })
    const items = await service.list('ws-1')
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws-1' } }))
    expect(items[0]).toMatchObject({
      fileName: 'Grille.xlsx',
      destination: 'qualification_grid',
      imported: 9,
      scripts: null,
      createdAt: '2026-10-22T09:00:00.000Z',
    })
  })
})

// #AM.11 (#4290.6) — l'historique est multi-lots : les lots de CV y figurent avec leur bilan par famille.
describe('ContextPackHistoryService.list — #AM.11 lots de CV et documents', () => {
  const job = (extra: Record<string, unknown>) => ({
    id: '00000000-0000-4000-8000-0000000000c1',
    workspace_id: 'ws-1',
    kind: 'zip',
    status: 'done',
    total: 5,
    outcomes: [
      { status: 'created', file: 'ana.pdf', consultantId: 'c1' },
      { status: 'created', file: 'bob.pdf', consultantId: 'c2' },
      { status: 'auto_updated', file: 'cy.pdf', consultantId: 'c3' },
      { status: 'exception', file: 'dan.pdf' },
      { status: 'ignored', file: 'notes.csv', reason: 'Ce n’est pas un CV' },
    ],
    error: null,
    created_at: new Date('2026-10-23T08:00:00Z'),
    ...extra,
  })

  it('un lot de CV terminé porte son bilan par famille (créés, complétés, à rapprocher) ; les ignorés ne comptent pas', async () => {
    const { service, cvRepo } = build([job({})])
    const items = await service.list('ws-1')
    expect(cvRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws-1' } }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      destination: 'cv',
      status: 'done',
      fileName: 'ana.pdf',
      imported: 3,
      skipped: 1,
      createdAt: '2026-10-23T08:00:00.000Z',
      breakdown: { cv: { created: 2, matched: 1, duplicates: 0, rejected: 0, toReconcile: 1 } },
    })
  })

  it('NON : un lot encore en cours ne fait aucune ligne ; un lot en échec est dit en échec', async () => {
    const { service } = build([
      job({ status: 'processing' }),
      job({ id: '00000000-0000-4000-8000-0000000000c2', status: 'failed', error: 'boom' }),
    ])
    const items = await service.list('ws-1')
    expect(items.map(i => i.status)).toEqual(['failed'])
    expect(items[0]?.message).toBe('boom')
  })

  it('un import de documents (connaissances) porte son bilan « documents » ; une séquence n’en porte pas', async () => {
    const { service, rows } = build()
    await service.record('ws-1', 'u', {
      fileName: 'a.pdf',
      destination: 'knowledge',
      status: 'done',
      imported: 2,
      skipped: 1,
      scripts: null,
      message: null,
    })
    await service.record('ws-1', 'u', {
      fileName: 'b.xlsx',
      destination: 'sequences',
      status: 'done',
      imported: 2,
      skipped: 0,
      scripts: 3,
      message: null,
    })
    expect(rows).toHaveLength(2)
    const items = await service.list('ws-1')
    const byName = Object.fromEntries(items.map(i => [i.fileName, i]))
    expect(byName['a.pdf']?.breakdown).toEqual({
      document: { created: 2, matched: 0, duplicates: 0, rejected: 1, toReconcile: 0 },
    })
    expect(byName['b.xlsx']?.breakdown).toBeUndefined()
  })
})

// #4573 — l'original est rangé AU DÉPÔT, sous l'id de la ligne qui le désigne ; l'historique dit son état.
describe('ContextPackHistoryService — l’original du dépôt (#4573)', () => {
  const body = {
    fileName: 'Playbook.pdf',
    destination: 'knowledge' as const,
    status: 'done' as const,
    imported: 1,
    skipped: 0,
    scripts: null,
    message: null,
    fileB64: Buffer.from('%PDF').toString('base64'),
  }

  it('range l’original sous l’id de la ligne, puis écrit la ligne avec son chemin — jamais les octets', async () => {
    const keep = jest.fn(async (_ws: string, id: string) => ({
      original_status: 'kept',
      original_storage_path: `ws-1/context-pack/${id}/Playbook.pdf`,
      original_mime_type: 'application/pdf',
      original_size_bytes: 4,
    }))
    const { service, rows } = build([], { keep, discard: jest.fn() })
    await service.record('ws-1', 'u-1', body)
    const id = keep.mock.calls[0]?.[1] as string
    expect(keep).toHaveBeenCalledWith('ws-1', id, expect.objectContaining({ fileName: 'Playbook.pdf', status: 'done' }))
    expect(rows[0]).toMatchObject({
      id,
      original_status: 'kept',
      original_storage_path: `ws-1/context-pack/${id}/Playbook.pdf`,
    })
    expect(rows[0]).not.toHaveProperty('fileB64')
  })

  it('une ligne qui ne s’écrit pas emporte son original : aucun objet orphelin', async () => {
    const discard = jest.fn()
    const keep = jest.fn(async () => ({
      original_status: 'kept',
      original_storage_path: 'ws-1/context-pack/x/Playbook.pdf',
      original_mime_type: 'application/pdf',
      original_size_bytes: 4,
    }))
    const { service, repo } = build([], { keep, discard })
    repo.save.mockRejectedValueOnce(new Error('db down'))
    await expect(service.record('ws-1', 'u-1', body)).rejects.toThrow('db down')
    expect(discard).toHaveBeenCalledWith('ws-1/context-pack/x/Playbook.pdf')
  })

  it('l’historique dit l’état de l’original ; une ligne d’avant #4573 dit « antérieur », un lot de CV rien', async () => {
    const { service, rows } = build([
      {
        id: '00000000-0000-4000-8000-0000000000c1',
        workspace_id: 'ws-1',
        kind: 'zip',
        status: 'done',
        outcomes: [],
        error: null,
        created_at: new Date('2026-10-20T08:00:00Z'),
      },
    ])
    rows.push(
      {
        id: 'a',
        file_name: 'old.pdf',
        destination: 'knowledge',
        status: 'done',
        imported: 1,
        skipped: 0,
        original_status: null,
        created_at: new Date('2026-10-21T09:00:00Z'),
      },
      {
        id: 'b',
        file_name: 'new.pdf',
        destination: 'knowledge',
        status: 'done',
        imported: 1,
        skipped: 0,
        original_status: 'kept',
        original_storage_path: 'secret/path',
        created_at: new Date('2026-10-26T09:00:00Z'),
      },
    )
    const items = await service.list('ws-1')
    const byName = Object.fromEntries(items.map(i => [i.fileName, i]))
    expect(byName['old.pdf']?.original).toBe('earlier')
    expect(byName['new.pdf']?.original).toBe('kept')
    expect(items.find(i => i.destination === 'cv')).not.toHaveProperty('original')
    // Le chemin du seau ne sort jamais vers le navigateur.
    expect(JSON.stringify(items)).not.toContain('secret/path')
  })
})
