import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { MissionEntity } from '../../database/entities/mission.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ImportWriterService } from './import-writer.service'

/**
 * #2732.1 + #5022.1 (recette prod 31/10) — « l'import n'écrit pas la mission ».
 *
 * Avant ce lot, `mission` se simulait et ne s'écrivait pas : l'écran disait « terminé », /missions restait vide.
 * Ce que ce fichier garde :
 *  1. un fichier valide crée VRAIMENT la mission, rattachée au compte que le fichier NOMME ;
 *  2. une ligne refusée est NOMMÉE avec sa raison (numéro de ligne, société, motif) — jamais un silence ;
 *  3. rien n'est deviné : société inconnue, libellé absent, fin avant début ⇒ refus, pas de compte inventé ;
 *  4. un ré-import ne double pas une mission (clé client + rôle + dates, `DEDUP_KEYS.mission`).
 */

type Ligne = Record<string, unknown>

function monter(options: { existantes?: Ligne[] } = {}) {
  const accounts = {
    find: jest.fn(async () => [{ id: 'acc-1', company_name: 'Société Générale' }]),
  } as unknown as Repository<AccountEntity>
  const créées: Ligne[] = []
  const missions = {
    find: jest.fn(async () => options.existantes ?? []),
    create: jest.fn((value: Ligne) => value),
    save: jest.fn(async (value: Ligne) => {
      créées.push(value)
      return { ...value, id: `mission-${créées.length}` }
    }),
  } as unknown as Repository<MissionEntity>
  const writer = new ImportWriterService(
    accounts,
    {} as unknown as Repository<ContactEntity>,
    {} as unknown as Repository<ProjectEntity>,
    {} as unknown as Repository<ProjectNeedEntity>,
    {} as unknown as Repository<ConsultantEntity>,
    undefined,
    undefined,
    undefined,
    missions,
  )
  return { writer, créées }
}

const ÉCRITURE = { workspaceId: 'ws-1', userId: 'user-1', startAt: 0 }

describe('#2732.1 #5022.1 — la reprise des missions écrit, ou nomme son refus', () => {
  it('crée la mission sur le compte nommé, avec ses dates et son TJM', async () => {
    const { writer, créées } = monter()
    const out = await writer.writeMissions({
      ...ÉCRITURE,
      rows: [
        {
          company: 'Société Générale',
          role: 'Architecte Cloud',
          startDate: '2026-09-01',
          endDate: '2027-03-31',
          dailyRate: 650,
        },
      ],
    })
    expect(out.created).toBe(1)
    expect(out.rejected ?? []).toEqual([])
    expect(créées[0]).toMatchObject({
      workspace_id: 'ws-1',
      user_id: 'user-1',
      account_id: 'acc-1',
      label: 'Architecte Cloud',
      role_title: 'Architecte Cloud',
      started_on: '2026-09-01',
      ends_on: '2027-03-31',
      daily_rate: 650,
      status: 'active',
    })
    expect(out.snapshot).toEqual([{ id: 'mission-1', created: true, fields: {} }])
  })

  it('une mission qui n’a pas commencé naît « ready_to_start » ; sans date de début, on ne devine pas', async () => {
    const { writer, créées } = monter()
    await writer.writeMissions({
      ...ÉCRITURE,
      rows: [
        { company: 'Société Générale', role: 'Futur', startDate: '2999-01-01' },
        { company: 'Société Générale', role: 'Sans dates' },
      ],
    })
    expect(créées[0]).toMatchObject({ status: 'ready_to_start' })
    expect(créées[1]).toMatchObject({ started_on: null, ends_on: null, daily_rate: null })
  })

  it('NOMME chaque ligne refusée avec sa raison — société inconnue, libellé absent, fin avant début', async () => {
    const { writer, créées } = monter()
    const out = await writer.writeMissions({
      ...ÉCRITURE,
      rows: [
        { company: 'Inconnue SA', role: 'Dev' },
        { company: 'Société Générale' },
        { company: 'Société Générale', role: 'Dev', startDate: '2026-10-01', endDate: '2026-09-01' },
        { role: 'Dev sans client' },
        { company: 'Société Générale', role: 'Valide' },
      ],
    })
    expect(créées).toHaveLength(1)
    expect(out.created).toBe(1)
    expect(out.skippedUnknownCompany).toBe(1)
    expect(out.rejected).toEqual([
      { row: 1, reason: 'unknown_company', detail: 'Inconnue SA' },
      { row: 2, reason: 'missing_label', detail: 'Société Générale' },
      { row: 3, reason: 'end_before_start', detail: 'Société Générale' },
      { row: 4, reason: 'missing_company', detail: null },
    ])
  })

  it('un ré-import ne double pas : même compte, même rôle, mêmes dates ⇒ refusé « already_exists »', async () => {
    const { writer, créées } = monter({
      existantes: [
        {
          id: 'm-0',
          account_id: 'acc-1',
          role_title: 'Architecte Cloud',
          started_on: '2026-09-01',
          ends_on: '2027-03-31',
        },
      ],
    })
    const out = await writer.writeMissions({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', role: 'Architecte Cloud', startDate: '2026-09-01', endDate: '2027-03-31' }],
    })
    expect(créées).toHaveLength(0)
    expect(out.created).toBe(0)
    expect(out.rejected).toEqual([{ row: 1, reason: 'already_exists', detail: 'Société Générale' }])
  })
})
