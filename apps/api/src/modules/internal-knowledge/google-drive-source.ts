import { createSign } from 'node:crypto'
import { GoogleClient } from '../google/google.client'
import type { GoogleConfig } from '../google/google-config'
import { extractDocumentText } from './document-text'
import { describeExtractFailure, extractTimeoutMs } from './extract-failure'
import type { InternalKnowledgeConfig } from './internal-knowledge.config'
import type { DriveChangesPage, DriveFileMeta, DriveSource } from './internal-knowledge.types'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,parents,trashed'

const GOOGLE_DOC = 'application/vnd.google-apps.document'
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet'
const GOOGLE_SLIDES = 'application/vnd.google-apps.presentation'

/** L'extraction PDF / docx existe déjà côté IA (`/rag/extract`) : on l'appelle, on ne la recopie pas. */
interface TextExtractor {
  ragExtract(
    input: { fileB64: string; filename?: string; source?: 'internal_drive' },
    opts?: { timeoutMs?: number },
  ): Promise<{ data: Record<string, unknown> }>
}

/**
 * `GoogleClient.exportFileText` / `downloadFileBase64` (module Google, réutilisés — décision 4) ne lisent
 * pas leur configuration OAuth : ils ne portent que le jeton Bearer qu'on leur passe. On ne leur en
 * invente donc pas une vraie ; ce compte de service n'a aucun client OAuth.
 */
const NO_OAUTH_CONFIG: GoogleConfig = { clientId: '', clientSecret: '', redirectUri: '', scopes: '', frontendUrl: '' }

type RawFile = {
  id?: string
  name?: string
  mimeType?: string
  modifiedTime?: string
  parents?: string[]
  trashed?: boolean
}

function toMeta(raw: RawFile | undefined): DriveFileMeta | null {
  if (!raw?.id) return null
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    mimeType: raw.mimeType ?? 'application/octet-stream',
    modifiedTime: raw.modifiedTime ?? '',
    parents: raw.parents ?? [],
    trashed: raw.trashed === true,
  }
}

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'text/markdown': '.md',
  'text/x-markdown': '.md',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/json': '.json',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
}

/** Le format se lit à l'extension : un fichier Drive sans extension (ou à une autre) reçoit celle de son type MIME. */
function nameWithExtension(file: DriveFileMeta): string {
  const ext = EXT_BY_MIME[file.mimeType]
  if (!ext || /\.(md|txt|docx|pdf|xlsx|csv|json|zip)$/i.test(file.name)) return file.name
  return `${file.name}${ext}`
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * #3586.1 — lecture du Drive par un COMPTE DE SERVICE (pas l'OAuth d'un utilisateur) : jeton obtenu par
 * assertion JWT RS256, portée `drive.readonly`. Aucune valeur de la clé n'est jamais journalisée ni
 * placée dans une erreur.
 */
export class GoogleDriveSource implements DriveSource {
  private accessToken: { value: string; expiresAt: number } | null = null
  private readonly google = new GoogleClient(NO_OAUTH_CONFIG)

  constructor(
    private readonly config: InternalKnowledgeConfig,
    private readonly extractor: TextExtractor,
  ) {}

  async startPageToken(): Promise<string> {
    const data = await this.getJson(`${DRIVE_BASE}/changes/startPageToken?supportsAllDrives=true`)
    const token = (data as { startPageToken?: string }).startPageToken
    if (!token) throw new Error('Drive : jeton de page de départ absent')
    return token
  }

  async listChildren(folderId: string): Promise<DriveFileMeta[]> {
    const out: DriveFileMeta[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const data = (await this.getJson(`${DRIVE_BASE}/files?${params.toString()}`)) as {
        files?: RawFile[]
        nextPageToken?: string
      }
      for (const raw of data.files ?? []) {
        const meta = toMeta(raw)
        if (meta) out.push(meta)
      }
      pageToken = data.nextPageToken
    } while (pageToken)
    return out
  }

  async getFile(fileId: string): Promise<DriveFileMeta | null> {
    const res = await this.get(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}&supportsAllDrives=true`,
    )
    // 403/404 : ancêtre inaccessible au compte de service — donc hors de ce qu'il a le droit de voir.
    if (res.status === 404 || res.status === 403) return null
    if (!res.ok) throw new Error(`Drive : lecture des métadonnées en échec (${res.status})`)
    return toMeta((await res.json()) as RawFile)
  }

  async listChanges(pageToken: string): Promise<DriveChangesPage> {
    const params = new URLSearchParams({
      pageToken,
      pageSize: '100',
      includeRemoved: 'true',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`,
    })
    const data = (await this.getJson(`${DRIVE_BASE}/changes?${params.toString()}`)) as {
      changes?: Array<{ fileId?: string; removed?: boolean; file?: RawFile }>
      nextPageToken?: string
      newStartPageToken?: string
    }
    const changes: DriveChangesPage['changes'] = []
    for (const c of data.changes ?? []) {
      if (!c.fileId) continue
      const file = toMeta(c.file)
      changes.push(
        file && !c.removed
          ? { fileId: c.fileId, removed: false, file }
          : { fileId: c.fileId, removed: c.removed === true },
      )
    }
    return { changes, nextPageToken: data.nextPageToken, newStartPageToken: data.newStartPageToken }
  }

  async fetchText(file: DriveFileMeta): Promise<string> {
    const token = await this.token()
    if (file.mimeType === GOOGLE_DOC || file.mimeType === GOOGLE_SLIDES) {
      return this.google.exportFileText(token, file.id, 'text/plain')
    }
    if (file.mimeType === GOOGLE_SHEET) return this.google.exportFileText(token, file.id, 'text/csv')

    const b64 = await this.google.downloadFileBase64(token, file.id)
    return extractDocumentText({
      name: nameWithExtension(file),
      bytes: Buffer.from(b64, 'base64'),
      extractRemote: async (fileB64, filename) => {
        // #3586 — délai adapté à la taille ; l'échec nomme sa cause (statut, taille, délai), pas « HTTP request failed ».
        const sizeBytes = Math.floor((fileB64.length * 3) / 4)
        const timeoutMs = extractTimeoutMs(sizeBytes)
        let envelope: { data: Record<string, unknown> }
        try {
          envelope = await this.extractor.ragExtract({ fileB64, filename, source: 'internal_drive' }, { timeoutMs })
        } catch (error) {
          throw new Error(describeExtractFailure(error, { filename, sizeBytes, timeoutMs }))
        }
        const text = envelope.data.text
        return typeof text === 'string' ? text : ''
      },
    })
  }

  private async get(url: string): Promise<Response> {
    return fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${await this.token()}` } })
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await this.get(url)
    if (!res.ok) throw new Error(`Drive : requête en échec (${res.status})`)
    return res.json()
  }

  private async token(): Promise<string> {
    const now = Date.now()
    if (this.accessToken && this.accessToken.expiresAt - 60_000 > now) return this.accessToken.value

    const iat = Math.floor(now / 1000)
    const claims = {
      iss: this.config.serviceAccount.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    }
    const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}`
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.config.serviceAccount.private_key)
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${base64url(signature)}`,
      }).toString(),
    })
    if (!res.ok) throw new Error(`Drive : jeton du compte de service refusé (${res.status})`)
    const data = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!data.access_token) throw new Error('Drive : jeton du compte de service absent')
    this.accessToken = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 }
    return data.access_token
  }
}
