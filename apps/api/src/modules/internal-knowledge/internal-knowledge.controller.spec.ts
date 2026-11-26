import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PATH_METADATA } from '@nestjs/common/constants'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { InternalKnowledgeController } from './internal-knowledge.controller'
import type { DigestStore, KnowledgeDigest, KnowledgeFileRow, KnowledgeStore } from './internal-knowledge.types'

const row = (over: Partial<KnowledgeFileRow>): KnowledgeFileRow => ({
  fileId: 'f',
  name: 'Doc',
  mimeType: 'application/vnd.google-apps.document',
  path: 'Partagé / Doc',
  modifiedTime: '2026-10-04T08:00:00.000Z',
  status: 'indexed',
  errorMessage: null,
  chunkCount: 3,
  syncedAt: new Date('2026-10-04T09:00:00.000Z'),
  ...over,
})

function storeWith(files: KnowledgeFileRow[]): KnowledgeStore {
  return {
    getState: async () => ({
      pageToken: 'secret-token',
      lastRunAt: new Date('2026-10-04T09:10:00.000Z'),
      lastStatus: 'ok',
      lastError: null,
    }),
    listFiles: async () => files,
  } as unknown as KnowledgeStore
}

function digestsWith(digest: KnowledgeDigest | null): DigestStore {
  return { getCurrentDigest: async () => digest, saveDigest: async () => undefined }
}

describe('InternalKnowledgeController (#3586.8) — lecture interne (DM)', () => {
  it('#3586 — lecture INTERNE : InternalSecretGuard seul (refus sans secret), route internal/, plus de route back-office web', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, InternalKnowledgeController) as unknown[]
    expect(guards).toEqual([InternalSecretGuard])
    expect(Reflect.getMetadata(PATH_METADATA, InternalKnowledgeController)).toBe('internal/internal-knowledge')
  })

  it('InternalSecretGuard refuse sans secret et accepte le bon', () => {
    const ctx = (headers: Record<string, string>) =>
      ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never
    const guard = new InternalSecretGuard({ get: () => 's3cret' } as never)
    expect(guard.canActivate(ctx({}))).toBe(false)
    expect(guard.canActivate(ctx({ 'x-internal-secret': 'faux' }))).toBe(false)
    expect(guard.canActivate(ctx({ 'x-internal-secret': 's3cret' }))).toBe(true)
  })

  it('rend dernière synchro, compteurs par statut et liste des fichiers, sans jamais exposer le jeton de page', async () => {
    const files = [
      row({ fileId: 'a' }),
      row({ fileId: 'b', status: 'ignored', name: 'schema.png', chunkCount: 0 }),
      row({ fileId: 'c', status: 'error', errorMessage: 'export failed', chunkCount: 0 }),
      row({ fileId: 'd', status: 'archived', chunkCount: 0 }),
    ]
    const controller = new InternalKnowledgeController(storeWith(files), () => true, digestsWith(null))
    const view = await controller.overview()

    expect(view.configured).toBe(true)
    expect(view.lastRunAt).toEqual(new Date('2026-10-04T09:10:00.000Z'))
    expect(view.counts).toEqual({ indexed: 1, ignored: 1, error: 1, archived: 1 })
    expect(view.files).toHaveLength(4)
    expect(view.files.find(f => f.status === 'error')?.errorMessage).toBe('export failed')
    expect(JSON.stringify(view)).not.toContain('secret-token')
  })

  it('#3586 — un fichier ignoré sans raison stockée reçoit la raison calculée (ignoredReason) ; une raison stockée gagne', async () => {
    const files = [
      row({ fileId: 'p', status: 'ignored', name: 'schema.png', mimeType: 'image/png', errorMessage: null }),
      row({ fileId: 'q', status: 'ignored', name: 'x.png', mimeType: 'image/png', errorMessage: 'raison stockée' }),
      row({ fileId: 'r', status: 'indexed', errorMessage: null }),
    ]
    const view = await new InternalKnowledgeController(storeWith(files), () => true, digestsWith(null)).overview()
    expect(view.files.find(f => f.name === 'schema.png')?.errorMessage).toMatch(/image/i)
    expect(view.files.find(f => f.name === 'x.png')?.errorMessage).toBe('raison stockée')
    expect(view.files.find(f => f.name === 'Doc')?.errorMessage).toBeNull()
  })

  it('jamais de « 0 » pour un état inconnu : sans passage, lastRunAt est null et la liste vide', async () => {
    const store = {
      getState: async () => ({ pageToken: null, lastRunAt: null, lastStatus: null, lastError: null }),
      listFiles: async () => [],
    } as unknown as KnowledgeStore
    const view = await new InternalKnowledgeController(store, () => false, digestsWith(null)).overview()
    expect(view).toMatchObject({ configured: false, lastRunAt: null, lastStatus: null, files: [], digest: null })
  })

  it('#3586 W2 — rend la date et la taille du digest courant, jamais son empreinte', async () => {
    const digest: KnowledgeDigest = {
      content: 'Méthode ESN.',
      fingerprint: 'empreinte-interne',
      createdAt: new Date('2026-10-04T09:12:00.000Z'),
      sizeChars: 9_800,
    }
    const view = await new InternalKnowledgeController(storeWith([row({})]), () => true, digestsWith(digest)).overview()
    expect(view.digest).toEqual({
      generatedAt: new Date('2026-10-04T09:12:00.000Z'),
      sizeChars: 9_800,
      approxTokens: 2_450,
    })
    expect(JSON.stringify(view)).not.toContain('empreinte-interne')
  })
})
