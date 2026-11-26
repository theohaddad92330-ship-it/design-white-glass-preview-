import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import { RagController } from './rag.controller'
import type { RagService } from './rag.service'
import type { RagZipIngestJobService } from './rag-zip-ingest-job.service'
import type { ImportService } from '../import/import.service'
import type { ImportWriterService } from '../import/import-writer.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { RagIngestDto, RagQueryDto } from '../ia-proxy/dto/ia-proxy.dto'

describe('RagController — IA proxy (ingest/query)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload

  function build() {
    const ia = {
      ragIngest: jest.fn().mockResolvedValue({ success: true, data: {} }),
      ragQuery: jest.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as jest.Mocked<Pick<IaClient, 'ragIngest' | 'ragQuery'>>
    // Both routes now resolve the caller's workspace server-side: the knowledge
    // base is a team asset, so an upload must ground every colleague's analysis
    // and a search must span the whole ESN.
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    const isDemoWorkspace = jest.fn().mockResolvedValue(false)
    const workspaceContext = { resolveActiveWorkspace, isDemoWorkspace } as unknown as WorkspaceContextService
    const zipIngest = {
      enqueue: jest.fn().mockResolvedValue({ jobId: 'j', status: 'pending' }),
      status: jest.fn(),
    } as unknown as jest.Mocked<Pick<RagZipIngestJobService, 'enqueue' | 'status'>>
    // #2850 (#2431.11, 28/09) — la porte d'approbation existante de l'assistant
    // d'import : `create` + `simulate`, jamais une écriture (`apply` n'est jamais
    // appelé depuis le dépôt `/chat`).
    const importSessions = {
      create: jest.fn().mockResolvedValue({ id: 'session-1', object_type: 'account' }),
      simulate: jest.fn().mockResolvedValue({ report: { creations: 1, updates: 0, skipped: [] } }),
    } as unknown as jest.Mocked<Pick<ImportService, 'create' | 'simulate'>>
    const importWriter = {
      knownCompanyKeys: jest.fn().mockResolvedValue(new Set()),
      existingKeys: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<Pick<ImportWriterService, 'knownCompanyKeys' | 'existingKeys'>>
    const controller = new RagController(
      {} as RagService,
      ia as unknown as IaClient,
      workspaceContext,
      zipIngest as unknown as RagZipIngestJobService,
      importSessions as unknown as ImportService,
      importWriter as unknown as ImportWriterService,
    )
    return { ia, controller, resolveActiveWorkspace, isDemoWorkspace, zipIngest, importSessions, importWriter }
  }

  it('ingests with the JWT userId and the resolved workspace (never body-supplied)', async () => {
    const { ia, controller, resolveActiveWorkspace } = build()
    await controller.ingest(user, { title: 'Playbook', content: '...', category: 'sales' } as RagIngestDto)
    expect(resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(ia.ragIngest).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      title: 'Playbook',
      content: '...',
      category: 'sales',
    })
  })

  it('forwards an uploaded PDF (fileB64 + filename) with the JWT userId + workspace', async () => {
    const { ia, controller } = build()
    // The PDF path: the front sends the base64 file, never raw content — the IA
    // extracts the text server-side. userId/workspaceId still come from the JWT,
    // so a client can't write a PDF into another tenant's store.
    await controller.ingest(user, {
      title: 'Plaquette',
      category: 'Autre',
      fileB64: 'JVBERi0xLjQK',
      filename: 'plaquette.pdf',
    } as RagIngestDto)
    expect(ia.ragIngest).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      title: 'Plaquette',
      category: 'Autre',
      fileB64: 'JVBERi0xLjQK',
      filename: 'plaquette.pdf',
    })
  })

  it('queries the WORKSPACE store, not just the caller’s own documents', async () => {
    const { ia, controller, resolveActiveWorkspace } = build()
    await controller.query(user, { query: 'cold call', topK: 3 } as RagQueryDto)
    expect(resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(ia.ragQuery).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      query: 'cold call',
      topK: 3,
    })
  })

  it('follows the workspace SWITCHER: the same user ingests into whichever workspace is active', async () => {
    // Composition with #642. `resolveActiveWorkspace` now honours a persisted
    // selection, so a consultant who owns a personal workspace but is working in
    // their ESN's must have the document filed under the ESN. The controller
    // holds no workspace of its own — it asks on every call — which is exactly
    // what makes switching take effect immediately.
    const { ia, controller, resolveActiveWorkspace } = build()
    resolveActiveWorkspace
      .mockResolvedValueOnce({ workspaceId: 'ws-esn' })
      .mockResolvedValueOnce({ workspaceId: 'ws-personal' })

    await controller.ingest(user, { title: 'Référence', content: '...', category: 'ref' } as RagIngestDto)
    expect(ia.ragIngest).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: 'ws-esn' }))

    // …the user switches, and the very next upload lands in the other workspace.
    await controller.ingest(user, { title: 'Note perso', content: '...', category: 'ref' } as RagIngestDto)
    expect(ia.ragIngest).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: 'ws-personal' }))
  })

  it('follows the workspace SWITCHER on search too — grounding changes with the workspace', async () => {
    const { ia, controller, resolveActiveWorkspace } = build()
    resolveActiveWorkspace
      .mockResolvedValueOnce({ workspaceId: 'ws-esn' })
      .mockResolvedValueOnce({ workspaceId: 'ws-personal' })

    await controller.query(user, { query: 'référence bancaire' } as RagQueryDto)
    expect(ia.ragQuery).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: 'ws-esn' }))

    await controller.query(user, { query: 'référence bancaire' } as RagQueryDto)
    expect(ia.ragQuery).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: 'ws-personal' }))
  })

  it('never lets a body-supplied workspace override the resolved one', async () => {
    const { ia, controller } = build()
    // A hostile body carrying another tenant's workspace must be ignored: the DTO
    // has no such field, and the controller passes only what it resolved itself.
    await controller.query(user, {
      query: 'cold call',
      topK: 3,
      workspaceId: 'ws-attacker',
    } as unknown as RagQueryDto)
    expect(ia.ragQuery).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1' }))
  })

  it('#1954.7 — forwards scope + conversationId to the IA client when the caller sends them', async () => {
    const { ia, controller } = build()
    await controller.ingest(user, {
      title: 'CV joint',
      content: '...',
      scope: 'conversation',
      conversationId: 'thread-42',
    } as RagIngestDto)
    expect(ia.ragIngest).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'conversation', conversationId: 'thread-42' }),
    )
  })

  it('#1954.7 — scope/conversationId are undefined when the caller does not send them (byte-identical to before)', async () => {
    // `IaClient.ragIngest` omits an undefined `scope`/`conversationId` from
    // the wire body it sends to the IA service (conditional spread) — the
    // exact-match test above (`ingests with the JWT userId…`) is the proof
    // that a call carrying only `undefined` for these two keys still equals
    // the pre-#1954.7 call shape (Jest treats an `undefined`-valued key as
    // absent). This test pins the controller's OWN half: it never invents a
    // scope the caller didn't ask for.
    const { ia, controller } = build()
    await controller.ingest(user, { title: 'Playbook', content: '...', category: 'sales' } as RagIngestDto)
    const call = ia.ragIngest.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.scope).toBeUndefined()
    expect(call.conversationId).toBeUndefined()
  })

  it('compatibilité des onglets ouverts — la forme FICHIER que le chat envoie aujourd’hui part comme avant', async () => {
    // `Chat.tsx::fileToIngestInput`, sans portée ni fil (le lot 2b enverra la
    // portée). L'appel au client IA doit être STRICTEMENT celui d'avant 2a :
    // mêmes clés, même destination (l'espace), aucune portée inventée.
    const { ia, controller } = build()
    await controller.ingest(user, {
      title: 'cv.pdf',
      category: 'chat',
      fileB64: 'JVBERi0xLjQK',
      filename: 'cv.pdf',
    } as RagIngestDto)
    expect(ia.ragIngest).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      title: 'cv.pdf',
      category: 'chat',
      fileB64: 'JVBERi0xLjQK',
      filename: 'cv.pdf',
    })
  })

  // #2850 (#2431.2/.10, reste 27/09) — la classification par contenu (`chat-
  // import-classifier.ts`) gagne enfin un APPELANT réel dans ce contrôleur :
  // un fichier tabulaire déposé au chat, jusqu'ici routé SEULEMENT vers le RAG,
  // porte désormais aussi une suggestion d'objet métier dans la réponse.
  it('#2850 — ajoute `suggestedImportObject` quand le contenu texte matche une source du catalogue', async () => {
    const { ia, controller } = build()
    ia.ragIngest.mockResolvedValue({ success: true, data: { id: 'doc-1' } })
    const result = await controller.ingest(user, {
      title: 'export.csv',
      content: 'raison sociale,siren\nAcme SAS,123456789',
      category: 'chat',
    } as RagIngestDto)
    // Ce fixture matche `accounts_only` en confiance HAUTE (chat-import-classifier.spec.ts) :
    // une proposition est donc AUSSI créée, voir le test dédié ci-dessous.
    expect(result).toEqual({
      success: true,
      data: { id: 'doc-1', suggestedImportObject: 'account', pendingImportSessionId: 'session-1' },
    })
  })

  // #2850 (#2431.11, décision Louis 28/09) — AUCUNE écriture automatique : la
  // confiance HAUTE ouvre une PROPOSITION (session créée + simulée, JAMAIS
  // appliquée) via la porte d'approbation déjà existante de l'assistant
  // d'import — jamais une seconde porte, jamais un `apply` direct.
  it('#2850 (#2431.11) — confiance HAUTE : propose via la porte d’approbation existante (session + simulation, jamais d’écriture)', async () => {
    const { ia, controller, importSessions, importWriter } = build()
    ia.ragIngest.mockResolvedValue({ success: true, data: { id: 'doc-1' } })
    const content = 'raison sociale,siren\nAcme SAS,123456789'
    await controller.ingest(user, { title: 'export.csv', content, category: 'chat' } as RagIngestDto)

    expect(importSessions.create).toHaveBeenCalledWith('u-1', 'ws-1', 'accounts_only')
    expect(importWriter.knownCompanyKeys).toHaveBeenCalledWith('ws-1')
    expect(importWriter.existingKeys).toHaveBeenCalledWith('ws-1', 'account')
    expect(importSessions.simulate).toHaveBeenCalledWith('ws-1', 'session-1', {
      content,
      knownParents: new Set(),
      existing: {},
    })
    // `apply` n'existe même pas dans le mock : le geste utilisateur reste seul
    // à approuver l'écriture, jamais ce contrôleur.
  })

  it('#2850 (#2431.11) — confiance BASSE : reste une suggestion à revoir manuellement, AUCUNE session créée', async () => {
    const { ia, controller, importSessions } = build()
    ia.ragIngest.mockResolvedValue({ success: true, data: { id: 'doc-4' } })
    // Même fixture que `chat-import-classifier.spec.ts` pour `hubspot_export`,
    // confiance BASSE (« email » matche trois sources à égalité, colonne
    // `notes_perso` non reconnue).
    const result = await controller.ingest(user, {
      title: 'hubspot.csv',
      content: 'email,notes_perso\nolivier@acme.fr,texte libre',
      category: 'chat',
    } as RagIngestDto)
    expect(result).toEqual({ success: true, data: { id: 'doc-4', suggestedImportObject: 'account' } })
    expect(importSessions.create).not.toHaveBeenCalled()
  })

  it('#2850 (#2431.11) — une simulation qui échoue ne fait PAS échouer un ingest par ailleurs réussi', async () => {
    const { ia, controller, importSessions } = build()
    ia.ragIngest.mockResolvedValue({ success: true, data: { id: 'doc-5' } })
    importSessions.create.mockRejectedValue(new Error('source retirée du catalogue'))
    const result = await controller.ingest(user, {
      title: 'export.csv',
      content: 'raison sociale,siren\nAcme SAS,123456789',
      category: 'chat',
    } as RagIngestDto)
    expect(result).toEqual({ success: true, data: { id: 'doc-5', suggestedImportObject: 'account' } })
  })

  it('#2850 — n’ajoute RIEN quand le contenu ne matche aucune source (comportement inchangé)', async () => {
    const { ia, controller } = build()
    ia.ragIngest.mockResolvedValue({ success: true, data: { id: 'doc-2' } })
    const result = await controller.ingest(user, {
      title: 'notes.txt',
      content: 'Un simple mémo sans tableau ni colonnes.',
      category: 'chat',
    } as RagIngestDto)
    expect(result).toEqual({ success: true, data: { id: 'doc-2' } })
  })

  it('#2850 — n’ajoute RIEN sur un dépôt de fichier binaire (fileB64), la classification n’a pas de texte', async () => {
    const { ia, controller } = build()
    ia.ragIngest.mockResolvedValue({ success: true, data: { id: 'doc-3' } })
    const result = await controller.ingest(user, {
      title: 'plaquette.pdf',
      fileB64: 'JVBERi0xLjQK',
      filename: 'plaquette.pdf',
      category: 'chat',
    } as RagIngestDto)
    expect(result).toEqual({ success: true, data: { id: 'doc-3' } })
  })

  it('REFUSE le dépôt depuis une salle de démonstration', async () => {
    // Un visiteur ne laisse pas un document de son entreprise sur un espace
    // partagé et remis à neuf entre deux passages — et l'ingestion découpe et
    // vectorise, donc elle coûte. Les documents d'exemple sont déjà seedés.
    const { controller, ia, isDemoWorkspace } = build()
    isDemoWorkspace.mockResolvedValue(true)

    await expect(controller.ingest({ userId: 'u-1' } as never, { title: 'T', content: 'C' } as never)).rejects.toThrow(
      /démonstration/,
    )
    expect(ia.ragIngest).not.toHaveBeenCalled()
  })
})

/**
 * #2667.1 — `POST /rag-documents/ingest/zip` : userId/workspaceId résolus
 * côté serveur (jamais depuis le corps), délégation à `RagZipIngestService`,
 * même refus démo que le dépôt unitaire.
 */
describe('RagController — POST /rag-documents/ingest/zip (#2667.1)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload

  function build() {
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    const isDemoWorkspace = jest.fn().mockResolvedValue(false)
    const workspaceContext = { resolveActiveWorkspace, isDemoWorkspace } as unknown as WorkspaceContextService
    const zipIngest = {
      enqueue: jest.fn().mockResolvedValue({ jobId: 'rag-zip-1', status: 'pending' }),
      status: jest.fn().mockResolvedValue({ jobId: 'rag-zip-1', status: 'running' }),
    } as unknown as jest.Mocked<Pick<RagZipIngestJobService, 'enqueue' | 'status'>>
    const controller = new RagController(
      {} as RagService,
      {} as IaClient,
      workspaceContext,
      zipIngest as unknown as RagZipIngestJobService,
      {} as ImportService,
      {} as ImportWriterService,
    )
    return { controller, resolveActiveWorkspace, isDemoWorkspace, zipIngest }
  }

  it('résout userId/workspaceId côté serveur et délègue au service', async () => {
    const { controller, resolveActiveWorkspace, zipIngest } = build()
    const started = await controller.ingestZip(user, {
      fileB64: 'UEsDBA==',
      filename: 'lot.zip',
      scope: 'conversation',
      conversationId: 'thread-42',
    } as never)

    expect(resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(zipIngest.enqueue).toHaveBeenCalledWith(
      'u-1',
      'ws-1',
      'UEsDBA==',
      expect.objectContaining({ filename: 'lot.zip', scope: 'conversation', conversationId: 'thread-42' }),
    )
    // #3623.11 — rend tout de suite un identifiant, jamais le rapport.
    expect(started).toEqual({ jobId: 'rag-zip-1', status: 'pending' })
  })

  it('#3623.11 — le statut se lit dans l’espace résolu côté serveur', async () => {
    const { controller, zipIngest } = build()
    const status = await controller.ingestZipStatus(user, 'rag-zip-1')
    expect(zipIngest.status).toHaveBeenCalledWith('ws-1', 'rag-zip-1')
    expect(status.status).toBe('running')
  })

  it('REFUSE le dépôt d’une archive depuis une salle de démonstration', async () => {
    const { controller, isDemoWorkspace, zipIngest } = build()
    isDemoWorkspace.mockResolvedValue(true)

    await expect(controller.ingestZip(user, { fileB64: 'UEsDBA==', filename: 'lot.zip' } as never)).rejects.toThrow(
      /démonstration/,
    )
    expect(zipIngest.enqueue).not.toHaveBeenCalled()
  })
})
