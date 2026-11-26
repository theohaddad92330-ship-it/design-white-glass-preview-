import { NotFoundException } from '@nestjs/common'
import { StorageService } from './storage.service'

/**
 * #3803 (3803.1/3803.5) — l'ORIGINAL d'un document déposé.
 *
 *  1. ses OCTETS ne se lisent que dans l'espace de l'appelant, et seulement au
 *     domaine `rag_document_source` — un objet d'un autre espace (ou un
 *     justificatif comptable) n'existe pas pour cette porte ;
 *  2. il vit autant que son document : un original qu'aucun document ne porte
 *     plus part au balayage, jamais un original encore porté.
 */
describe('StorageService — original d’un document (#3803)', () => {
  const WORKSPACE = '11111111-1111-4111-8111-111111111111'
  const OBJECT = '22222222-2222-4222-8222-222222222222'

  function build(rows: unknown[] = []) {
    const client = {
      get: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 contenu')),
      remove: jest.fn().mockResolvedValue(true),
    }
    const manager = { query: jest.fn().mockResolvedValue(rows) }
    return { service: new StorageService({ manager } as never, client as never), client, manager }
  }

  it('lit les octets BORNÉS à l’espace et au domaine, dans la requête même', async () => {
    const { service, client, manager } = build([
      {
        id: OBJECT,
        object_path: `${WORKSPACE}/rag_document_source/${OBJECT}/offre.pdf`,
        file_name: 'offre.pdf',
        content_type: 'application/pdf',
      },
    ])
    const read = await service.readRagDocumentSource(WORKSPACE, OBJECT)
    const [sql, params] = manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('workspace_id = $2')
    expect(sql).toContain("domain = 'rag_document_source'")
    expect(params).toEqual([OBJECT, WORKSPACE])
    expect(client.get).toHaveBeenCalledWith(`${WORKSPACE}/rag_document_source/${OBJECT}/offre.pdf`)
    expect(read).toMatchObject({ fileName: 'offre.pdf', contentType: 'application/pdf' })
  })

  it('un objet d’un AUTRE espace : 404, et le magasin n’est même pas interrogé', async () => {
    const { service, client } = build([])
    await expect(service.readRagDocumentSource(WORKSPACE, OBJECT)).rejects.toBeInstanceOf(NotFoundException)
    expect(client.get).not.toHaveBeenCalled()
  })

  it('le balayage n’atteint QUE les originaux qu’aucun document ne porte plus, après un jour de grâce', async () => {
    const { service, client, manager } = build([{ id: OBJECT, object_path: 'p/rag_document_source/x/a.pdf' }])
    const { removed } = await service.purgeOrphanRagDocumentSources(50)
    const [select] = manager.query.mock.calls[0] as [string]
    expect(select).toContain("domain = 'rag_document_source'")
    expect(select).toContain('NOT EXISTS')
    expect(select).toContain('rag_documents')
    expect(select).toContain("interval '1 day'")
    const [remove] = manager.query.mock.calls[1] as [string]
    expect(remove).toContain("domain = 'rag_document_source'")
    expect(client.remove).toHaveBeenCalledWith(['p/rag_document_source/x/a.pdf'])
    expect(removed).toBe(1)
  })

  it('un magasin qui refuse l’effacement garde les lignes (reprises au prochain passage)', async () => {
    const { service, client, manager } = build([{ id: OBJECT, object_path: 'p/a.pdf' }])
    client.remove.mockResolvedValue(false)
    const { removed } = await service.purgeOrphanRagDocumentSources(50)
    expect(removed).toBe(0)
    expect(manager.query).toHaveBeenCalledTimes(1)
  })
})
