import { describe, expect, it, vi } from 'vitest'
import type { ActionPlanItem } from '@bellum/contracts'
import { createLastOutcomeBatcher } from './account-last-outcome-batch'

const row = (account_id: string) => ({ id: `i-${account_id}`, account_id }) as unknown as ActionPlanItem

describe('createLastOutcomeBatcher — un appel pour N lignes du briefing', () => {
  it('regroupe les demandes du même instant en UN appel et répartit par compte', async () => {
    const fetchMany = vi.fn(async (_ids: readonly string[]) => [row('a1'), row('a2')])
    const batcher = createLastOutcomeBatcher(fetchMany, 0)

    const [a1, a2, a3] = await Promise.all([batcher.load('a1'), batcher.load('a2'), batcher.load('a3')])

    expect(fetchMany).toHaveBeenCalledTimes(1)
    expect(fetchMany).toHaveBeenCalledWith(['a1', 'a2', 'a3'])
    expect(a1?.id).toBe('i-a1')
    expect(a2?.id).toBe('i-a2')
    // Un compte sans issue : rien, jamais une ligne inventée.
    expect(a3).toBeNull()
  })

  it('un même compte demandé deux fois n’est lu qu’une fois, les deux appelants sont servis', async () => {
    const fetchMany = vi.fn(async (_ids: readonly string[]) => [row('a1')])
    const batcher = createLastOutcomeBatcher(fetchMany, 0)

    const [x, y] = await Promise.all([batcher.load('a1'), batcher.load('a1')])

    expect(fetchMany).toHaveBeenCalledWith(['a1'])
    expect(x?.id).toBe('i-a1')
    expect(y?.id).toBe('i-a1')
  })

  it('un échec de lecture rejette chaque demande — il reste nommé, pas transformé en « aucun résultat »', async () => {
    const batcher = createLastOutcomeBatcher(async () => {
      throw new Error('boom')
    }, 0)
    await expect(Promise.all([batcher.load('a1'), batcher.load('a2')])).rejects.toThrow('boom')
  })
})
