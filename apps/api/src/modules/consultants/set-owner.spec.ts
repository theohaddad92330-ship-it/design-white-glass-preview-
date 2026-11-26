import { BadRequestException } from '@nestjs/common'
import { ConsultantsService } from './consultants.service'

/**
 * #2185.10 — « Suivi par » : désigner (ou retirer) le référent commercial
 * d'une fiche talent. Même patron que `StaffingService.setClientManager`
 * (#2836) : une garde d'appartenance avant l'écriture, `null` retire
 * l'attribution sans être un état à part.
 */

function serviceWith(row: Record<string, unknown>, memberRows: { user_id: string }[] = []) {
  const saved: Record<string, unknown>[] = []
  const queries: unknown[][] = []
  const repo = {
    findOne: async () => row,
    save: async (entity: Record<string, unknown>) => {
      saved.push(entity)
      return entity
    },
    manager: {
      query: async (_sql: string, params: unknown[]) => {
        queries.push(params)
        return memberRows
      },
    },
  }
  const service = new ConsultantsService(
    repo as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  )
  ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () => row
  ;(service as unknown as { toWire: (r: unknown) => unknown }).toWire = (r: unknown) => r
  return { service, saved, queries }
}

describe('setOwner — le référent commercial de la fiche', () => {
  it('pose le référent quand il appartient à l’espace', async () => {
    const { service, saved } = serviceWith({ id: 'c1', owner_user_id: null }, [{ user_id: 'u2' }])

    const result = await service.setOwner('c1', 'w1', 'u1', 'u2')

    expect(saved).toHaveLength(1)
    expect(saved[0].owner_user_id).toBe('u2')
    expect((result as { owner_user_id: string }).owner_user_id).toBe('u2')
  })

  it('refuse un membre hors de l’espace — jamais une attribution à l’aveugle', async () => {
    const { service, saved } = serviceWith({ id: 'c1', owner_user_id: null }, [])

    await expect(service.setOwner('c1', 'w1', 'u1', 'u2')).rejects.toBeInstanceOf(BadRequestException)
    expect(saved).toHaveLength(0)
  })

  it('retire l’attribution avec `null` — « non attribué », pas un état à part', async () => {
    const { service, saved } = serviceWith({ id: 'c1', owner_user_id: 'u2' })

    await service.setOwner('c1', 'w1', 'u1', null)

    expect(saved[0].owner_user_id).toBeNull()
  })

  it('rend `null` sur une fiche hors du périmètre de l’espace — jamais une écriture à l’aveugle', async () => {
    const { service, saved } = serviceWith({ id: 'c1' })
    ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () => null

    await expect(service.setOwner('missing', 'w1', 'u1', 'u2')).resolves.toBeNull()
    expect(saved).toHaveLength(0)
  })
})
