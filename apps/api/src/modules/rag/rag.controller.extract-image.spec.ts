import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { StorageService } from '../storage/storage.service'
import { RagController } from './rag.controller'
import type { RagService } from './rag.service'
import type { RagZipIngestJobService } from './rag-zip-ingest-job.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { RagExtractDto } from '../ia-proxy/dto/ia-proxy.dto'
import type { ProviderCostRecorder } from '../analytics/provider-cost-recorder'

/**
 * #2876 (#2433.4) — POST rag-documents/extract range désormais l'IMAGE, quand
 * il y en a une, sous son propre domaine (`chat_image_attachment`) — la
 * PREUVE VISUELLE survit ainsi à l'onglet qui l'a envoyée (avant ce lot, une
 * URL `blob:` locale seulement, jamais un `image_id`).
 *
 * Best-effort, à dessein : un fichier qui n'est PAS une image (PDF, DOCX) ou
 * un stockage indisponible/en refus ne doit jamais faire échouer l'extraction
 * de texte, qui fonctionnait déjà sans ce domaine.
 */
describe('#2876 (#2433.4) — RagController.extract range l’image sous son domaine', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload

  function build(
    over: {
      storage?: boolean
      putResolves?: { id: string } | 'throw'
      isDemoWorkspace?: boolean
      costHeader?: string
    } = {},
  ) {
    const ia = {
      ragExtract: jest
        .fn()
        .mockImplementation(
          async (_input: unknown, opts?: { onResponseHeader?: (name: string, value: string | null) => void }) => {
            opts?.onResponseHeader?.('x-bellum-costs', over.costHeader ?? null)
            return { success: true, data: { text: 'contenu lu', partial: false } }
          },
        ),
    } as unknown as jest.Mocked<Pick<IaClient, 'ragExtract'>>
    const recordHeader = jest.fn().mockResolvedValue(undefined)
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    const isDemoWorkspace = jest.fn().mockResolvedValue(over.isDemoWorkspace ?? false)
    const workspaceContext = { resolveActiveWorkspace, isDemoWorkspace } as unknown as WorkspaceContextService
    const put =
      over.putResolves === 'throw'
        ? jest.fn().mockRejectedValue(new Error('refused'))
        : jest.fn().mockResolvedValue(over.putResolves ?? { id: 'img-1' })
    const storage = over.storage === false ? undefined : ({ put } as unknown as StorageService)
    const controller = new RagController(
      {} as RagService,
      ia as unknown as IaClient,
      workspaceContext,
      {} as RagZipIngestJobService,
      {} as never,
      {} as never,
      storage,
      { recordHeader } as unknown as ProviderCostRecorder,
    )
    return { ia, controller, put, resolveActiveWorkspace, isDemoWorkspace, recordHeader }
  }

  it('#2433.4 (lot M10) — relaie les zones de lecture VALIDES de l’image, jamais une zone invalide', async () => {
    const { controller, ia } = build()
    ia.ragExtract.mockResolvedValueOnce({
      success: true,
      data: {
        text: 'TOTAL 42,00 €',
        partial: false,
        regions: [
          { quote: 'TOTAL 42,00 €', bounding_box: { x: 0.1, y: 0.7, w: 0.5, h: 0.08 } },
          { quote: 'hors image', bounding_box: { x: 0.9, y: 0.7, w: 0.5, h: 0.08 } },
        ],
      },
    } as never)
    const result = await controller.extract(user, { fileB64: 'aGVsbG8=', filename: 'ticket.png' } as RagExtractDto)
    expect(result.regions).toEqual([{ quote: 'TOTAL 42,00 €', bounding_box: { x: 0.1, y: 0.7, w: 0.5, h: 0.08 } }])
  })

  it('#2433.4 — sans zone lue, aucune clé : jamais une liste vide qui se lirait « rien trouvé »', async () => {
    const { controller } = build()
    const result = await controller.extract(user, { fileB64: 'aGVsbG8=', filename: 'capture.png' } as RagExtractDto)
    expect(result).not.toHaveProperty('regions')
  })

  it('range l’image et rend `imageObjectId`, sous le domaine `chat_image_attachment`', async () => {
    const { controller, put } = build()
    const result = await controller.extract(user, {
      fileB64: 'aGVsbG8=',
      filename: 'capture.png',
    } as RagExtractDto)

    expect(result).toEqual({ text: 'contenu lu', partial: false, imageObjectId: 'img-1' })
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        domain: 'chat_image_attachment',
        fileName: 'capture.png',
        contentType: 'image/png',
        fileB64: 'aGVsbG8=',
        uploadedBy: 'u-1',
      }),
    )
  })

  it('ne range RIEN pour un fichier qui n’est pas une image de chat (PDF, DOCX…)', async () => {
    const { controller, put } = build()
    const result = await controller.extract(user, {
      fileB64: 'aGVsbG8=',
      filename: 'devis.pdf',
    } as RagExtractDto)

    expect(result).toEqual({ text: 'contenu lu', partial: false })
    expect(put).not.toHaveBeenCalled()
  })

  it('sans nom de fichier : aucune tentative de rangement, l’extraction répond quand même', async () => {
    const { controller, put } = build()
    const result = await controller.extract(user, { fileB64: 'aGVsbG8=' } as RagExtractDto)

    expect(result).toEqual({ text: 'contenu lu', partial: false })
    expect(put).not.toHaveBeenCalled()
  })

  it('stockage absent (module retiré) : l’extraction reste inchangée, jamais d’erreur', async () => {
    const { controller, put } = build({ storage: false })
    const result = await controller.extract(user, {
      fileB64: 'aGVsbG8=',
      filename: 'capture.png',
    } as RagExtractDto)

    expect(result).toEqual({ text: 'contenu lu', partial: false })
    expect(put).not.toHaveBeenCalled()
  })

  it('refus/panne du stockage : NE FAIT JAMAIS ÉCHOUER l’extraction (best-effort)', async () => {
    const { controller } = build({ putResolves: 'throw' })
    const result = await controller.extract(user, {
      fileB64: 'aGVsbG8=',
      filename: 'capture.png',
    } as RagExtractDto)

    expect(result).toEqual({ text: 'contenu lu', partial: false })
  })

  it('salle de DÉMONSTRATION : l’extraction répond, mais RIEN n’est rangé (même raison que ingest/ingestZip)', async () => {
    const { controller, put } = build({ isDemoWorkspace: true })
    const result = await controller.extract(user, {
      fileB64: 'aGVsbG8=',
      filename: 'capture.png',
    } as RagExtractDto)

    expect(result).toEqual({ text: 'contenu lu', partial: false })
    expect(put).not.toHaveBeenCalled()
  })

  describe('#2433.12 (lot P02 09/10) — le localiseur d’objets (bords du document, grille de tableau)', () => {
    it('le demande pour une image hors démo, et relaie les objets RELUS', async () => {
      const { controller, ia } = build()
      ia.ragExtract.mockResolvedValueOnce({
        success: true,
        data: {
          text: 'Profil TJM',
          partial: false,
          objects: {
            // Déborde : écarté, jamais rogné — l'image reste entière.
            document_bounds: { x: 0.5, y: 0.1, w: 0.7, h: 0.5 },
            table: {
              rows: [
                ['Profil', 'TJM'],
                ['Tech lead', null],
              ],
            },
          },
        },
      } as never)
      const result = await controller.extract(user, { fileB64: 'aGVsbG8=', filename: 'capture.png' } as RagExtractDto)

      expect(ia.ragExtract.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ locateObjects: true }))
      expect(result.objects).toEqual({
        documentBounds: null,
        table: {
          boundingBox: null,
          rows: [
            ['Profil', 'TJM'],
            ['Tech lead', null],
          ],
        },
      })
    })

    it('ne le demande JAMAIS en salle de démonstration, ni pour un fichier qui n’est pas une image', async () => {
      const demo = build({ isDemoWorkspace: true })
      await demo.controller.extract(user, { fileB64: 'aGVsbG8=', filename: 'capture.png' } as RagExtractDto)
      expect(demo.ia.ragExtract.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ locateObjects: false }))

      const pdf = build()
      await pdf.controller.extract(user, { fileB64: 'aGVsbG8=', filename: 'devis.pdf' } as RagExtractDto)
      expect(pdf.ia.ragExtract.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ locateObjects: false }))
    })

    it('rien mesuré : aucune clé `objects` (jamais « bords non détectés » sans mesure)', async () => {
      const { controller } = build()
      const result = await controller.extract(user, { fileB64: 'aGVsbG8=', filename: 'capture.png' } as RagExtractDto)
      expect(result).not.toHaveProperty('objects')
    })

    it('écrit le coût de la lecture dans provider_costs (l’outil voyage dans l’en-tête, lot M10)', async () => {
      const header = '[{"provider":"anthropic","operation":"vision_object_locate","tool":"chat_image_objects"}]'
      const { controller, recordHeader } = build({ costHeader: header })
      await controller.extract(user, { fileB64: 'aGVsbG8=', filename: 'capture.png' } as RagExtractDto)
      expect(recordHeader).toHaveBeenCalledWith(header, {
        workspaceId: 'ws-1',
        userId: 'u-1',
        feature: 'chat_image_extract',
      })
    })
  })
})
