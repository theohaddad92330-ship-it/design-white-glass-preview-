import { relationStagesBySirenResponseSchema } from '@bellum/contracts'

import { CapitalisationService } from './capitalisation.service'

/**
 * #4289.12 — le STADE DE RELATION par SIREN, lu par le générateur d'alternatives (apps/ia) : le MÊME moteur que
 * les cas similaires (`relationStageOf`), jamais une seconde définition. Le dépôt factice applique vraiment le
 * `where` : un compte d'un AUTRE espace ne répond pas, même à SIREN égal.
 */
type Row = Record<string, unknown>
const matches = (row: Row, where: Row | Row[]): boolean =>
  (Array.isArray(where) ? where : [where]).some(clause => Object.entries(clause).every(([k, v]) => row[k] === v))
const repo = (rows: Row[]) => ({
  find: jest.fn(async ({ where }: { where: Row | Row[] }) => rows.filter(row => matches(row, where))),
})

const build = (accounts: Row[], missions: Row[]) => {
  const accountsRepo = repo(accounts)
  const missionsRepo = repo(missions)
  const service = new CapitalisationService(
    {} as never,
    {} as never,
    {} as never,
    missionsRepo as never,
    accountsRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined as never,
  )
  return { service, accountsRepo, missionsRepo }
}

const WS = 'ws-1'

describe('#4289.12 — relationStagesBySiren (un moteur, deux lecteurs)', () => {
  it('un stade SAISI gagne, et se dit « saisi »', async () => {
    const { service } = build(
      [{ id: 'a1', siren: '111111111', workspace_id: WS, relationship_memory: { relationStage: 'ancien_client' } }],
      [{ account_id: 'a1', workspace_id: WS, status: 'active' }],
    )
    const bySiren = await service.relationStagesBySiren(WS, ['111111111'])
    expect(bySiren).toEqual({ '111111111': { relationStage: 'ancien_client', source: 'saisi' } })
    expect(relationStagesBySirenResponseSchema.safeParse({ bySiren }).success).toBe(true)
  })

  it('à défaut de saisie, une mission en cours ⇒ client actif, « missions »', async () => {
    const { service } = build(
      [{ id: 'a1', siren: '111111111', workspace_id: WS, relationship_memory: null }],
      [{ account_id: 'a1', workspace_id: WS, status: 'active' }],
    )
    expect(await service.relationStagesBySiren(WS, ['111111111'])).toEqual({
      '111111111': { relationStage: 'client_actif', source: 'missions' },
    })
  })

  it('NON : un compte sans saisie ni mission est ABSENT — « on ne sait pas » n’est pas un stade', async () => {
    const { service } = build([{ id: 'a1', siren: '111111111', workspace_id: WS, relationship_memory: {} }], [])
    expect(await service.relationStagesBySiren(WS, ['111111111'])).toEqual({})
  })

  it('REFUS : un compte d’un AUTRE espace au même SIREN ne répond pas', async () => {
    const { service } = build(
      [
        {
          id: 'b1',
          siren: '222222222',
          workspace_id: 'ws-autre',
          relationship_memory: { relationStage: 'client_actif' },
        },
      ],
      [{ account_id: 'b1', workspace_id: 'ws-autre', status: 'active' }],
    )
    expect(await service.relationStagesBySiren(WS, ['222222222'])).toEqual({})
  })

  it('NON : deux comptes du même SIREN en désaccord ⇒ absent, jamais un stade choisi au hasard', async () => {
    const { service } = build(
      [
        { id: 'a1', siren: '111111111', workspace_id: WS, relationship_memory: { relationStage: 'froid' } },
        { id: 'a2', siren: '111111111', workspace_id: WS, relationship_memory: { relationStage: 'client_actif' } },
      ],
      [],
    )
    expect(await service.relationStagesBySiren(WS, ['111111111'])).toEqual({})
  })
})
