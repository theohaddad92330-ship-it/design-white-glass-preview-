import { CV_ZIP_LARGE_ARCHIVE_MAX_BYTES } from '@bellum/contracts'
import type { SupabaseService } from '../../supabase/supabase.service'
import { StorageClient } from './storage.client'

function makeClient(createError: { message: string } | null) {
  const createBucket = jest.fn(async () => ({ data: null, error: createError }))
  const updateBucket = jest.fn(async () => ({ data: null, error: null }))
  const createSignedUploadUrl = jest.fn(async () => ({ data: { signedUrl: 'https://s/u', token: 't' }, error: null }))
  const supabase = {
    getClient: () => ({ storage: { createBucket, updateBucket, from: () => ({ createSignedUploadUrl }) } }),
  } as unknown as SupabaseService
  return { client: new StorageClient(supabase), createBucket, updateBucket }
}

/**
 * #3481 — le seau ne doit JAMAIS plafonner l'import ZIP volumineux : un seau
 * créé sans limite (ou plus tôt avec une limite basse) rend un 413 au dépôt
 * d'une archive de 600 Mo, découvert par le client plutôt que par la CI.
 */
describe('StorageClient — plafond de taille du seau (#3481)', () => {
  it('crée le seau avec une limite égale au plafond de l’import volumineux', async () => {
    const { client, createBucket, updateBucket } = makeClient(null)
    await client.createSignedUploadUrl('w/cv-zip-import/a.zip')
    expect(createBucket).toHaveBeenCalledWith(
      'bellum-files',
      expect.objectContaining({ public: false, fileSizeLimit: CV_ZIP_LARGE_ARCHIVE_MAX_BYTES }),
    )
    expect(updateBucket).not.toHaveBeenCalled()
  })

  it('un seau DÉJÀ créé (limite ancienne) est remis au plafond, toujours privé', async () => {
    const { client, updateBucket } = makeClient({ message: 'The resource already exists' })
    await client.createSignedUploadUrl('w/cv-zip-import/a.zip')
    expect(updateBucket).toHaveBeenCalledWith(
      'bellum-files',
      expect.objectContaining({ public: false, fileSizeLimit: CV_ZIP_LARGE_ARCHIVE_MAX_BYTES }),
    )
  })
})

/**
 * Import ZIP 666 Mo (04/10/2026) — `/storage/v1/upload/resumable` IGNORE
 * l'en-tête `x-signature` et rend 400 « Invalid Compact JWS » : le dépôt TUS
 * SIGNÉ passe par `/storage/v1/upload/resumable/sign`.
 */
describe('StorageClient — endpoint TUS signé (import ZIP 04/10)', () => {
  const previous = process.env['SUPABASE_URL']
  afterEach(() => {
    if (previous === undefined) delete process.env['SUPABASE_URL']
    else process.env['SUPABASE_URL'] = previous
  })

  it('pointe sur /storage/v1/upload/resumable/sign, la barre finale du projet retirée', () => {
    process.env['SUPABASE_URL'] = 'https://projet.supabase.co/'
    const { client } = makeClient(null)
    expect(client.resumableUploadEndpoint()).toBe('https://projet.supabase.co/storage/v1/upload/resumable/sign')
  })
})
