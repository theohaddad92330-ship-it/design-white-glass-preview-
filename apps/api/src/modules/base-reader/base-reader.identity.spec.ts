import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import { BaseReaderService, type BaseReaderScope } from './base-reader.service'

/**
 * #4419.7 — l'identité d'un employeur nommé par une offre, lue dans NOTRE base avant le registre public :
 * les comptes de l'ESPACE qui ont un SIREN, puis la base commune. Un nom présent UNE seule fois avec un
 * SIREN = identité ; deux SIREN différents = aucune identité (on ne devine jamais).
 */

const scope = (workspaceId = 'ws-1'): BaseReaderScope => ({ workspaceId, businessUnitScope: null })

function serviceOf(
  space: Array<Record<string, unknown>>,
  common: Array<Record<string, unknown>>,
  choices: Array<Record<string, unknown>> = [],
) {
  const query = jest.fn(async (sql: string) =>
    sql.includes('employer_identity_choices') ? choices : sql.includes('dataforge_accounts') ? common : space,
  )
  const service = new BaseReaderService({ manager: { query } } as unknown as Repository<AccountEntity>)
  jest.spyOn(service['logger'], 'log').mockImplementation()
  return { service, query }
}

const acc = (name: string, siren: string | null) => ({
  id: 'a1',
  company_name: name,
  sector: null,
  place: null,
  siren,
  business_unit_id: null,
  collected_at: null,
  total: 1,
})

describe('#4419.7 — identityByName', () => {
  it('un compte de l’espace avec SIREN donne l’identité', async () => {
    const { service } = serviceOf([acc('Consort Group', '111111118')], [])
    await expect(service.identityByName(scope(), 'consort group')).resolves.toEqual({
      siren: '111111118',
      name: 'Consort Group',
      origin: 'space',
    })
  })

  it('la base commune répond quand l’espace ne connaît pas le nom', async () => {
    const { service } = serviceOf([], [{ siren: '222222226', name: 'HELPLINE' }])
    await expect(service.identityByName(scope(), 'Helpline')).resolves.toMatchObject({
      siren: '222222226',
      origin: 'common_base',
    })
  })

  it('deux SIREN différents pour le même nom : aucune identité', async () => {
    const { service } = serviceOf([acc('CGI', '111111118')], [{ siren: '222222226', name: 'CGI' }])
    await expect(service.identityByName(scope(), 'CGI')).resolves.toBeNull()
  })

  it('un compte sans SIREN, ou au nom seulement voisin, ne donne rien', async () => {
    const { service } = serviceOf([acc('Smile', null), acc('Smile Group Holding', '333333334')], [])
    await expect(service.identityByName(scope(), 'Smile')).resolves.toBeNull()
  })

  it('REFUS : la lecture de l’espace porte l’espace du demandeur, la base commune aucun espace', async () => {
    const { service, query } = serviceOf([], [])
    await service.identityByName(scope('ws-A'), 'Nexton')
    const space = query.mock.calls.find(
      c => !String(c[0]).includes('dataforge_accounts') && !String(c[0]).includes('employer_identity_choices'),
    )
    const common = query.mock.calls.find(c => String(c[0]).includes('dataforge_accounts'))
    expect((space as unknown as unknown[][])[1][0]).toBe('ws-A')
    expect(JSON.stringify(common)).not.toContain('ws-A')
  })

  it('un nom trop court ne lit rien', async () => {
    const { service, query } = serviceOf([], [])
    await expect(service.identityByName(scope(), 'a')).resolves.toBeNull()
    expect(query).not.toHaveBeenCalled()
  })
})

describe('#4419.8 — le choix du commercial gagne, pour son espace seulement', () => {
  it('un choix posé gagne sur le calcul, même quand la base commune dit autre chose', async () => {
    const { service } = serviceOf(
      [],
      [{ siren: '222222226', name: 'CGI' }],
      [{ siren: '333333334', legal_name: 'CGI FRANCE' }],
    )
    await expect(service.identityByName(scope(), 'CGI')).resolves.toEqual({
      siren: '333333334',
      name: 'CGI FRANCE',
      origin: 'choice',
    })
  })

  it('REFUS : le choix se lit avec l’espace du demandeur (celui d’un autre espace ne se lit pas)', async () => {
    const { service, query } = serviceOf([], [])
    await service.identityByName(scope('ws-B'), 'CGI')
    const call = query.mock.calls.find(c =>
      String(c[0]).includes('employer_identity_choices'),
    ) as unknown as unknown[][]
    expect(call[1][0]).toBe('ws-B')
  })

  it('choisir écrit sous l’espace et la personne, avec un SIREN valide seulement', async () => {
    const { service, query } = serviceOf([], [])
    await service.chooseIdentity(scope('ws-A'), 'user-1', 'Consort Group', { siren: '111111118', name: 'CONSORT' })
    const call = query.mock.calls.find(c =>
      /INSERT INTO employer_identity_choices/.test(String(c[0])),
    ) as unknown as unknown[][]
    expect(call[1]).toEqual(['ws-A', 'consort group', '111111118', 'CONSORT', 'user-1'])
    await expect(service.chooseIdentity(scope('ws-A'), 'user-1', 'X Y', { siren: '12', name: null })).rejects.toThrow(
      'invalid_siren',
    )
  })
})
