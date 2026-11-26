import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RENEWAL_AT_RISK } from '../briefing/since-last-visit'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { InterventionEntity } from '../../database/entities/intervention.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { AccountKnownService } from './account-known.service'

/**
 * #2556 — « connu » se DÉDUIT (#2556.1), et un compte connu propose au moins
 * un mouvement daté et sourcé, ou le dit honnêtement (#2556.2).
 *
 * Le motif que ce fichier vise en premier : un compte importé en masse et
 * jamais travaillé ne doit JAMAIS ressortir « connu » — voir le témoin
 * dédié plus bas, qui casse le prédicat pour vérifier qu'il rougit pour la
 * BONNE raison avant de le remettre en place.
 */
describe('AccountKnownService', () => {
  const missions = { find: jest.fn() }
  const activities = { count: jest.fn() }
  const contacts = { find: jest.fn() }
  const interventions = { count: jest.fn() }

  const WORKSPACE = 'ws1'
  const ACCOUNT = 'a1'
  const NOW = new Date('2026-09-18T09:00:00.000Z')

  let service: AccountKnownService

  beforeEach(async () => {
    jest.resetAllMocks()
    missions.find.mockResolvedValue([])
    activities.count.mockResolvedValue(0)
    contacts.find.mockResolvedValue([])
    interventions.count.mockResolvedValue(0)

    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountKnownService,
        { provide: getRepositoryToken(MissionEntity), useValue: missions },
        { provide: getRepositoryToken(ActivityEntity), useValue: activities },
        { provide: getRepositoryToken(ContactEntity), useValue: contacts },
        { provide: getRepositoryToken(InterventionEntity), useValue: interventions },
      ],
    }).compile()

    service = moduleRef.get(AccountKnownService)
  })

  /* ------------------------------------------------------------------ */
  /*  #2556.1 — la déduction                                            */
  /* ------------------------------------------------------------------ */

  it('aucune mission, aucune activité active → PAS connu', async () => {
    await expect(service.known(WORKSPACE, ACCOUNT)).resolves.toBe(false)
  })

  it('une mission (tout statut confondu) suffit → connu', async () => {
    missions.find.mockResolvedValue([{ id: 'm1' }])
    await expect(service.known(WORKSPACE, ACCOUNT)).resolves.toBe(true)
  })

  it('une activité d’échange (email) suffit → connu', async () => {
    activities.count.mockResolvedValue(1)
    await expect(service.known(WORKSPACE, ACCOUNT)).resolves.toBe(true)
  })

  it('scope workspace + compte : la lecture des missions/activités est bornée aux DEUX', async () => {
    await service.known(WORKSPACE, ACCOUNT)
    expect(missions.find.mock.calls[0]?.[0]?.where).toMatchObject({ workspace_id: WORKSPACE, account_id: ACCOUNT })
    expect(activities.count.mock.calls[0]?.[0]?.where).toMatchObject({ workspace_id: WORKSPACE, account_id: ACCOUNT })
  })

  // Le témoin — #2556 nomme ce risque explicitement dans le brief : un compte
  // importé en masse et jamais travaillé porte des CONTACTS mais aucune
  // mission ni activité. `movements()` ne doit JAMAIS lire les contacts pour
  // décider si le compte est connu — casser cette garantie (répondre `true`
  // dès qu'un contact existe) est précisément le défaut que ce test vise.
  it('témoin — compte importé en masse (contacts présents, AUCUNE activité/mission) → PAS connu', async () => {
    contacts.find.mockResolvedValue([
      { id: 'c1', account_id: ACCOUNT, source: 'import', entity: null, raw_data: null },
      { id: 'c2', account_id: ACCOUNT, source: 'import', entity: null, raw_data: null },
    ])
    const result = await service.movements(WORKSPACE, ACCOUNT, 'ACME', null, NOW)
    expect(result).toEqual({ known: false, since: null, lines: [] })
    // La preuve que les contacts n'ont même pas été lus pour cette décision :
    // `known()` ne dépend d'aucune lecture de contacts.
    expect(contacts.find).not.toHaveBeenCalled()
  })

  /* ------------------------------------------------------------------ */
  /*  #2556.2 — les mouvements, une fois le compte connu                */
  /* ------------------------------------------------------------------ */

  it('compte non connu → movements() ne pose même pas la question (since:null, lines:[])', async () => {
    const result = await service.movements(WORKSPACE, ACCOUNT, 'ACME', null, NOW)
    expect(result).toEqual({ known: false, since: null, lines: [] })
  })

  it('compte connu, rien de neuf → les deux lignes sont mesurées à zéro, jamais absentes', async () => {
    missions.find.mockResolvedValue([{ id: 'm1' }])
    const result = await service.movements(WORKSPACE, ACCOUNT, 'ACME', null, NOW)
    expect(result.known).toBe(true)
    expect(result.since).toBe(new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'job_changes', state: 'ready', count: 0 }),
        expect.objectContaining({ kind: 'missions_moving', state: 'ready', count: 0 }),
      ]),
    )
  })

  it('un contact dont l’employeur courant n’est plus ce compte compte comme une porte neuve', async () => {
    missions.find.mockResolvedValue([{ id: 'm1' }])
    contacts.find.mockResolvedValue([
      { source: 'apollo', entity: null, raw_data: { apolloDetails: { organization: 'Nouvelle Société' } } },
    ])
    const result = await service.movements(WORKSPACE, ACCOUNT, 'ACME', null, NOW)
    expect(result.lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'job_changes', state: 'ready', count: 1 })]),
    )
  })

  it('une mission qui approche son échéance compte comme un mouvement DATÉ', async () => {
    missions.find.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }])
    interventions.count.mockResolvedValue(1)
    const result = await service.movements(WORKSPACE, ACCOUNT, 'ACME', null, NOW)
    expect(interventions.count.mock.calls[0]?.[0]?.where).toMatchObject({ kind: RENEWAL_AT_RISK })
    expect(result.lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'missions_moving', state: 'ready', count: 1 })]),
    )
  })

  it('sans mission, la ligne « missions qui bougent » est un vrai zéro sans interroger la base', async () => {
    activities.count.mockResolvedValue(1) // connu par une activité, pas une mission
    const result = await service.movements(WORKSPACE, ACCOUNT, 'ACME', null, NOW)
    expect(interventions.count).not.toHaveBeenCalled()
    expect(result.lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'missions_moving', state: 'ready', count: 0 })]),
    )
  })

  it('la fenêtre `since` retombe sur la dernière analyse du compte quand elle existe', async () => {
    missions.find.mockResolvedValue([{ id: 'm1' }])
    const previousAnalysisAt = new Date('2026-08-01T00:00:00.000Z')
    const result = await service.movements(WORKSPACE, ACCOUNT, 'ACME', previousAnalysisAt, NOW)
    expect(result.since).toBe(previousAnalysisAt.toISOString())
  })

  it('une lecture de contacts qui échoue rend « non mesuré », jamais un zéro silencieux', async () => {
    missions.find.mockResolvedValue([{ id: 'm1' }])
    contacts.find.mockRejectedValue(new Error('db down'))
    const result = await service.movements(WORKSPACE, ACCOUNT, 'ACME', null, NOW)
    expect(result.lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'job_changes', state: 'unavailable', count: null })]),
    )
  })
})
