import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { CONTEXT_PACK_ORIGINAL_MAX_BYTES, CONTEXT_PACK_ORIGINAL_URL_TTL_SECONDS } from '@bellum/contracts'
import { ContextPackOriginalsService } from './context-pack-originals.service'

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '99999999-9999-4999-8999-999999999999'
const IMPORT_A = '22222222-2222-4222-8222-222222222222'
const IMPORT_B = '33333333-3333-4333-8333-333333333333'

type Row = {
  id: string
  workspace_id: string
  file_name: string
  original_status: string | null
  original_storage_path: string | null
  original_mime_type: string | null
}

/** Un double du seau : ce qui y est rangé, ce qui en sort. Aucune requête réseau. */
function fakeStorage() {
  const objects = new Map<string, Buffer>()
  return {
    objects,
    put: jest.fn(async (path: string, bytes: Buffer) => void objects.set(path, bytes)),
    remove: jest.fn(async (paths: string[]) => {
      for (const path of paths) objects.delete(path)
      return true
    }),
    signedUrl: jest.fn(async (path: string, ttl: number) => `https://store.test/sign/${path}?ttl=${ttl}`),
  }
}

/** Un double du dépôt TypeORM qui APPLIQUE le `where` reçu — un filtre oublié se voit. */
function fakeRepo(rows: Row[]) {
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key as keyof Row] === value)
  return {
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) => rows.find(row => matches(row, where)) ?? null,
    ),
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter(row => matches(row, where))),
    update: jest.fn(async (where: Record<string, unknown>, patch: Partial<Row>) => {
      const ids = where['id'] as { value?: unknown } | string | undefined
      for (const row of rows) {
        const listed = typeof ids === 'object' && Array.isArray(ids.value) ? (ids.value as string[]) : null
        const idOk = typeof ids === 'string' ? row.id === ids : listed ? listed.includes(row.id) : false
        if (idOk && row.workspace_id === where['workspace_id']) Object.assign(row, patch)
      }
    }),
  }
}

const pdf = Buffer.from('%PDF-1.7 playbook')

describe('ContextPackOriginalsService — conservation au dépôt (#4573)', () => {
  it('range l’original dans le seau PRIVÉ sous l’espace puis l’import, au moment du dépôt', async () => {
    const storage = fakeStorage()
    const service = new ContextPackOriginalsService(fakeRepo([]) as never, storage as never)
    const kept = await service.keep(WS_A, IMPORT_A, {
      fileName: 'Playbook.pdf',
      status: 'done',
      fileB64: pdf.toString('base64'),
    })
    expect(kept).toEqual({
      original_status: 'kept',
      original_storage_path: `${WS_A}/context-pack/${IMPORT_A}/Playbook.pdf`,
      original_mime_type: 'application/pdf',
      original_size_bytes: pdf.byteLength,
    })
    expect(storage.objects.get(`${WS_A}/context-pack/${IMPORT_A}/Playbook.pdf`)?.equals(pdf)).toBe(true)
  })

  it('sans stockage branché : zéro appel, et la ligne DIT que l’original n’est pas conservé', async () => {
    const service = new ContextPackOriginalsService(fakeRepo([]) as never)
    const kept = await service.keep(WS_A, IMPORT_A, {
      fileName: 'a.pdf',
      status: 'done',
      fileB64: pdf.toString('base64'),
    })
    expect(kept.original_status).toBe('unavailable')
    expect(kept.original_storage_path).toBeNull()
  })

  it('un stockage qui refuse ne fait pas échouer l’import : « non conservé », jamais un faux chemin', async () => {
    const storage = fakeStorage()
    storage.put.mockRejectedValueOnce(new ServiceUnavailableException('refus'))
    const service = new ContextPackOriginalsService(fakeRepo([]) as never, storage as never)
    const kept = await service.keep(WS_A, IMPORT_A, {
      fileName: 'a.pdf',
      status: 'done',
      fileB64: pdf.toString('base64'),
    })
    expect(kept).toMatchObject({ original_status: 'unavailable', original_storage_path: null })
  })

  it('un import échoué ne garde rien (l’original suit sa donnée) ; trop gros : il le dit', async () => {
    const storage = fakeStorage()
    const service = new ContextPackOriginalsService(fakeRepo([]) as never, storage as never)
    const failed = await service.keep(WS_A, IMPORT_A, {
      fileName: 'a.pdf',
      status: 'failed',
      fileB64: pdf.toString('base64'),
    })
    expect(failed.original_status).toBe('failed_import')
    const big = await service.keep(WS_A, IMPORT_A, { fileName: 'a.pdf', status: 'done', originalTooBig: true })
    expect(big.original_status).toBe('too_big')
    const overCap = Buffer.alloc(CONTEXT_PACK_ORIGINAL_MAX_BYTES + 1)
    const forged = await service.keep(WS_A, IMPORT_A, {
      fileName: 'a.pdf',
      status: 'done',
      fileB64: overCap.toString('base64'),
    })
    expect(forged.original_status).toBe('too_big')
    expect(storage.put).not.toHaveBeenCalled()
  })

  it('un dépôt sans original transmis reste SANS statut — rien n’est inventé', async () => {
    const service = new ContextPackOriginalsService(fakeRepo([]) as never, fakeStorage() as never)
    const kept = await service.keep(WS_A, IMPORT_A, { fileName: 'a.pdf', status: 'done' })
    expect(kept.original_status).toBeNull()
  })
})

describe('ContextPackOriginalsService — aperçu par URL signée et REFUS inter-espaces (#4573)', () => {
  const rows = (): Row[] => [
    {
      id: IMPORT_A,
      workspace_id: WS_A,
      file_name: 'Playbook A.pdf',
      original_status: 'kept',
      original_storage_path: `${WS_A}/context-pack/${IMPORT_A}/Playbook_A.pdf`,
      original_mime_type: 'application/pdf',
    },
    {
      id: IMPORT_B,
      workspace_id: WS_B,
      file_name: 'Secret B.pdf',
      original_status: 'kept',
      original_storage_path: `${WS_B}/context-pack/${IMPORT_B}/Secret_B.pdf`,
      original_mime_type: 'application/pdf',
    },
  ]

  it('signe une URL courte (durée des CV) pour l’original d’un import de SON espace', async () => {
    const storage = fakeStorage()
    const service = new ContextPackOriginalsService(fakeRepo(rows()) as never, storage as never)
    const out = await service.signedUrl(WS_A, IMPORT_A)
    expect(storage.signedUrl).toHaveBeenCalledWith(
      `${WS_A}/context-pack/${IMPORT_A}/Playbook_A.pdf`,
      CONTEXT_PACK_ORIGINAL_URL_TTL_SECONDS,
    )
    expect(out).toMatchObject({ mimeType: 'application/pdf', fileName: 'Playbook A.pdf' })
  })

  it('REFUS (a) — l’URL signée d’un import d’un AUTRE espace est refusée, rien n’est signé', async () => {
    const storage = fakeStorage()
    const repo = fakeRepo(rows())
    const service = new ContextPackOriginalsService(repo as never, storage as never)
    await expect(service.signedUrl(WS_A, IMPORT_B)).rejects.toBeInstanceOf(NotFoundException)
    expect(storage.signedUrl).not.toHaveBeenCalled()
    // Le filtre d'espace est posé AU PLUS PRÈS de la donnée : jamais `where { id }` seul.
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: IMPORT_B, workspace_id: WS_A } })
  })

  it('REFUS (b) — changer l’id ne rend jamais le document d’autrui : même 404 qu’un id inexistant', async () => {
    const storage = fakeStorage()
    const service = new ContextPackOriginalsService(fakeRepo(rows()) as never, storage as never)
    const foreign = await service.signedUrl(WS_A, IMPORT_B).catch((error: Error) => error.message)
    const missing = await service
      .signedUrl(WS_A, '44444444-4444-4444-8444-444444444444')
      .catch((error: Error) => error.message)
    expect(foreign).toBe(missing)
    for (const call of storage.signedUrl.mock.calls) expect(call[0]).not.toContain(WS_B)
  })

  it('un import antérieur (sans original) répond 404 « non conservé », sans signer', async () => {
    const storage = fakeStorage()
    const earlier = { ...rows()[0]!, original_status: null, original_storage_path: null }
    const service = new ContextPackOriginalsService(fakeRepo([earlier]) as never, storage as never)
    await expect(service.signedUrl(WS_A, IMPORT_A)).rejects.toThrow('Original non conservé')
    expect(storage.signedUrl).not.toHaveBeenCalled()
  })
})

describe('ContextPackOriginalsService — effacement RGPD (c67, #2297)', () => {
  it('l’OBJET du seau disparaît, pas seulement la ligne : la ligne reste et dit « effacé »', async () => {
    const storage = fakeStorage()
    const a = `${WS_A}/context-pack/${IMPORT_A}/Playbook_A.pdf`
    const b = `${WS_B}/context-pack/${IMPORT_B}/Secret_B.pdf`
    storage.objects.set(a, pdf)
    storage.objects.set(b, pdf)
    const data: Row[] = [
      {
        id: IMPORT_A,
        workspace_id: WS_A,
        file_name: 'A.pdf',
        original_status: 'kept',
        original_storage_path: a,
        original_mime_type: 'application/pdf',
      },
      {
        id: IMPORT_B,
        workspace_id: WS_B,
        file_name: 'B.pdf',
        original_status: 'kept',
        original_storage_path: b,
        original_mime_type: 'application/pdf',
      },
    ]
    const service = new ContextPackOriginalsService(fakeRepo(data) as never, storage as never)
    const out = await service.eraseWorkspaceOriginals(WS_A)
    expect(out).toEqual({ erased: 1, deferred: 0 })
    expect(storage.objects.has(a)).toBe(false)
    expect(data[0]).toMatchObject({ original_status: 'erased', original_storage_path: null })
    // L'autre espace n'est jamais touché.
    expect(storage.objects.has(b)).toBe(true)
    expect(data[1]?.original_status).toBe('kept')
  })

  it('un effacement refusé par le seau GARDE le chemin : le prochain effacement le retrouvera', async () => {
    const storage = fakeStorage()
    storage.remove.mockResolvedValueOnce(false)
    const path = `${WS_A}/context-pack/${IMPORT_A}/A.pdf`
    const data: Row[] = [
      {
        id: IMPORT_A,
        workspace_id: WS_A,
        file_name: 'A.pdf',
        original_status: 'kept',
        original_storage_path: path,
        original_mime_type: null,
      },
    ]
    const service = new ContextPackOriginalsService(fakeRepo(data) as never, storage as never)
    expect(await service.eraseWorkspaceOriginals(WS_A)).toEqual({ erased: 0, deferred: 1 })
    expect(data[0]).toMatchObject({ original_status: 'kept', original_storage_path: path })
  })
})
