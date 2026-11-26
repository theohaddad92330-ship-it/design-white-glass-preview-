import { BadRequestException } from '@nestjs/common'
import { RagZipIngestWorker } from './rag-zip-ingest.worker'
import type { RagZipIngestService } from './rag-zip-ingest.service'

function job() {
  return {
    data: { workspaceId: 'w', userId: 'u', fileB64: 'QUJD', filename: 'a.zip', scope: 'workspace' },
    updateProgress: jest.fn(),
    updateData: jest.fn(),
  }
}

describe('RagZipIngestWorker — #3623.11 : le dépaquetage vit ici, plus dans la requête', () => {
  it('délègue au service avec les identités du job et relaie la progression', async () => {
    const report = { total: 0, outcomes: [] }
    const ingestZip = jest.fn(async (_u, _w, _b, _o, onProgress) => {
      await onProgress({ processed: 1, total: 2 })
      return report
    })
    const j = job()
    const result = await new RagZipIngestWorker({ ingestZip } as unknown as RagZipIngestService).process(j as never)
    expect(result).toBe(report)
    expect(ingestZip).toHaveBeenCalledWith(
      'u',
      'w',
      'QUJD',
      expect.objectContaining({ scope: 'workspace' }),
      expect.any(Function),
    )
    expect(j.updateProgress).toHaveBeenCalledWith({ processed: 1, total: 2 })
  })

  it('un refus en bloc LÈVE (le job devient interrompu) et les octets sont purgés', async () => {
    const ingestZip = jest.fn().mockRejectedValue(new BadRequestException('Archive trop grande'))
    const j = job()
    await expect(
      new RagZipIngestWorker({ ingestZip } as unknown as RagZipIngestService).process(j as never),
    ).rejects.toThrow('Archive trop grande')
    expect(j.updateData).toHaveBeenCalledWith(expect.objectContaining({ fileB64: '' }))
  })
})
