import { IsNull } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import type { MissionEntity } from '../../database/entities/mission.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { createMockRepository } from '../../database/test-utils'
import { AccountStrategy5PService } from './account-strategy-5p.service'

const WORKSPACE = 'ws-1'
const ACCOUNT = 'acc-1'

function build() {
  const accounts = createMockRepository<AccountEntity>()
  const contacts = createMockRepository<ContactEntity>()
  const missions = createMockRepository<MissionEntity>()
  const partners = createMockRepository<AccountPartnerEntity>()
  const service = new AccountStrategy5PService(
    accounts as never,
    contacts as never,
    missions as never,
    partners as never,
  )
  return { service, accounts, contacts, missions, partners }
}

describe('AccountStrategy5PService — la maison canonique de la projection 5P', () => {
  it('rend `null` pour un compte hors du périmètre de l’appelant — jamais une projection devinée', async () => {
    const { service, accounts } = build()
    accounts.findOne.mockResolvedValueOnce(null)

    const result = await service.strategyFor(ACCOUNT, WORKSPACE)

    expect(result).toBeNull()
    expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: ACCOUNT, workspace_id: WORKSPACE } })
  })

  it('projette raw_analysis + les contacts DÉJÀ là, sans rien persister', async () => {
    const { service, accounts, contacts } = build()
    accounts.findOne.mockResolvedValueOnce({
      id: ACCOUNT,
      raw_analysis: { pains: [{ pain: 'Migration bloquée', business_impact: null, esn_offer: null, urgency: null }] },
    })
    contacts.find.mockResolvedValueOnce([
      { id: 'c1', full_name: 'Alice Champion', account_id: ACCOUNT, decision_role: 'champion' },
      // Une valeur LEGACY hors taxonomie MEDDIC (voir decisionRoleSchema) ne casse pas la lecture.
      { id: 'c2', full_name: 'Bob Ancien Rôle', account_id: ACCOUNT, decision_role: 'ancienne_valeur' },
    ])

    const strategy = await service.strategyFor(ACCOUNT, WORKSPACE)

    // Un contact supprimé n'est plus une personne du compte (même règle que `findByAccount`).
    expect(contacts.find).toHaveBeenCalledWith({ where: { account_id: ACCOUNT, deleted_at: IsNull() } })
    expect(strategy?.account_id).toBe(ACCOUNT)
    expect(strategy?.problem.operational_problem.value).toBe('Migration bloquée')
    expect(strategy?.people.champions.value).toEqual([{ contactId: 'c1', name: 'Alice Champion' }])
    // Aucune écriture — la façade est en LECTURE seule (doctrine du ticket).
    expect(accounts.save).not.toHaveBeenCalled()
    expect(contacts.save).not.toHaveBeenCalled()
  })

  it('#3277.6/.7 — P4/P5 lisent les missions DU COMPTE et leurs consultants affectés, dans l’espace de l’appelant', async () => {
    const { service, accounts, missions } = build()
    accounts.findOne.mockResolvedValueOnce({ id: ACCOUNT, raw_analysis: {} })
    missions.find.mockResolvedValueOnce([
      { id: 'm1', label: 'Refonte SI', status: 'active' },
      { id: 'm2', label: 'Migration cloud', status: 'completed' },
    ])
    missions.manager.query.mockResolvedValueOnce([
      { mission_id: 'm1', full_name: 'Awa Diallo' },
      { mission_id: 'm2', full_name: 'Paul Roy' },
    ])

    const strategy = await service.strategyFor(ACCOUNT, WORKSPACE)

    expect(missions.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: WORKSPACE, account_id: ACCOUNT } }),
    )
    expect(strategy?.passage.current_consultant.value).toBe('Awa Diallo')
    expect(strategy?.passage.former_consultant.value).toBe('Paul Roy')
    expect(strategy?.proof.mission_rex.value).toBe('Migration cloud')
    expect(strategy?.passage.no_path.value).toBe(false)
  })

  it('#3277.7 — un compte sans mission ne lance AUCUNE requête d’affectation', async () => {
    const { service, accounts, missions } = build()
    accounts.findOne.mockResolvedValueOnce({ id: ACCOUNT, raw_analysis: {} })
    missions.find.mockResolvedValueOnce([])

    const strategy = await service.strategyFor(ACCOUNT, WORKSPACE)

    expect(missions.manager.query).not.toHaveBeenCalled()
    expect(strategy?.passage.no_path.value).toBe(true)
  })

  it('#3277.7 — `partner` et `rank_2` lisent les ESN NON écartées du compte, dans l’espace de l’appelant', async () => {
    const { service, accounts, partners } = build()
    accounts.findOne.mockResolvedValueOnce({ id: ACCOUNT, raw_analysis: {} })
    partners.find.mockResolvedValueOnce([
      { name: 'ALTEN', rank: 'rank1', relationship: 'partner' },
      { name: 'Talan', rank: 'rank2', relationship: 'unknown' },
    ])

    const strategy = await service.strategyFor(ACCOUNT, WORKSPACE)

    expect(partners.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: WORKSPACE, account_id: ACCOUNT, dismissed_at: IsNull() } }),
    )
    expect(strategy?.passage.partner.value).toBe('ALTEN')
    expect(strategy?.passage.rank_2.value).toBe('Talan')
  })

  it('#3684.2 — chaque ESN non écartée est citée avec sa ligne Partenaires et son périmètre', async () => {
    const { service, accounts, partners } = build()
    accounts.findOne.mockResolvedValueOnce({ id: ACCOUNT, raw_analysis: {} })
    partners.find.mockResolvedValueOnce([
      {
        id: 'row-1',
        name: 'Talan',
        rank: 'unknown',
        relationship: 'unknown',
        source: 'analysis',
        placements: 0,
        scope: 'Data',
      },
    ])

    const strategy = await service.strategyFor(ACCOUNT, WORKSPACE)

    // #3667.R1 — même vocabulaire que l'onglet Accès (`personalAccessCertainty`) :
    // sans date connue, une observation seule (ni déclarée ni placée) reste une
    // observation historique, jamais confirmée.
    expect(strategy?.passage.cited_esns).toEqual([
      expect.objectContaining({
        name: 'Talan',
        partner_id: 'row-1',
        scope: 'Data',
        certainty: 'historic_observation',
        freshness: 'undated',
        founded: false,
      }),
    ])
    expect(strategy?.passage.partner.status).toBe('missing')
  })

  it('#3667.R1 — `account_partners.detected_at` fait la fraîcheur de l’ESN citée, la même colonne que l’onglet Accès lit déjà', async () => {
    const { service, accounts, partners } = build()
    accounts.findOne.mockResolvedValueOnce({ id: ACCOUNT, raw_analysis: {} })
    partners.find.mockResolvedValueOnce([
      {
        id: 'row-2',
        name: 'Devoteam',
        rank: 'unknown',
        relationship: 'unknown',
        source: 'analysis',
        placements: 0,
        scope: null,
        detected_at: new Date(),
      },
    ])

    const strategy = await service.strategyFor(ACCOUNT, WORKSPACE)

    // Datée aujourd'hui : une observation seule devient une relation probable
    // (#3473) — pas une observation historique muette, pas confirmée non plus.
    expect(strategy?.passage.cited_esns).toEqual([
      expect.objectContaining({ name: 'Devoteam', certainty: 'probable_relation', freshness: 'fresh' }),
    ])
  })
})
