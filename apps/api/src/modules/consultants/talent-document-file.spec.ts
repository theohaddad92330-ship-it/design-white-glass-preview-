import { NotFoundException } from '@nestjs/common'
import { TALENT_DOCUMENT_FILE_URL_TTL_SECONDS } from '@bellum/contracts'
import { TalentService } from './talent.service'

/**
 * #4034 — l'aperçu du CV : l'ORIGINAL se relit par une URL signée courte, le
 * texte extrait se relit pour la mise en page, et le fichier part avec le
 * document.
 */
const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const OTHER_WORKSPACE = 'w0000000-0000-4000-8000-000000000002'
const TALENT = 'c0000000-0000-4000-8000-000000000001'
const DOC = 'd0000000-0000-4000-8000-000000000001'
const PATH = `${WORKSPACE}/cv/${DOC}/cv.pdf`

type DocRow = {
  id: string
  consultant_id: string
  workspace_id: string
  filename: string
  mime_type: string | null
  storage_path: string | null
  extracted_text: string | null
  extraction_partial: boolean
}

function make(rows: DocRow[]) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      // La base applique le filtre (document, talent, ESPACE, non archivé).
      const [id, consultantId, workspaceId] = params as string[]
      const match = rows.filter(
        row => row.id === id && row.consultant_id === consultantId && row.workspace_id === workspaceId,
      )
      if (sql.startsWith('UPDATE consultant_documents'))
        return [match.map(row => ({ storage_path: row.storage_path })), match.length]
      if (sql.includes('FROM consultant_documents')) return match
      return []
    }),
  }
  const consultants = {
    manager,
    findOne: jest.fn(async (options: { where: { id: string; workspace_id: string } }) =>
      options.where.id === TALENT && options.where.workspace_id === WORKSPACE
        ? { id: TALENT, workspace_id: WORKSPACE }
        : null,
    ),
  }
  const storage = {
    signedUrl: jest.fn(async (path: string, ttl: number) => `https://store.example/sign/${path}?ttl=${ttl}`),
    remove: jest.fn(async () => true),
  }
  const service = new TalentService(
    consultants as never,
    {} as never,
    {} as never,
    { manager } as never,
    {} as never,
    {} as never,
    {} as never,
    storage as never,
  )
  return { service, storage, queries }
}

const withOriginal: DocRow = {
  id: DOC,
  consultant_id: TALENT,
  workspace_id: WORKSPACE,
  filename: 'cv.pdf',
  mime_type: 'application/pdf',
  storage_path: PATH,
  extracted_text: 'YANIS BERTHIER\nIngénieur plateforme',
  extraction_partial: false,
}

describe('TalentService — aperçu du CV (#4034)', () => {
  describe('#4034.3 — GET …/documents/:docId/file-url', () => {
    it('rend une URL signée de cinq minutes au plus, avec le type et le nom', async () => {
      const { service, storage } = make([withOriginal])
      const result = await service.documentFileUrl(TALENT, WORKSPACE, DOC)

      expect(storage.signedUrl).toHaveBeenCalledWith(PATH, TALENT_DOCUMENT_FILE_URL_TTL_SECONDS)
      expect(TALENT_DOCUMENT_FILE_URL_TTL_SECONDS).toBeLessThanOrEqual(300)
      expect(result.url).toContain(PATH)
      expect(result.mimeType).toBe('application/pdf')
      expect(result.filename).toBe('cv.pdf')
      expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now())
    })

    it('filtre par ESPACE dans la requête — jamais `where id` seul', async () => {
      const { service, queries } = make([withOriginal])
      await service.documentFileUrl(TALENT, WORKSPACE, DOC)
      const read = queries.find(query => query.sql.includes('FROM consultant_documents'))
      expect(read?.sql).toMatch(/workspace_id\s*=\s*\$3/)
      expect(read?.sql).toMatch(/consultant_id\s*=\s*\$2/)
      expect(read?.params).toEqual([DOC, TALENT, WORKSPACE])
    })

    it('404 pour un talent d’un autre espace, sans rien signer', async () => {
      const { service, storage } = make([withOriginal])
      await expect(service.documentFileUrl(TALENT, OTHER_WORKSPACE, DOC)).rejects.toBeInstanceOf(NotFoundException)
      expect(storage.signedUrl).not.toHaveBeenCalled()
    })

    it('404 quand l’original n’a pas été conservé (CV importé avant #4034)', async () => {
      const { service, storage } = make([{ ...withOriginal, storage_path: null }])
      await expect(service.documentFileUrl(TALENT, WORKSPACE, DOC)).rejects.toBeInstanceOf(NotFoundException)
      expect(storage.signedUrl).not.toHaveBeenCalled()
    })
  })

  describe('#4034.4 — le texte extrait, pour la mise en page', () => {
    it('rend le texte et le signal « lu en partie »', async () => {
      const { service } = make([{ ...withOriginal, extraction_partial: true }])
      await expect(service.documentText(TALENT, WORKSPACE, DOC)).resolves.toEqual({
        text: 'YANIS BERTHIER\nIngénieur plateforme',
        partial: true,
      })
    })

    it('404 pour un document d’un autre talent', async () => {
      const { service } = make([{ ...withOriginal, consultant_id: 'autre' }])
      await expect(service.documentText(TALENT, WORKSPACE, DOC)).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('#4034.6 — retirer un document retire AUSSI son original', () => {
    it('le fichier est effacé du stockage', async () => {
      const { service, storage, queries } = make([withOriginal])
      await service.removeDocument(TALENT, WORKSPACE, DOC)
      expect(storage.remove).toHaveBeenCalledWith([PATH])
      const update = queries.find(query => query.sql.startsWith('UPDATE consultant_documents'))
      expect(update?.sql).toContain('storage_path = NULL')
    })

    it('sait dire NON : un document sans original n’appelle pas le stockage', async () => {
      const { service, storage } = make([{ ...withOriginal, storage_path: null }])
      await service.removeDocument(TALENT, WORKSPACE, DOC)
      expect(storage.remove).not.toHaveBeenCalled()
    })
  })
})
