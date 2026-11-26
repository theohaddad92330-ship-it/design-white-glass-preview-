import { generateKeyPairSync } from 'node:crypto'
import { HttpError, TechnicalError } from '@bellum/errors'
import { GoogleDriveSource } from './google-drive-source'
import type { DriveFileMeta } from './internal-knowledge.types'

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const CONFIG = {
  serviceAccount: { client_email: 'sa@p.iam.gserviceaccount.com', private_key: privateKey },
  folderIds: ['root1'],
  keepContacts: false,
}

type Call = { url: string; init?: RequestInit }

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function setup(handler: (url: string) => Response | Promise<Response>) {
  const calls: Call[] = []
  // `GoogleClient` (export / download réutilisés) appelle le `fetch` global : on le remplace UNE fois ici.
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init })
    if (u.startsWith('https://oauth2.googleapis.com/token')) return jsonRes({ access_token: 'AT', expires_in: 3600 })
    return handler(u)
  })
  const ia = { ragExtract: jest.fn(async () => ({ success: true, data: { text: 'texte PDF' } })) }
  const source = new GoogleDriveSource(CONFIG, ia)
  return { source, calls, ia }
}

afterEach(() => jest.restoreAllMocks())

const meta = (over: Partial<DriveFileMeta> = {}): DriveFileMeta => ({
  id: 'f',
  name: 'Doc',
  mimeType: 'application/vnd.google-apps.document',
  modifiedTime: 't',
  parents: ['root1'],
  trashed: false,
  ...over,
})

describe('GoogleDriveSource (#3586.1, #3586.2, #3586.4)', () => {
  it('échange un JWT signé RS256 contre un jeton, une seule fois (mis en cache), porté en Bearer', async () => {
    const { source, calls } = setup(() => jsonRes({ startPageToken: 'tok' }))
    await source.startPageToken()
    await source.startPageToken()
    const tokenCalls = calls.filter(c => c.url.startsWith('https://oauth2.googleapis.com/token'))
    expect(tokenCalls).toHaveLength(1)
    const body = String(tokenCalls[0]?.init?.body)
    expect(body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer')
    const assertion = decodeURIComponent(body.split('assertion=')[1] ?? '')
    const [header, payload, signature] = assertion.split('.')
    expect(JSON.parse(Buffer.from(header ?? '', 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString())
    expect(claims.iss).toBe('sa@p.iam.gserviceaccount.com')
    expect(claims.scope).toBe('https://www.googleapis.com/auth/drive.readonly')
    expect(signature?.length).toBeGreaterThan(100)
    const driveCall = calls.find(c => c.url.includes('/changes/startPageToken'))
    expect((driveCall?.init?.headers as Record<string, string>).Authorization).toBe('Bearer AT')
  })

  it('listChildren pagine et exclut la corbeille dans la requête', async () => {
    let page = 0
    const { source, calls } = setup(() =>
      jsonRes(page++ === 0 ? { files: [meta({ id: 'a' })], nextPageToken: 'p2' } : { files: [meta({ id: 'b' })] }),
    )
    const files = await source.listChildren('root1')
    expect(files.map(f => f.id)).toEqual(['a', 'b'])
    const first = decodeURIComponent((calls.find(c => c.url.includes('/files?'))?.url ?? '').replace(/\+/g, ' '))
    expect(first).toContain("'root1' in parents and trashed = false")
  })

  it('getFile rend null sur 404/403 (ancêtre inaccessible = hors portée)', async () => {
    const { source } = setup(() => jsonRes({ error: 'x' }, 404))
    expect(await source.getFile('zzz')).toBeNull()
  })

  it('listChanges mappe removed / fichier et les jetons de page', async () => {
    const { source } = setup(() =>
      jsonRes({
        changes: [
          { fileId: 'a', removed: true },
          {
            fileId: 'b',
            removed: false,
            file: { id: 'b', name: 'B', mimeType: 'application/pdf', modifiedTime: 'm', parents: ['root1'] },
          },
        ],
        newStartPageToken: 'nt',
      }),
    )
    const page = await source.listChanges('t0')
    expect(page.newStartPageToken).toBe('nt')
    expect(page.changes[0]).toEqual({ fileId: 'a', removed: true })
    expect(page.changes[1]?.file).toMatchObject({ id: 'b', parents: ['root1'], trashed: false })
  })

  it('exporte Docs en texte, Sheets en CSV, Slides en texte', async () => {
    const { source, calls } = setup(() => new Response('contenu'))
    expect(await source.fetchText(meta())).toBe('contenu')
    await source.fetchText(meta({ mimeType: 'application/vnd.google-apps.spreadsheet' }))
    await source.fetchText(meta({ mimeType: 'application/vnd.google-apps.presentation' }))
    const exports = calls
      .filter(c => c.url.includes('/export?'))
      .map(c => decodeURIComponent(c.url.split('mimeType=')[1] ?? ''))
    expect(exports).toEqual(['text/plain', 'text/csv', 'text/plain'])
  })

  it('PDF et docx passent par /rag/extract (extraction existante côté IA) ; md/txt sont décodés en UTF-8', async () => {
    const { source, ia } = setup(() => new Response('# titre é'))
    expect(await source.fetchText(meta({ name: 'x.pdf', mimeType: 'application/pdf' }))).toBe('texte PDF')
    expect(ia.ragExtract).toHaveBeenCalledWith(
      // #3586 — le Drive interne se déclare : plafond d'extraction propre côté IA (25 Mo).
      expect.objectContaining({ filename: 'x.pdf', fileB64: expect.any(String), source: 'internal_drive' }),
      { timeoutMs: 60_000 },
    )
    expect(await source.fetchText(meta({ name: 'n.md', mimeType: 'text/markdown' }))).toBe('# titre é')
  })

  it('#3586 — un échec d’extraction IA nomme la cause et passe un délai adapté à la taille', async () => {
    const { source, ia } = setup(() => new Response('x'.repeat(100)))
    ia.ragExtract.mockRejectedValueOnce(
      new TechnicalError('HTTP request failed', { cause: new HttpError(502, 'bad gateway', true, '/rag/extract') }),
    )
    await expect(source.fetchText(meta({ name: 'x.pdf', mimeType: 'application/pdf' }))).rejects.toThrow(
      /x\.pdf.*HTTP 502/,
    )
    expect(ia.ragExtract).toHaveBeenCalledWith(expect.anything(), { timeoutMs: 60_000 })
  })
})
