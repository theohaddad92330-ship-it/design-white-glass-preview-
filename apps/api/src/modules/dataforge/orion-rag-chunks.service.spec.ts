import { OrionRagChunksService } from './orion-rag-chunks.service'

describe('OrionRagChunksService', () => {
  function build(
    count: number,
    withEmbedding: number,
    guardFou: number,
    byPriorite: { priorite: number; n: number }[],
  ) {
    const chunks = {
      count: jest.fn().mockResolvedValue(count),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ n: withEmbedding }])
        .mockResolvedValueOnce([{ n: guardFou }])
        .mockResolvedValueOnce(byPriorite),
    }
    const service = new OrionRagChunksService(chunks as never)
    return { service, chunks }
  }

  it('rend le compte total, les vecteurs calculés, les garde-fous et la répartition par priorité', async () => {
    const { service } = build(3849, 0, 20, [
      { priorite: 0, n: 235 },
      { priorite: 1, n: 1455 },
      { priorite: 2, n: 2159 },
    ])
    const coverage = await service.coverage()
    expect(coverage).toEqual({
      chunks: 3849,
      withEmbedding: 0,
      guardFouChunks: 20,
      byPrioriteIndexation: { '0': 235, '1': 1455, '2': 2159 },
    })
  })

  it('rend 0 sans lever quand une requête n’a pas de ligne', async () => {
    const { service } = build(0, 0, 0, [])
    const coverage = await service.coverage()
    expect(coverage.withEmbedding).toBe(0)
    expect(coverage.guardFouChunks).toBe(0)
  })
})
