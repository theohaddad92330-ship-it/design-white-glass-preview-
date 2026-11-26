import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { MissionEntity } from '../../database/entities/mission.entity'
import type { WeakestLinkDiagnosisEntity } from '../../database/entities/weakest-link-diagnosis.entity'
import { createMockRepository } from '../../database/test-utils'
import { WeakestLinkDiagnosisService } from './weakest-link-diagnosis.service'

const WORKSPACE = 'ws-1'

function build() {
  const accounts = createMockRepository<AccountEntity>()
  const contacts = createMockRepository<ContactEntity>()
  const actionPlanItems = createMockRepository<ActionPlanItemEntity>()
  const projects = createMockRepository<ProjectEntity>()
  const consultants = createMockRepository<ConsultantEntity>()
  const diagnoses = createMockRepository<WeakestLinkDiagnosisEntity>()
  const missions = createMockRepository<MissionEntity>()
  missions.find.mockResolvedValue([])
  const service = new WeakestLinkDiagnosisService(
    accounts as never,
    contacts as never,
    actionPlanItems as never,
    projects as never,
    consultants as never,
    diagnoses as never,
    missions as never,
  )
  return { service, accounts, contacts, actionPlanItems, projects, consultants, diagnoses, missions }
}

function openAccount(id: string): Partial<AccountEntity> {
  return { id, company_name: `Compte ${id}`, workspace_id: WORKSPACE, commercial_status: 'opportunity' }
}

describe('WeakestLinkDiagnosisService — la maison canonique du diagnostic du maillon faible', () => {
  it('désigne « absence de suivi » quand la majorité des comptes ouverts n’ont ni prochaine action ni sponsor', async () => {
    const { service, accounts, contacts, actionPlanItems, projects, consultants, diagnoses } = build()
    const openAccounts = Array.from({ length: 9 }, (_, i) => openAccount(`acc-${i}`))
    accounts.find.mockResolvedValueOnce(openAccounts)
    // Deux comptes (acc-0, acc-1) ont une prochaine action active.
    actionPlanItems.find.mockResolvedValueOnce([
      { account_id: 'acc-0', execution_status: 'todo' },
      { account_id: 'acc-1', execution_status: 'todo' },
    ])
    // Aucun contact sponsor nulle part.
    contacts.find.mockResolvedValueOnce([])
    projects.find.mockResolvedValueOnce([])
    consultants.find.mockResolvedValueOnce([])
    diagnoses.find.mockResolvedValueOnce([]) // pas d'historique

    const result = await service.diagnoseFor(WORKSPACE)

    expect(accounts.find).toHaveBeenCalledWith({
      where: { workspace_id: WORKSPACE, commercial_status: expect.anything(), status: expect.anything() },
      select: ['id', 'company_name', 'assigned_to'],
    })
    expect(result.primary_bottleneck?.family).toBe('absence_de_suivi_ou_de_prochaine_action')
    expect(diagnoses.save).toHaveBeenCalledTimes(1)
  })

  it('explique le changement en comparant au dernier diagnostic persisté de cet espace', async () => {
    const { service, accounts, contacts, actionPlanItems, projects, consultants, diagnoses } = build()
    accounts.find.mockResolvedValueOnce([openAccount('acc-0')])
    actionPlanItems.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([{ account_id: 'acc-0', decision_role: 'economic' }])
    projects.find.mockResolvedValueOnce([])
    consultants.find.mockResolvedValueOnce([])
    diagnoses.find.mockResolvedValueOnce([
      {
        workspace_id: WORKSPACE,
        computed_at: new Date('2026-09-20T00:00:00Z'),
        primary_bottleneck: { family: 'absence_de_suivi_ou_de_prochaine_action' },
        secondary_bottlenecks: [],
        not_evaluable_families: [],
        confidence: 'medium',
        change_explanation: null,
      },
    ])

    const result = await service.diagnoseFor(WORKSPACE)

    expect(result.change_explanation).not.toBeNull()
    expect(diagnoses.save).toHaveBeenCalledTimes(1)
  })

  it('#3294 — la marge des missions actives devient un maillon : sous le plancher de la cible, hors du compte quand non chiffrée', async () => {
    const { service, accounts, contacts, actionPlanItems, projects, consultants, diagnoses, missions } = build()
    accounts.find.mockResolvedValueOnce([])
    actionPlanItems.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([])
    projects.find.mockResolvedValueOnce([])
    consultants.find.mockResolvedValueOnce([])
    diagnoses.find.mockResolvedValueOnce([])
    missions.find.mockResolvedValueOnce([
      { id: 'm1', daily_rate: 60000, daily_cost: 52000 }, // 13 % — sous 25 %
      { id: 'm2', daily_rate: 60000, daily_cost: 50000 }, // 17 %
      { id: 'm3', daily_rate: 60000, daily_cost: 30000 }, // 50 %
      { id: 'm4', daily_rate: 60000, daily_cost: null }, // non chiffrée : hors du compte
    ])

    const result = await service.diagnoseFor(WORKSPACE)

    expect(result.primary_bottleneck?.family).toBe('marge_trop_faible')
    expect(result.primary_bottleneck?.supporting_evidence[0]).toMatch(/2 mission\(s\) chiffrée\(s\) sur 3/)
    expect(result.primary_bottleneck?.business_impact).toMatch(/1 mission\(s\) sans marge mesurable/)
    expect(missions.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: ['id', 'daily_rate', 'daily_cost', 'ends_on', 'renewal_status'] }),
    )
  })

  it('#3294 — rituels et dépendance : un point hebdomadaire jamais marqué et un porteur à 7 comptes sur 8 sont lus des données', async () => {
    const { service, accounts, contacts, actionPlanItems, projects, consultants, diagnoses } = build()
    const owned = (id: string, owner: string | null) => ({ ...openAccount(id), assigned_to: owner })
    accounts.find.mockResolvedValueOnce([
      ...Array.from({ length: 7 }, (_, i) => owned(`a${i}`, 'u1')),
      owned('a7', 'u2'),
    ])
    // Tous les comptes ont action ET sponsor : seuls les deux nouveaux signaux peuvent parler.
    actionPlanItems.find.mockResolvedValueOnce(Array.from({ length: 8 }, (_, i) => ({ account_id: `a${i}` })))
    // Deux contacts par compte : la famille « comptes non étendus » (#3294) reste silencieuse ici.
    contacts.find.mockResolvedValueOnce(Array.from({ length: 16 }, (_, i) => ({ account_id: `a${i % 8}` })))
    projects.find.mockResolvedValueOnce([])
    consultants.find.mockResolvedValueOnce([])
    diagnoses.find.mockResolvedValueOnce([])
    diagnoses.manager.query.mockResolvedValueOnce([{ ritual_key: 'daily', held_at: new Date() }])

    const result = await service.diagnoseFor(WORKSPACE)

    const families = [result.primary_bottleneck, ...result.secondary_bottlenecks].map(b => b?.family)
    expect(families).toEqual(['absence_de_rituels', 'dependance_a_une_seule_personne'])
    // Doctrine : aucun nom de porteur dans le diagnostic.
    expect(JSON.stringify(result)).not.toMatch(/u1|u2/)
  })

  it('#3294 — comptes non étendus : des comptes ouverts qui ne tiennent que sur un contact sont lus des données, sans nom', async () => {
    const { service, accounts, contacts, actionPlanItems, projects, consultants, diagnoses } = build()
    accounts.find.mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => openAccount(`e${i}`)))
    actionPlanItems.find.mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({ account_id: `e${i}` })))
    // 4 comptes à un seul contact, 1 à deux : 4 sur 5 ne tiennent que sur une personne.
    contacts.find.mockResolvedValueOnce([
      ...Array.from({ length: 5 }, (_, i) => ({ account_id: `e${i}` })),
      { account_id: 'e4' },
    ])
    projects.find.mockResolvedValueOnce([])
    consultants.find.mockResolvedValueOnce([])
    diagnoses.find.mockResolvedValueOnce([])

    const result = await service.diagnoseFor(WORKSPACE)

    expect(result.primary_bottleneck?.family).toBe('comptes_ouverts_non_etendus')
    expect(result.primary_bottleneck?.business_impact).toMatch(/4 compte\(s\) ouvert\(s\) sur 5/)
    expect(result.not_evaluable_families.map(f => f.family)).not.toContain('comptes_ouverts_non_etendus')
  })

  it('#3294 — capacité commerciale : les heures déclarées par l’espace face aux comptes ouverts sont lues du réglage', async () => {
    const { service, accounts, contacts, actionPlanItems, projects, consultants, diagnoses } = build()
    accounts.find.mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => openAccount(`c${i}`)))
    actionPlanItems.find.mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => ({ account_id: `c${i}` })))
    contacts.find.mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => ({ account_id: `c${i % 10}` })))
    projects.find.mockResolvedValueOnce([])
    consultants.find.mockResolvedValueOnce([])
    diagnoses.find.mockResolvedValueOnce([])
    diagnoses.manager.query
      .mockResolvedValueOnce([]) // rituels : aucune marque
      .mockResolvedValueOnce([{ weekly_available_hours: 6 }]) // 6 h pour 10 comptes

    const result = await service.diagnoseFor(WORKSPACE)

    expect(result.primary_bottleneck?.family).toBe('capacite_commerciale_trop_faible')
    expect(result.primary_bottleneck?.business_impact).toMatch(/6 h\/semaine disponibles pour 10 comptes/)
  })

  it('#3294 — heures non déclarées ou lecture en échec : capacité NON ÉVALUABLE, jamais « 0 heure »', async () => {
    for (const settingsRead of [
      (q: jest.Mock) => q.mockResolvedValueOnce([]).mockResolvedValueOnce([{ weekly_available_hours: null }]),
      (q: jest.Mock) => q.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('colonne illisible')),
    ]) {
      const { service, accounts, contacts, actionPlanItems, projects, consultants, diagnoses } = build()
      accounts.find.mockResolvedValueOnce([openAccount('z1')])
      actionPlanItems.find.mockResolvedValueOnce([{ account_id: 'z1' }])
      contacts.find.mockResolvedValueOnce([{ account_id: 'z1' }, { account_id: 'z1' }])
      projects.find.mockResolvedValueOnce([])
      consultants.find.mockResolvedValueOnce([])
      diagnoses.find.mockResolvedValueOnce([])
      settingsRead(diagnoses.manager.query)

      const result = await service.diagnoseFor(WORKSPACE)

      expect(result.not_evaluable_families.map(f => f.family)).toContain('capacite_commerciale_trop_faible')
    }
  })

  it('#3294 — aucune marque de rituel, ou lecture en échec : famille non évaluable, jamais « aucun rituel »', async () => {
    const { service, accounts, contacts, actionPlanItems, projects, consultants, diagnoses } = build()
    accounts.find.mockResolvedValueOnce([])
    actionPlanItems.find.mockResolvedValueOnce([])
    contacts.find.mockResolvedValueOnce([])
    projects.find.mockResolvedValueOnce([])
    consultants.find.mockResolvedValueOnce([])
    diagnoses.find.mockResolvedValueOnce([])
    diagnoses.manager.query.mockRejectedValueOnce(new Error('table illisible'))

    const result = await service.diagnoseFor(WORKSPACE)

    expect(result.primary_bottleneck).toBeNull()
    expect(result.not_evaluable_families.map(f => f.family)).toContain('absence_de_rituels')
  })
  it('X64 / #3294 — voie d’accès et talents : des comptes sans aucun contact et des missions qui finissent sans suite sont lus des données', async () => {
    const { service, accounts, contacts, actionPlanItems, projects, consultants, diagnoses, missions } = build()
    accounts.find.mockResolvedValueOnce(Array.from({ length: 4 }, (_, i) => openAccount(`c${i}`)))
    // Tous les comptes ont une action : le suivi ne parle pas. Seul c0 a un contact (sponsor).
    actionPlanItems.find.mockResolvedValueOnce(Array.from({ length: 4 }, (_, i) => ({ account_id: `c${i}` })))
    contacts.find.mockResolvedValueOnce([{ account_id: 'c0', decision_role: 'economic' }])
    projects.find.mockResolvedValueOnce([])
    consultants.find.mockResolvedValueOnce([])
    diagnoses.find.mockResolvedValueOnce([])
    const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    missions.find.mockResolvedValueOnce([
      { id: 'm1', daily_rate: 60000, daily_cost: 30000, ends_on: inDays(20), renewal_status: null }, // fin proche, sans suite
      { id: 'm2', daily_rate: 60000, daily_cost: 30000, ends_on: inDays(30), renewal_status: 'renouvele' }, // sécurisée
      { id: 'm3', daily_rate: 60000, daily_cost: 30000, ends_on: inDays(300), renewal_status: null }, // fin lointaine
      { id: 'm4', daily_rate: 60000, daily_cost: 30000, ends_on: null, renewal_status: null }, // sans date : hors du compte
    ])

    const result = await service.diagnoseFor(WORKSPACE)

    const families = [result.primary_bottleneck, ...result.secondary_bottlenecks].map(b => b?.family)
    expect(families).toContain('absence_de_voie_dacces')
    expect(families).toContain('talents_mal_securises')
    const talents = [result.primary_bottleneck, ...result.secondary_bottlenecks].find(
      b => b?.family === 'talents_mal_securises',
    )
    expect(talents?.business_impact).toMatch(/1 mission\(s\) active\(s\) sur 3/)
    expect(talents?.business_impact).toMatch(/1 mission\(s\) sans date de fin/)
    expect(result.not_evaluable_families.map(f => f.family)).not.toContain('absence_de_voie_dacces')
  })
  describe('R35 — le semis de la salle démo (`seedDiagnosisFor`)', () => {
    function arm(b: ReturnType<typeof build>): void {
      b.accounts.find.mockResolvedValue([openAccount('acc-0')])
      b.actionPlanItems.find.mockResolvedValue([])
      b.contacts.find.mockResolvedValue([])
      b.projects.find.mockResolvedValue([])
      b.consultants.find.mockResolvedValue([])
      b.diagnoses.find.mockResolvedValue([])
    }

    it('ÉCRIT la ligne même quand un calcul de moins de 60 s est en cache (la purge a vidé la table, pas le cache)', async () => {
      const b = build()
      arm(b)
      await b.service.diagnoseFor(WORKSPACE) // chaud : un lecteur est passé avant la purge
      await new Promise(resolve => setImmediate(resolve))
      b.diagnoses.save.mockClear() // « la purge a effacé l'historique »

      await b.service.seedDiagnosisFor(WORKSPACE)

      expect(b.diagnoses.save).toHaveBeenCalledTimes(1)
    })

    it('ATTEND l’écriture : la salle ne se relit jamais « incomplète » entre la fin du semis et l’INSERT', async () => {
      const b = build()
      arm(b)
      let committed = false
      b.diagnoses.save.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
        committed = true
        return {} as never
      })

      await b.service.seedDiagnosisFor(WORKSPACE)

      expect(committed).toBe(true)
    })

    it('une écriture refusée ne fait pas tomber le semis (journalisée, comme avant)', async () => {
      const b = build()
      arm(b)
      b.diagnoses.save.mockRejectedValue(new Error('db'))

      await expect(b.service.seedDiagnosisFor(WORKSPACE)).resolves.toBeDefined()
    })
  })
})
