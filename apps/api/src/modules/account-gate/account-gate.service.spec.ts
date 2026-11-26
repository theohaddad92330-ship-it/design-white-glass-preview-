import { BadRequestException, NotFoundException } from '@nestjs/common'
import { AccountGateService } from './account-gate.service'
import { DEFAULT_PARK_REASONS } from '@bellum/contracts'

/**
 * La porte G1 (BEL-CRM-102).
 *
 * L'interdit que ces tests tiennent : un compte écarté ne redevient pas
 * prioritaire d'un geste. Sans ça, le motif de l'écartement — le seul
 * apprentissage que produit un « non » — disparaît au premier revirement, et
 * Découvrir se remet à proposer un compte que trois personnes ont refusé.
 */
describe('AccountGateService', () => {
  const build = (account: Record<string, unknown> | null) => {
    const insert = {
      insert: jest.fn(() => insert),
      values: jest.fn(() => insert),
      orIgnore: jest.fn(() => insert),
      execute: jest.fn(),
    }
    const accounts = {
      findOne: jest.fn().mockResolvedValue(account),
      save: jest.fn(async (row: Record<string, unknown>) => row),
    }
    const parkReasons = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => insert),
    }
    return { service: new AccountGateService(accounts as never, parkReasons as never), accounts, insert }
  }

  const account = (over: Record<string, unknown> = {}) => ({
    id: 'a-1',
    workspace_id: 'w-1',
    priority_gate: 'pending',
    gate_reason: null,
    gate_decided_at: null,
    gate_decided_by: null,
    ...over,
  })

  it('priorise sans demander de motif — un formulaire hebdomadaire se contourne', async () => {
    const { service } = build(account())
    const result = await service.decide('w-1', 'a-1', 'prioritised', null, 'u-1')
    expect(result.priority_gate).toBe('prioritised')
    expect(result.gate_reason).toBeNull()
  })

  it('garde QUI a décidé — #3262 (BEL-SC-233)', async () => {
    const { service, accounts } = build(account())
    const result = await service.decide('w-1', 'a-1', 'parked', 'Pas de budget', 'u-42')
    expect(result.gate_decided_by).toBe('u-42')
    expect(accounts.save).toHaveBeenCalledWith(expect.objectContaining({ gate_decided_by: 'u-42' }))
  })

  it('sans auteur transmis, ne devine personne', async () => {
    const { service } = build(account())
    const result = await service.decide('w-1', 'a-1', 'prioritised', null, null)
    expect(result.gate_decided_by).toBeNull()
  })

  it('refuse d’écarter sans motif', async () => {
    const { service } = build(account())
    await expect(service.decide('w-1', 'a-1', 'parked', '  ')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('mémorise le motif au catalogue de l’espace', async () => {
    const { service, insert } = build(account())
    await service.decide('w-1', 'a-1', 'parked', 'Concurrent installé')
    expect(insert.values).toHaveBeenCalledWith(expect.objectContaining({ label: 'Concurrent installé' }))
  })

  it('REFUSE parked → prioritised sans repasser par la question', async () => {
    const { service } = build(account({ priority_gate: 'parked', gate_reason: 'Hors cible' }))
    await expect(service.decide('w-1', 'a-1', 'prioritised', null)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('laisse rouvrir la question, puis prioriser', async () => {
    const { service } = build(account({ priority_gate: 'parked', gate_reason: 'Hors cible' }))
    const reopened = await service.decide('w-1', 'a-1', 'pending', null)
    // Le motif tombe en même temps que l'écartement : le garder afficherait
    // « hors cible » à côté d'un compte redevenu à qualifier.
    expect(reopened.gate_reason).toBeNull()
  })

  it('rend 404 sur un compte d’un autre espace', async () => {
    const { service } = build(null)
    await expect(service.decide('w-1', 'a-9', 'prioritised', null)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('propose les motifs par défaut sans les insérer — sept zéros d’usage ne sont pas un catalogue tenu', async () => {
    const { service } = build(account())
    const { items } = await service.listReasons('w-1', 'fr')
    // Le catalogue s'élargit avec le tome 1 §11.5 (« pas intéressé », « ne plus
    // me contacter », « mauvais timing »). Ce que le test garde n'est pas le
    // NOMBRE — il grandira encore — mais le fait qu'aucun motif par défaut ne
    // soit inséré en base : un catalogue qu'on n'a pas tenu ne doit pas
    // s'afficher avec des compteurs d'usage à zéro.
    expect(items.length).toBe(DEFAULT_PARK_REASONS.length)
    expect(items.every(item => item.used === false)).toBe(true)
  })
})
