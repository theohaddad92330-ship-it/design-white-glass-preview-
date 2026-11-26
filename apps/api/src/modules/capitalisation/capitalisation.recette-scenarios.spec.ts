import { BadRequestException } from '@nestjs/common'
import { CapitalisationService } from './capitalisation.service'

/**
 * #2424.16 — recette groupée des neuf scénarios du chapitre Delivery REX /
 * Proof Library (mission interrompue, chiffre non confirmé, contradiction,
 * second retour, témoignage sans accord…).
 *
 * Aucun de ces neuf comportements n'est nouveau : chacun est déjà gardé,
 * unitairement, ailleurs dans `capitalisation.service.spec.ts`. Ce qui
 * manquait — et que le registre notait — c'est une suite qui les réunit
 * comme un parcours de recette nommé, pour vérifier d'un coup que le
 * chapitre tient debout dans son ensemble plutôt qu'en fragments épars.
 */
describe('Capitalisation — recette groupée des neuf scénarios (#2424.16)', () => {
  const build = (
    over: {
      proofs?: unknown[]
      missions?: unknown[]
      rex?: unknown[]
      existingRex?: unknown
      oneProof?: unknown
    } = {},
  ) => {
    const proofs = {
      find: jest.fn().mockResolvedValue(over.proofs ?? []),
      findOne: jest.fn().mockResolvedValue(over.oneProof ?? null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'p-1', created_at: new Date(), ...value })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    }
    const rex = {
      find: jest.fn().mockResolvedValue(over.rex ?? []),
      findOne: jest.fn().mockResolvedValue(over.existingRex ?? null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'r-1', collected_at: new Date(), ...value })),
    }
    const testimonials = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 't-1', created_at: new Date(), ...value })),
    }
    const missions = {
      find: jest.fn().mockResolvedValue(over.missions ?? []),
      findOne: jest.fn().mockResolvedValue(null),
    }
    const accounts = { find: jest.fn().mockResolvedValue([]) }
    const needs = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) }
    const auditLog = { save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'audit-1', ...value })) }
    // BEL-SC-243 (#3272) — EN DERNIER, même règle que `needs`/`auditLog` ci-dessus.
    const lostDealRex = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'ldr-1', created_at: new Date(), ...value })),
    }
    const lostDealRuleProposals = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'ldp-1', created_at: new Date(), ...value })),
    }
    // #3210 — les opportunités `lost`, non couvertes par ces neuf scénarios.
    const projects = { find: jest.fn().mockResolvedValue([]) }
    return {
      service: new CapitalisationService(
        proofs as never,
        rex as never,
        testimonials as never,
        missions as never,
        accounts as never,
        needs as never,
        auditLog as never,
        projects as never,
        lostDealRex as never,
        lostDealRuleProposals as never,
        { find: jest.fn().mockResolvedValue([]) } as never, // accountPartners (#3210.1)
        { find: jest.fn().mockResolvedValue([]) } as never, // contacts (#3210.1, lot R17)
        { find: jest.fn().mockResolvedValue([]) } as never, // outreachMessages (#3210.1, lot R17)
      ),
      proofs,
      rex,
      missions,
      auditLog,
    }
  }

  it('1. mission interrompue (terminated) sans REX : apparaît en attente', async () => {
    const { service } = build({
      missions: [
        {
          id: 'm-1',
          status: 'terminated',
          label: 'Mission coupée',
          account_id: 'a-1',
          ends_on: new Date(),
          started_on: null,
        },
      ],
      rex: [],
    })
    const result = await service.forAccount('w-1', 'a-1')
    expect(result.pendingRex.map(item => item.mission_id)).toEqual(['m-1'])
  })

  it('2. mission finie par "completed" sans REX : apparaît aussi en attente (non-régression #2424.2)', async () => {
    const { service } = build({
      missions: [
        {
          id: 'm-2',
          status: 'completed',
          label: 'Refonte SI',
          account_id: 'a-1',
          ends_on: new Date(),
          started_on: null,
        },
      ],
      rex: [],
    })
    const result = await service.forAccount('w-1', 'a-1')
    expect(result.pendingRex.map(item => item.mission_id)).toEqual(['m-2'])
  })

  it('3. mission en cours : n’attend jamais de REX, une mission active n’est pas finie', async () => {
    const { service } = build({
      missions: [
        { id: 'm-3', status: 'active', label: 'En cours', account_id: 'a-1', ends_on: null, started_on: null },
      ],
      rex: [],
    })
    const result = await service.forAccount('w-1', 'a-1')
    expect(result.pendingRex).toEqual([])
  })

  it('4. preuve dont le chiffre n’est pas confirmé : reste « declared », jamais promue', async () => {
    const { service } = build()
    const proof = await service.createProof('w-1', 'u-1', { claim: 'Gain de performance non chiffré' })
    expect(proof.strength).toBe('declared')
    expect(proof.scope).toBe('internal')
  })

  it('5. preuve interne (chiffre non confirmé) : n’apparaît jamais dans les preuves mobilisables', async () => {
    const { service, proofs } = build()
    await service.usableProofs('w-1', null)
    expect(proofs.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ scope: 'client_safe' }) }),
    )
  })

  it('6. preuve nominative du compte cible : filtrée sauf si anonymisée — jamais citer un client à lui-même', async () => {
    const { service } = build({
      proofs: [
        {
          id: 'p-1',
          account_id: 'a-1',
          claim: 'x',
          scope: 'client_safe',
          anonymised: false,
          strength: 'measured',
          created_at: new Date(),
        },
        {
          id: 'p-2',
          account_id: 'a-1',
          claim: 'y',
          scope: 'client_safe',
          anonymised: true,
          strength: 'measured',
          created_at: new Date(),
        },
      ],
    })
    const usable = await service.usableProofs('w-1', 'a-1')
    expect(usable.map(proof => proof.id)).toEqual(['p-2'])
  })

  it('7. second retour sur une mission déjà couverte : refusé, une correction remplace, ne contredit pas', async () => {
    const { service } = build({ existingRex: { id: 'r-0' } })
    await expect(
      service.createRex('w-1', 'u-1', { mission_id: '11111111-1111-4111-8111-111111111111', summary: 'Bien passé' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('8. témoignage publiable sans preuve d’accord écrit : refusé à la création', async () => {
    const { service } = build()
    await expect(
      service.createTestimonial('w-1', { quote: 'Excellente équipe.', publishable: true }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('9. suppression d’une preuve : toujours journalisée, jamais un silence sur ce qui disparaît', async () => {
    const { service, proofs, auditLog } = build({ oneProof: { id: 'p-9', workspace_id: 'w-1', claim: 'x' } })
    await service.removeProof('w-1', 'u-3', 'p-9')
    expect(proofs.delete).toHaveBeenCalledWith({ id: 'p-9', workspace_id: 'w-1' })
    expect(auditLog.save).toHaveBeenCalledWith(
      expect.objectContaining({ entity_type: 'proof', entity_id: 'p-9', actor_id: 'u-3' }),
    )
  })
})
