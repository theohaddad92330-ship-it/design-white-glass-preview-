import { InternalKnowledgeSyncService, type EmbeddingProgress } from './internal-knowledge-sync.service'
import type {
  DriveChangesPage,
  DriveFileMeta,
  DriveSource,
  KnowledgeFileRow,
  KnowledgeStore,
  KnowledgeSyncState,
} from './internal-knowledge.types'

const FOLDER = 'application/vnd.google-apps.folder'
const DOC = 'application/vnd.google-apps.document'
const ROOT = 'root1'

const SA = JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: 'PEM' })
const ENV = { INTERNAL_KNOWLEDGE_DRIVE_SA_JSON: SA, INTERNAL_KNOWLEDGE_DRIVE_FOLDER_IDS: ROOT }

function file(id: string, name: string, parents: string[], over: Partial<DriveFileMeta> = {}): DriveFileMeta {
  return { id, name, mimeType: DOC, modifiedTime: '2026-10-04T08:00:00.000Z', parents, trashed: false, ...over }
}

class FakeStore implements KnowledgeStore {
  state: KnowledgeSyncState = {
    pageToken: null,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    lastReconciledAt: null,
  }
  files = new Map<string, KnowledgeFileRow>()
  /** chunks vivants par fichier ; `archived` = ce qui a été archivé (jamais supprimé). */
  live = new Map<string, string[]>()
  archived: Array<{ fileId: string; chunks: string[] }> = []
  async getState() {
    return { ...this.state }
  }
  async saveState(p: Partial<KnowledgeSyncState>) {
    this.state = { ...this.state, ...p }
  }
  async getFile(id: string) {
    return this.files.get(id) ?? null
  }
  async upsertFile(row: KnowledgeFileRow) {
    this.files.set(row.fileId, row)
  }
  async listFiles() {
    return [...this.files.values()]
  }
  async replaceChunks(f: { fileId: string }, chunks: string[]) {
    const old = this.live.get(f.fileId)
    if (old) this.archived.push({ fileId: f.fileId, chunks: old })
    this.live.set(f.fileId, chunks)
    return chunks.length
  }
  async archiveChunks(fileId: string) {
    const old = this.live.get(fileId)
    if (old) this.archived.push({ fileId, chunks: old })
    this.live.delete(fileId)
  }
}

class FakeDrive implements DriveSource {
  metas = new Map<string, DriveFileMeta>()
  texts = new Map<string, string>()
  pages: DriveChangesPage[] = []
  calls: string[] = []
  fetchFails = new Set<string>()
  add(m: DriveFileMeta, text?: string) {
    this.metas.set(m.id, m)
    if (text !== undefined) this.texts.set(m.id, text)
  }
  async startPageToken() {
    this.calls.push('startPageToken')
    return 'tok-0'
  }
  async listChildren(folderId: string) {
    this.calls.push(`list:${folderId}`)
    return [...this.metas.values()].filter(m => m.parents.includes(folderId) && !m.trashed)
  }
  async getFile(id: string) {
    this.calls.push(`get:${id}`)
    return this.metas.get(id) ?? null
  }
  async listChanges(token: string) {
    this.calls.push(`changes:${token}`)
    return this.pages.shift() ?? { changes: [], newStartPageToken: token }
  }
  async fetchText(f: DriveFileMeta) {
    this.calls.push(`fetch:${f.id}`)
    if (this.fetchFails.has(f.id)) throw new Error('export failed')
    return this.texts.get(f.id) ?? ''
  }
}

function setup(kickImpl: () => Promise<EmbeddingProgress | void> = async () => undefined) {
  const store = new FakeStore()
  const drive = new FakeDrive()
  const kick = jest.fn(kickImpl)
  const service = new InternalKnowledgeSyncService(store, { create: () => drive }, { kick })
  drive.add(file(ROOT, 'Partagé', ['parent-x'], { mimeType: FOLDER }))
  return { store, drive, kick, service }
}

describe('InternalKnowledgeSyncService (#3586)', () => {
  it('sans clé : disabled, ZÉRO appel Drive, rien en base (no-op strict)', async () => {
    const { store, drive, service } = setup()
    const report = await service.sync({})
    expect(report).toEqual({ status: 'disabled' })
    expect(drive.calls).toEqual([])
    expect(store.state.lastRunAt).toBeNull()
  })

  it('premier passage : parcours complet récursif, jeton posé AVANT le parcours, chunks masqués', async () => {
    const { store, drive, kick, service } = setup()
    drive.add(file('f1', 'CERVEAU', [ROOT]), 'Contact jean@x.fr au 06 12 34 56 78.\n\nSuite.')
    drive.add(file('sub', 'Métiers', [ROOT], { mimeType: FOLDER }))
    drive.add(file('f2', 'Workflows', ['sub']), 'Texte des workflows.')
    drive.add(file('img', 'schema.png', [ROOT], { mimeType: 'image/png' }))

    const report = await service.sync(ENV)

    expect(report).toMatchObject({ status: 'ok', mode: 'full', indexed: 2, ignored: 1, errors: 0 })
    expect(drive.calls.indexOf('startPageToken')).toBeLessThan(drive.calls.indexOf(`list:${ROOT}`))
    expect(store.state.pageToken).toBe('tok-0')
    expect(store.live.get('f1')).toEqual(['Contact [email] au [téléphone].\n\nSuite.'])
    expect(store.files.get('f2')?.path).toBe('Partagé / Métiers / Workflows')
    expect(store.files.get('img')?.status).toBe('ignored')
    expect(drive.calls).not.toContain('fetch:img')
    expect(kick).toHaveBeenCalledTimes(1)
  })

  it('INTERNAL_KNOWLEDGE_KEEP_CONTACTS=true : coordonnées conservées', async () => {
    const { store, drive, service } = setup()
    drive.add(file('f1', 'CRM', [ROOT]), 'jean@x.fr')
    await service.sync({ ...ENV, INTERNAL_KNOWLEDGE_KEEP_CONTACTS: 'true' })
    expect(store.live.get('f1')).toEqual(['jean@x.fr'])
  })

  it('un fichier en échec est compté en erreur, sans faire tomber le passage', async () => {
    const { store, drive, service } = setup()
    drive.add(file('ok', 'Bon', [ROOT]), 'texte')
    drive.add(file('ko', 'Mauvais', [ROOT]), 'x')
    drive.fetchFails.add('ko')
    const report = await service.sync(ENV)
    expect(report).toMatchObject({ status: 'ok', indexed: 1, errors: 1 })
    expect(store.files.get('ko')).toMatchObject({ status: 'error', errorMessage: 'export failed' })
  })

  it('passage suivant : changes.list, un fichier modifié archive ses anciens chunks et insère les neufs', async () => {
    const { store, drive, service } = setup()
    drive.add(file('f1', 'CERVEAU', [ROOT]), 'v1')
    await service.sync(ENV)

    drive.add(file('f1', 'CERVEAU', [ROOT], { modifiedTime: '2026-10-04T09:00:00.000Z' }), 'v2')
    drive.pages = [
      {
        changes: [{ fileId: 'f1', removed: false, file: drive.metas.get('f1') }],
        newStartPageToken: 'tok-1',
      },
    ]
    const report = await service.sync(ENV)

    expect(report).toMatchObject({ status: 'ok', mode: 'incremental', indexed: 1 })
    expect(drive.calls).toContain('changes:tok-0')
    expect(store.archived).toEqual([{ fileId: 'f1', chunks: ['v1'] }])
    expect(store.live.get('f1')).toEqual(['v2'])
    expect(store.state.pageToken).toBe('tok-1')
  })

  it('idempotent : même fileId + même modifiedTime ⇒ rien de ré-exporté ni de ré-inséré', async () => {
    const { store, drive, service } = setup()
    drive.add(file('f1', 'CERVEAU', [ROOT]), 'v1')
    await service.sync(ENV)
    drive.calls.length = 0
    drive.pages = [
      { changes: [{ fileId: 'f1', removed: false, file: drive.metas.get('f1') }], newStartPageToken: 'tok-1' },
    ]
    await service.sync(ENV)
    expect(drive.calls).not.toContain('fetch:f1')
    expect(store.archived).toEqual([])
  })

  it('supprimé, corbeille ou sorti du dossier ⇒ chunks ARCHIVÉS, jamais supprimés', async () => {
    const { store, drive, service } = setup()
    drive.add(file('del', 'Supprimé', [ROOT]), 'a')
    drive.add(file('trash', 'Corbeille', [ROOT]), 'b')
    drive.add(file('moved', 'Déplacé', [ROOT]), 'c')
    await service.sync(ENV)

    drive.add(file('trash', 'Corbeille', [ROOT], { trashed: true }))
    drive.add(file('moved', 'Déplacé', ['dossier-prive']))
    drive.add(file('dossier-prive', 'Interne', ['autre'], { mimeType: FOLDER }))
    drive.pages = [
      {
        changes: [
          { fileId: 'del', removed: true },
          { fileId: 'trash', removed: false, file: drive.metas.get('trash') },
          { fileId: 'moved', removed: false, file: drive.metas.get('moved') },
        ],
        newStartPageToken: 'tok-1',
      },
    ]
    const report = await service.sync(ENV)

    expect(report).toMatchObject({ status: 'ok', archived: 3 })
    expect(store.archived.map(a => a.fileId).sort()).toEqual(['del', 'moved', 'trash'])
    for (const id of ['del', 'trash', 'moved']) expect(store.files.get(id)?.status).toBe('archived')
  })

  it("un fichier hors des dossiers listés n'est JAMAIS lu (portée = descendance)", async () => {
    const { store, drive, service } = setup()
    await service.sync(ENV)
    drive.add(file('dossier-interne', '02 INTERNE', ['team'], { mimeType: FOLDER }))
    drive.add(file('secret', 'Secret', ['dossier-interne']), 'confidentiel')
    drive.add(file('team', 'Team', [], { mimeType: FOLDER }))
    drive.calls.length = 0
    drive.pages = [
      { changes: [{ fileId: 'secret', removed: false, file: drive.metas.get('secret') }], newStartPageToken: 'tok-1' },
    ]
    await service.sync(ENV)
    expect(drive.calls).not.toContain('fetch:secret')
    expect(store.files.has('secret')).toBe(false)
  })

  it('un fichier neuf dans un sous-dossier est rattaché au dossier listé par ses parents', async () => {
    const { store, drive, service } = setup()
    drive.add(file('sub', 'Métiers', [ROOT], { mimeType: FOLDER }))
    await service.sync(ENV)
    drive.add(file('n', 'Neuf', ['sub']), 'contenu')
    drive.pages = [
      { changes: [{ fileId: 'n', removed: false, file: drive.metas.get('n') }], newStartPageToken: 'tok-1' },
    ]
    await service.sync(ENV)
    expect(store.files.get('n')).toMatchObject({ status: 'indexed', path: 'Partagé / Métiers / Neuf' })
  })

  it('un texte vide est compté en erreur nommée, pas indexé', async () => {
    const { store, drive, service } = setup()
    drive.add(file('v', 'Vide', [ROOT]), '   ')
    await service.sync(ENV)
    expect(store.files.get('v')).toMatchObject({ status: 'error' })
    expect(store.live.has('v')).toBe(false)
  })

  it("une panne Drive consigne l'erreur sans toucher au jeton", async () => {
    const { store, drive, service } = setup()
    store.state.pageToken = 'tok-0'
    drive.listChanges = async () => {
      throw new Error('503')
    }
    const report = await service.sync(ENV)
    expect(report).toEqual({ status: 'error', message: '503' })
    expect(store.state).toMatchObject({ pageToken: 'tok-0', lastStatus: 'error', lastError: '503' })
  })

  // #3586 limite 1 — sortie de portée.
  it('un DOSSIER déplacé hors de la portée archive ses descendants connus (aucun changement émis pour eux)', async () => {
    const { store, drive, service } = setup()
    drive.add(file('sub', 'Métiers', [ROOT], { mimeType: FOLDER }))
    drive.add(file('deep', 'Profond', ['sub'], { mimeType: FOLDER }))
    drive.add(file('f1', 'Workflows', ['sub']), 'a')
    drive.add(file('f2', 'Tarifs', ['deep']), 'b')
    drive.add(file('keep', 'Reste', [ROOT]), 'c')
    await service.sync(ENV)

    drive.add(file('sub', 'Métiers', ['dossier-prive'], { mimeType: FOLDER }))
    drive.add(file('dossier-prive', 'Interne', ['autre'], { mimeType: FOLDER }))
    drive.pages = [
      { changes: [{ fileId: 'sub', removed: false, file: drive.metas.get('sub') }], newStartPageToken: 'tok-1' },
    ]
    const report = await service.sync(ENV)

    expect(report).toMatchObject({ status: 'ok', archived: 2 })
    expect(store.files.get('f1')?.status).toBe('archived')
    expect(store.files.get('f2')?.status).toBe('archived')
    expect(store.files.get('keep')?.status).toBe('indexed')
    expect(store.live.has('f1')).toBe(false)
  })

  it('réconciliation sans clé : disabled, ZÉRO appel Drive', async () => {
    const { drive, service } = setup()
    expect(await service.reconcile({})).toEqual({ status: 'disabled' })
    expect(drive.calls).toEqual([])
  })

  it('réconciliation : un fichier hors portée SANS changement émis est archivé, la date est posée, le jeton gardé', async () => {
    const { store, drive, service } = setup()
    drive.add(file('f1', 'Sorti', [ROOT]), 'a')
    drive.add(file('f2', 'Reste', [ROOT]), 'b')
    await service.sync(ENV)
    drive.add(file('f1', 'Sorti', ['ailleurs']))

    const report = await service.reconcile(ENV)

    expect(report).toMatchObject({ status: 'ok', mode: 'reconciliation', archived: 1 })
    expect(store.files.get('f1')?.status).toBe('archived')
    expect(store.files.get('f2')?.status).toBe('indexed')
    expect(store.archived.map(a => a.fileId)).toEqual(['f1'])
    expect(store.state.lastReconciledAt).toBeInstanceOf(Date)
    expect(store.state.pageToken).toBe('tok-0')
  })

  it('réconciliation : un fichier revenu dans la portée est RÉINDEXÉ, un fichier modifié sans changement émis aussi', async () => {
    const { store, drive, service } = setup()
    drive.add(file('back', 'Revenu', [ROOT]), 'v1')
    drive.add(file('mod', 'Modifié', [ROOT]), 'm1')
    await service.sync(ENV)
    drive.add(file('back', 'Revenu', ['ailleurs']))
    await service.reconcile(ENV)
    expect(store.files.get('back')?.status).toBe('archived')

    drive.add(file('back', 'Revenu', [ROOT]), 'v1')
    drive.add(file('mod', 'Modifié', [ROOT], { modifiedTime: '2026-10-05T08:00:00.000Z' }), 'm2')
    const report = await service.reconcile(ENV)

    expect(report).toMatchObject({ status: 'ok', mode: 'reconciliation', indexed: 2 })
    expect(store.files.get('back')?.status).toBe('indexed')
    expect(store.live.get('back')).toEqual(['v1'])
    expect(store.live.get('mod')).toEqual(['m2'])
  })

  it('réconciliation en panne Drive : erreur consignée, date de réconciliation intacte', async () => {
    const { store, drive, service } = setup()
    store.state.lastReconciledAt = new Date('2026-10-03T01:00:00Z')
    drive.listChildren = async () => {
      throw new Error('503')
    }
    expect(await service.reconcile(ENV)).toEqual({ status: 'error', message: '503' })
    expect(store.state.lastReconciledAt).toEqual(new Date('2026-10-03T01:00:00Z'))
  })
})

describe('reprise des fichiers ignorés / en erreur (#3586, formats élargis)', () => {
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const OLD = new Date('2026-10-01T00:00:00.000Z')

  function row(f: DriveFileMeta, status: KnowledgeFileRow['status'], syncedAt: Date): KnowledgeFileRow {
    return {
      fileId: f.id,
      name: f.name,
      mimeType: f.mimeType,
      path: `Partagé / ${f.name}`,
      modifiedTime: f.modifiedTime,
      status,
      errorMessage: status === 'error' ? 'invalid byte sequence' : null,
      chunkCount: 0,
      syncedAt,
    }
  }

  it('une image ignorée dit POURQUOI (raison nommée)', async () => {
    const { store, drive, service } = setup()
    drive.add(file('img', 'schema.png', [ROOT], { mimeType: 'image/png' }))
    await service.sync(ENV)
    expect(store.files.get('img')?.errorMessage).toMatch(/image/i)
    expect(store.files.get('img')?.status).toBe('ignored')
  })

  it('synchro incrémentale : un xlsx déjà « ignoré » (aucun changement Drive) est repris et indexé', async () => {
    const { store, drive, service } = setup()
    const x = file('x', 'tarifs.xlsx', [ROOT], { mimeType: XLSX })
    const img = file('img', 'a.png', [ROOT], { mimeType: 'image/png' })
    drive.add(x, 'Feuille : Tarifs\nDev | 550')
    drive.add(img)
    store.files.set('x', row(x, 'ignored', OLD))
    store.files.set('img', row(img, 'ignored', OLD))
    store.state.pageToken = 'tok-9'

    const report = await service.sync(ENV)

    expect(report).toMatchObject({ status: 'ok', mode: 'incremental', indexed: 1 })
    expect(store.files.get('x')?.status).toBe('indexed')
    expect(store.live.get('x')?.[0]).toContain('Dev | 550')
    expect(drive.calls).not.toContain('get:img')
    expect(drive.calls).not.toContain('fetch:img')
  })

  it('un fichier en erreur est retenté s’il date d’avant 6 h, pas avant', async () => {
    const { store, drive, service } = setup()
    const oldErr = file('e1', 'm.pdf', [ROOT], { mimeType: 'application/pdf' })
    const freshErr = file('e2', 'n.pdf', [ROOT], { mimeType: 'application/pdf' })
    drive.add(oldErr, 'Texte propre')
    drive.add(freshErr, 'Texte propre')
    store.files.set('e1', row(oldErr, 'error', OLD))
    store.files.set('e2', row(freshErr, 'error', new Date()))
    store.state.pageToken = 'tok-9'

    await service.sync(ENV)

    expect(store.files.get('e1')?.status).toBe('indexed')
    expect(store.files.get('e2')?.status).toBe('error')
    expect(drive.calls).not.toContain('fetch:e2')
  })

  it('réconciliation : un xlsx « ignoré » inchangé est repris', async () => {
    const { store, drive, service } = setup()
    const x = file('x', 'tarifs.xlsx', [ROOT], { mimeType: XLSX })
    drive.add(x, 'Feuille : A\nv')
    store.files.set('x', row(x, 'ignored', OLD))
    store.state.pageToken = 'tok-9'

    await service.reconcile(ENV)

    expect(store.files.get('x')?.status).toBe('indexed')
  })

  it('un fichier repris sorti de la portée entre-temps est archivé, pas indexé', async () => {
    const { store, drive, service } = setup()
    const x = file('x', 'tarifs.xlsx', ['ailleurs'], { mimeType: XLSX })
    drive.add(x, 'Feuille : A\nv')
    drive.add(file('ailleurs', 'Autre', ['parent-y'], { mimeType: FOLDER }))
    store.files.set('x', row(x, 'ignored', OLD))
    store.state.pageToken = 'tok-9'

    await service.sync(ENV)

    expect(store.files.get('x')?.status).toBe('archived')
  })
})

describe('rattrapage des embeddings en fin de passage (#3586.4)', () => {
  const progress = (over: Partial<EmbeddingProgress>): EmbeddingProgress => ({
    embedded: 100,
    failed: 0,
    done: false,
    remaining: 500,
    ...over,
  })

  it('boucle tant qu’il reste des chunks sans embedding, même sans chunk neuf, et journalise les restants', async () => {
    const results = [progress({ remaining: 200 }), progress({ remaining: 100 }), progress({ done: true, remaining: 0 })]
    const { service, kick } = setup(async () => results.shift())
    const log = jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined)

    await service.sync(ENV)

    expect(kick).toHaveBeenCalledTimes(3)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('embeddings : 200 restants'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('embeddings : 0 restants'))
  })

  it('s’arrête sans progrès (aucun embedding calculé) au lieu de boucler sur une panne', async () => {
    const { service, kick } = setup(async () => progress({ embedded: 0, failed: 50 }))
    await service.sync(ENV)
    expect(kick).toHaveBeenCalledTimes(1)
  })

  it('est borné en temps : budget épuisé, plus aucun appel', async () => {
    const { service, kick } = setup(async () => progress({}))
    service.embeddingBudgetMs = 0
    await service.sync(ENV)
    expect(kick).not.toHaveBeenCalled()
  })

  it('une panne IA ne fait pas échouer la synchro', async () => {
    const { service } = setup(async () => {
      throw new Error('IA down')
    })
    const report = await service.sync(ENV)
    expect(report.status).toBe('ok')
  })
})
