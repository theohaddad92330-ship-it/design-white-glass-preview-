import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import { RagController } from './rag.controller'
import type { RagService } from './rag.service'
import type { RagZipIngestJobService } from './rag-zip-ingest-job.service'
import type { ImportService } from '../import/import.service'
import type { ImportWriterService } from '../import/import-writer.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

describe('RagController — list (workspace-scoped, multi-user Phase 2)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload

  it("resolves the caller's active workspace and returns that workspace's documents", async () => {
    const docs = [{ id: 'd1' }, { id: 'd2' }]
    const listForWorkspace = jest.fn().mockResolvedValue(docs)
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' })
    const controller = new RagController(
      { listForWorkspace } as unknown as RagService,
      {} as IaClient,
      { resolveActiveWorkspace } as unknown as WorkspaceContextService,
      {} as RagZipIngestJobService,
      {} as ImportService,
      {} as ImportWriterService,
    )

    const result = await controller.list(user)

    // The JWT userId drives the workspace resolution — never a client-supplied id.
    expect(resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(listForWorkspace).toHaveBeenCalledWith('ws-1', 'u-1') // #2779 — l'auteur, pour ses documents personnels
    expect(result).toBe(docs)
  })
})
